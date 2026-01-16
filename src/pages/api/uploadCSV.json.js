// API route: POST /api/uploadCSV
// Accepts JSON body { rows: [{ name,id,date,status }] } and appends validated rows to data/attendance.json
import { jwtVerify } from 'jose';
import { createSecretKey } from 'crypto';
import { insertRows, isRevoked } from '../../lib/db.js';
import buildSecureHeaders from '../../lib/secure-headers.js';
export const prerender = false;

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET;
const key = JWT_SECRET ? createSecretKey(Buffer.from(JWT_SECRET)) : null;

function parseCookies(cookieHeader){
  const out = {};
  if(!cookieHeader) return out;
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if(idx > -1){
      const name = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try { out[name] = decodeURIComponent(val); } catch(e){ out[name] = val; }
    }
  });
  return out;
}

async function requireAuth(request){
  if(!key) return false; // JWT secret not configured
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies['sa_token'];
  if(!token) return false;
  try { await jwtVerify(token, key); } catch(e){ return false; }
  // Ensure token is not revoked
  try { if(await isRevoked(token)) return false; } catch(e) { return false; }
  return true;
}

function validateRow(raw){
  if(!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || raw.fullname || '').trim();
  if(!name || name.length > 200) return null;
  const id = String(raw.id ?? raw.studentid ?? '').trim();
  if(!id || id.length > 100) return null;
  const date = String(raw.date || new Date().toISOString().slice(0,10)).trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let status = String(raw.status || 'present').trim().toLowerCase();
  if(!['present','absent','late'].includes(status)) status = 'present';
  return { name, id, date, status };
}

export async function post({ request }){
  // If JWT secret is not configured, reject and instruct to configure env
  if(!JWT_SECRET){
    const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
    return new Response(JSON.stringify({ message: 'Server misconfiguration: JWT_SECRET not set' }), { status: 500, headers: { ...base, 'Content-Type': 'application/json' } });
  }

  if(!await requireAuth(request)){
    const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
    return new Response(JSON.stringify({ message: 'unauth' }), { status: 401, headers: { ...base, 'Content-Type': 'application/json' } });
  }

  let body;
  try { body = await request.json(); } catch(e){
    return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const incoming = Array.isArray(body?.rows) ? body.rows : [];
  const validated = [];
  for(const r of incoming){
    const v = validateRow(r);
    if(v) validated.push(v);
  }

  if(validated.length === 0){
    const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
    return new Response(JSON.stringify({ message: 'No valid rows to append' }), { status: 400, headers: { ...base, 'Content-Type': 'application/json' } });
  }

  try{
    insertRows(validated);
  } catch(e){
    const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
    return new Response(JSON.stringify({ message: 'Failed to persist attendance' }), { status: 500, headers: { ...base, 'Content-Type': 'application/json' } });
  }

  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  return new Response(JSON.stringify({ ok: true, appended: validated.length }), { status: 200, headers: { ...base, 'Content-Type': 'application/json' } });
}

// Accept GET but return 405 for clients requesting wrong method
export async function get(){
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  return new Response(JSON.stringify({ message: 'Method Not Allowed' }), { status: 405, headers: { ...base, 'Content-Type': 'application/json' } });
}

// Uppercase aliases for Astro router compatibility
export const GET = get;
export const POST = post;

