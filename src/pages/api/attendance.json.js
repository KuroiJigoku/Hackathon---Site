// API route: GET /api/attendance
// Returns JSON array of attendance, or CSV when ?format=csv
import { getAll, isRevoked, updateStatus } from '../../lib/db.js';
import fs from 'fs';
import path from 'path';
export const prerender = false;
import buildSecureHeaders from '../../lib/secure-headers.js';
import { startScheduler } from '../../lib/scheduler.js';
import { requireAdmin } from '../../lib/auth.js';

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

// auth handled via src/lib/auth.js

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

function parseCSVRows(text){
  if(!text) return [];
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(lines.length === 0) return [];
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const out = [];
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    const obj = {};
    headers.forEach((h,idx)=> obj[h] = (cols[idx]||'').trim());
    out.push(obj);
  }
  return out;
}

export async function get({ request }){
  // Ensure JWT secret configured
  if(!key) return new Response(JSON.stringify({ message: 'Server misconfiguration' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  if(!rateLimit(ip)){
    return new Response(JSON.stringify({ message: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  if(!await requireAdmin(request)) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  // Start scheduler only when an authenticated admin accesses the attendance API
  try{ startScheduler(); } catch(e) { /* ignore */ }

  const url = new URL(request.url);
  const source = url.searchParams.get('source') || 'db';
  const dateParam = url.searchParams.get('date');
  const periodParam = url.searchParams.get('period');

  let rows = [];
  const attUrl = process.env.ATTENDANCE_JSON_URL || process.env.JSON_URL || null;
  const stuUrl = process.env.STUDENTS_JSON_URL || null;
  if(source === 'csv'){
    return new Response(JSON.stringify({ message: 'CSV input deprecated; use remote JSON import (ATTENDANCE_JSON_URL/STUDENTS_JSON_URL) or DB.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if(attUrl){
    // Proxy to remote JSON source and normalize
    try{
      const attendance = await fetchJsonNoCache(attUrl);
      let students = null;
      if(stuUrl) students = await fetchJsonNoCache(stuUrl);

      // Normalize shapes: allow top-level object with arrays, or direct arrays
      let attArray = attendance;
      let stuArray = students;
      if(attendance && !Array.isArray(attendance) && typeof attendance === 'object'){
        attArray = Array.isArray(attendance.attendance) ? attendance.attendance : attendance.records || attendance.rows || [];
        stuArray = stuArray || attendance.students || attendance.students_list || null;
      }
      if(!Array.isArray(attArray)) throw new Error('Attendance JSON must be an array');
      if(stuArray && !Array.isArray(stuArray)) stuArray = null;

      // Build students map (register_no -> { name })
      const studentsMap = new Map();
      if(Array.isArray(stuArray)){
        for(const s of stuArray){
          const id = String(s.register_no || s.registerNo || s.reg_no || s.id || s.studentid || '').trim();
          if(!id) continue;
          studentsMap.set(id, { name: s.name || '' });
        }
      }
      // add any ids found in attendance
      for(const a of attArray){
        const id = String(a.register_no || a.registerNo || a.reg_no || a.id || a.studentid || '').trim();
        if(!id) continue;
        if(!studentsMap.has(id)) studentsMap.set(id, { name: a.name || '' });
      }

      // Group by date::period and keep latest per id by time
      const groups = new Map();
      for(const a of attArray){
        const date = a.date || a.day || null;
        const period = a.period || null;
        const id = String(a.register_no || a.registerNo || a.reg_no || a.id || a.studentid || '').trim();
        if(!id || !date) continue;
        const key = `${date}::${period || ''}`;
        if(!groups.has(key)) groups.set(key, new Map());
        const g = groups.get(key);
        const prev = g.get(id);
        if(!prev) g.set(id, a);
        else {
          const prevTime = prev.time || '';
          const curTime = a.time || '';
          if(curTime && curTime > prevTime) g.set(id, a);
        }
      }

      // Flatten groups into rows and persist to DB; do not overwrite admin-edited rows (updateStatus will skip them)
      const out = [];
      for(const [grpKey, map] of groups.entries()){
        const [date, period] = grpKey.split('::');
        for(const [id, rec] of map.entries()){
          const row = { id, name: (rec.name || studentsMap.get(id)?.name || '').trim(), date, period: period || null, time: rec.time || null, status: (String(rec.status||'')||'present') };
          out.push(row);
          try{ updateStatus({ id: row.id, date: row.date, period: row.period, time: row.time, status: row.status, name: row.name }); } catch(e) { /* ignore individual failures */ }
        }
        for(const [sid, sdet] of studentsMap.entries()){
          if(!map.has(sid)){
            const row = { id: sid, name: sdet.name || '', date, period: period || null, time: null, status: 'absent' };
            out.push(row);
            try{ updateStatus({ id: row.id, date: row.date, period: row.period, time: row.time, status: row.status, name: row.name }); } catch(e) { }
          }
        }
      }

      // After persisting, read back from DB for consistent rendering
      rows = getAll();
    } catch(e){
      // On failure to fetch remote, fall back to DB if available
      try{ rows = getAll(); } catch(err){ rows = []; }
    }
  } else {
    rows = getAll();
  }
  const format = url.searchParams.get('format') || 'json';
  // pagination parameters
  const limit = Math.min( Number(url.searchParams.get('limit') || 1000), 5000 );
  const offset = Math.max( Number(url.searchParams.get('offset') || 0), 0 );
  const slice = rows.slice(offset, offset + limit);

  // common security headers (delivered via server header builder)
  const baseHeaders = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });

  if(format === 'csv'){
    const csvRows = slice.map(r => `${csvEscape(r.name)},${csvEscape(r.id)},${csvEscape(r.date)},${csvEscape(r.status)}`);
    const csv = ['name,id,date,status', ...csvRows].join('\n');
    return new Response(csv, { status: 200, headers: { ...baseHeaders, 'Content-Type': 'text/csv' } });
  }

  // Return JSON with pagination metadata
  const body = { total: rows.length, limit, offset, count: slice.length, data: slice };
  return new Response(JSON.stringify(body), { status: 200, headers: { ...baseHeaders, 'Content-Type': 'application/json' } });
}

// Also respond to POST with 405 (attendance is read-only via GET)
export async function post(){
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  return new Response(JSON.stringify({ message: 'Method Not Allowed' }), { status: 405, headers: { ...base, 'Content-Type': 'application/json' } });
}

// Uppercase aliases for Astro router compatibility
export const GET = get;
export const POST = post;
