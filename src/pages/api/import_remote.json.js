import buildSecureHeaders from '../../lib/secure-headers.js';
import { updateStatus } from '../../lib/db.js';
import { setLast } from '../../lib/remoteImportState.js';
import { requireAdmin } from '../../lib/auth.js';

const IMPORT_SECRET = process.env.IMPORT_SECRET || null;

export const prerender = false;

async function fetchJson(url){
  if(!url) return null;
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.json();
}

// Core importer function: fetch remote JSON(s), normalize and persist to DB.
export async function doRemoteImport(){
  const attUrl = process.env.ATTENDANCE_JSON_URL || process.env.JSON_URL || null;
  const stuUrl = process.env.STUDENTS_JSON_URL || null;
  if(!attUrl) throw new Error('No ATTENDANCE_JSON_URL configured');

  const attendance = await fetchJson(attUrl);
  let students = null;
  if(stuUrl) students = await fetchJson(stuUrl);

  // If the attendance fetch returned an object with keys
  let attArray = attendance;
  let stuArray = students;
  if(attendance && !Array.isArray(attendance) && typeof attendance === 'object'){
    attArray = Array.isArray(attendance.attendance) ? attendance.attendance : attendance.records || [];
    stuArray = stuArray || attendance.students || attendance.students_list || null;
  }

  if(!Array.isArray(attArray)) throw new Error('Attendance JSON must be an array');
  if(stuArray && !Array.isArray(stuArray)) stuArray = null;

  // build set of students; if stuArray missing, derive unique register_no from attendance
  const studentsMap = new Map();
  if(Array.isArray(stuArray)){
    for(const s of stuArray){
      const id = String(s.register_no || s.registerNo || s.reg_no || s.id || s.studentid || '').trim();
      if(!id) continue;
      studentsMap.set(id, { name: s.name || '' });
    }
  }
  for(const a of attArray){
    const id = String(a.register_no || a.registerNo || a.reg_no || a.id || a.studentid || '').trim();
    if(!studentsMap.has(id)) studentsMap.set(id, { name: a.name || '' });
  }

  // Organize attendance by date+period
  const groups = new Map();
  for(const a of attArray){
    const date = a.date || a.day || null;
    const period = a.period || null;
    const id = String(a.register_no || a.registerNo || a.reg_no || a.id || a.studentid || '').trim();
    if(!id || !date) continue;
    const key = `${date}::${period || ''}`;
    if(!groups.has(key)) groups.set(key, new Map());
    const g = groups.get(key);
    // if multiple records for same id, keep latest by time
    const prev = g.get(id);
    if(!prev) g.set(id, a);
    else {
      const prevTime = prev.time || '';
      const curTime = a.time || '';
      if(curTime && curTime > prevTime) g.set(id, a);
    }
  }

  let imported = 0;
  let absents = 0;

  // Upsert present records
  for(const [grpKey, map] of groups.entries()){
    const [date, period] = grpKey.split('::');
    for(const [id, rec] of map.entries()){
      const name = (rec.name || studentsMap.get(id)?.name || '').trim();
      const statusRaw = (rec.status || '') + '';
      const status = (statusRaw && statusRaw.toLowerCase() !== 'null') ? String(statusRaw).toLowerCase() : 'present';
      const time = rec.time || null;
      updateStatus({ id, date, period: period || null, time, status, name });
      imported += 1;
    }
    // Now mark absentees among known students
    for(const [sid, sdet] of studentsMap.entries()){
      if(!map.has(sid)){
        const name = sdet.name || '';
        updateStatus({ id: sid, date, period: period || null, time: null, status: 'absent', name });
        absents += 1;
      }
    }
  }

  const now = new Date().toISOString();
  setLast({ imported, absents, at: now, source: 'remote' });
  return { imported, absents, at: now };
}

export async function post({ request }){
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  // Auth: allow admin sessions or an IMPORT_SECRET for scripted runs
  try{
    const authorized = await requireAdmin(request).catch(()=>false);
    const url = new URL(request.url);
    const qsecret = url.searchParams.get('secret') || null;
    const headerSecret = request.headers.get('x-import-secret') || null;
    const okSecret = IMPORT_SECRET && (IMPORT_SECRET === qsecret || IMPORT_SECRET === headerSecret);
    if(!authorized && !okSecret) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401, headers: { ...base, 'Content-Type': 'application/json' } });

    const res = await doRemoteImport();
    return new Response(JSON.stringify({ ok: true, ...res }), { status: 200, headers: { ...base, 'Content-Type': 'application/json' } });
  } catch(e){
    return new Response(JSON.stringify({ message: 'Import failed', error: String(e) }), { status: 500, headers: { ...base, 'Content-Type': 'application/json' } });
  }
}

export const POST = post;

// Allow GET for manual triggering (works with curl without Origin header in dev)
export async function get({ request }){
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  try{
    // Allow manual GET in dev when secret is provided, or require admin session
    const authorized = await requireAdmin(request).catch(()=>false);
    const url = new URL(request.url);
    const qsecret = url.searchParams.get('secret') || null;
    const okSecret = IMPORT_SECRET && IMPORT_SECRET === qsecret;
    if(!authorized && !okSecret) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401, headers: { ...base, 'Content-Type': 'application/json' } });

    const res = await doRemoteImport();
    return new Response(JSON.stringify({ ok: true, ...res }), { status: 200, headers: { ...base, 'Content-Type': 'application/json' } });
  } catch(e){
    return new Response(JSON.stringify({ message: 'Import failed', error: String(e) }), { status: 500, headers: { ...base, 'Content-Type': 'application/json' } });
  }
}

export const GET = get;
