// API route: GET /api/attendance
// Returns JSON array of attendance, or CSV when ?format=csv
import { getAll, updateStatus } from '../../lib/db.js';
export const prerender = false;
import buildSecureHeaders from '../../lib/secure-headers.js';
import { startScheduler } from '../../lib/scheduler.js';
import { requireAdmin, jwtKey as key } from '../../lib/auth.js';

async function fetchJsonNoCache(url){
  if(!url) return null;
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.json();
}

// Simple in-memory rate limiter for GET requests (per IP)
const RATE_MAP = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX = 120; // max 120 requests per minute per IP

function rateLimit(ip){
  const now = Date.now();
  const entry = RATE_MAP.get(ip) || { count: 0, start: now };
  if(now - entry.start > RATE_WINDOW_MS){
    entry.count = 1;
    entry.start = now;
  } else {
    entry.count += 1;
  }
  RATE_MAP.set(ip, entry);
  return entry.count <= RATE_MAX;
}

function csvEscape(s){
  if(s == null) return '';
  const str = String(s);
  if(/[,"\r\n]/.test(str)){
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function get({ request }){
  // Ensure JWT secret configured
  if(!key) return new Response(JSON.stringify({ message: 'Server misconfiguration' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  if(!rateLimit(ip)){
    return new Response(JSON.stringify({ message: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  // Auth: Verify admin session
  if(!await requireAdmin(request)) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  // Start background scheduler
  try{ startScheduler(); } catch(e) { /* ignore */ }

  const url = new URL(request.url);
  const source = url.searchParams.get('source') || 'db';

  let rows = [];
  const attUrl = process.env.ATTENDANCE_JSON_URL || process.env.JSON_URL || null;
  const stuUrl = process.env.STUDENTS_JSON_URL || null;

  if(source === 'csv'){
    return new Response(JSON.stringify({ message: 'CSV input deprecated; use remote JSON import.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if(attUrl){
    try{
      const attendance = await fetchJsonNoCache(attUrl);
      let students = null;
      if(stuUrl) students = await fetchJsonNoCache(stuUrl);

      // Normalize shapes
      let attArray = attendance;
      let stuArray = students;
      if(attendance && !Array.isArray(attendance) && typeof attendance === 'object'){
        attArray = Array.isArray(attendance.attendance) ? attendance.attendance : attendance.records || attendance.rows || [];
        stuArray = stuArray || attendance.students || attendance.student || attendance.students_list || null;
      }
      if(!Array.isArray(attArray)) throw new Error('Attendance JSON must be an array');

      const studentsMap = new Map();
      if(Array.isArray(stuArray)){
        for(const s of stuArray){
          const id = String(s.register_no || s.registerNo || s.id || '').trim();
          if(!id) continue;
          studentsMap.set(id, { name: s.name || '' });
        }
      }

      // INTEGRATED: Add any IDs found in attendance
      for (const a of attArray) {
        const id = String(a.register_no || '').trim();
        if (!id) continue;
        if (!studentsMap.has(id)) {
          studentsMap.set(id, { name: a.name || '' });
        }
      }

      // INTEGRATED: Group by date::period and keep the latest record per ID by time
      const groups = new Map();
      for (const a of attArray) {
        const date = a.date;
        const period = a.period;
        const id = String(a.register_no || '').trim();
        
        if (!id || !date) continue;

        const groupKey = `${date}::${period || ''}`;
        if (!groups.has(groupKey)) groups.set(groupKey, new Map());
        
        const g = groups.get(groupKey);
        const prev = g.get(id);

        if (!prev) {
          g.set(id, a);
        } else {
          const prevTime = prev.time || '';
          const curTime = a.time || '';
          if (curTime > prevTime) {
            g.set(id, a);
          }
        }
      }

      // Flatten and persist
      for(const [grpKey, map] of groups.entries()){
        const [date, period] = grpKey.split('::');
        for(const [id, rec] of map.entries()){
          // Normalize status to lowercase for dashboard badges
          const status = String(rec.status || 'present').toLowerCase();
          const row = { id, name: (rec.name || studentsMap.get(id)?.name || '').trim(), date, period: period || null, time: rec.time || null, status };
          
          try{ updateStatus({ id: row.id, date: row.date, period: row.period, time: row.time, status: row.status, name: row.name }); } catch(e) { }
        }
        // Handle absentees
        for(const [sid, sdet] of studentsMap.entries()){
          if(!map.has(sid)){
            try{ updateStatus({ id: sid, date, period: period || null, time: null, status: 'absent', name: sdet.name || '' }); } catch(e) { }
          }
        }
      }

      rows = getAll();
    } catch(e){
      console.error('Fetch error:', e.message);
      try{ rows = getAll(); } catch(err){ rows = []; }
    }
  } else {
    rows = getAll();
  }

  const format = url.searchParams.get('format') || 'json';
  const limit = Math.min( Number(url.searchParams.get('limit') || 1000), 5000 );
  const offset = Math.max( Number(url.searchParams.get('offset') || 0), 0 );
  const slice = rows.slice(offset, offset + limit);

  const baseHeaders = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });

  if(format === 'csv'){
    const csvRows = slice.map(r => `${csvEscape(r.name)},${csvEscape(r.id)},${csvEscape(r.date)},${csvEscape(r.status)}`);
    const csv = ['name,id,date,status', ...csvRows].join('\n');
    return new Response(csv, { status: 200, headers: { ...baseHeaders, 'Content-Type': 'text/csv' } });
  }

  const body = { total: rows.length, limit, offset, count: slice.length, data: slice };
  return new Response(JSON.stringify(body), { status: 200, headers: { ...baseHeaders, 'Content-Type': 'application/json' } });
}

export async function post(){
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  return new Response(JSON.stringify({ message: 'Method Not Allowed' }), { status: 405, headers: { ...base, 'Content-Type': 'application/json' } });
}

export const GET = get;
export const POST = post;