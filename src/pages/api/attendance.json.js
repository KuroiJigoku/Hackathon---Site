// API route: GET /api/attendance
// Returns JSON array of attendance, or CSV when ?format=csv
import { jwtVerify } from 'jose';
import { createSecretKey } from 'crypto';
import { getAll, isRevoked } from '../../lib/db.js';
export const prerender = false;
import buildSecureHeaders from '../../lib/secure-headers.js';

const JWT_SECRET = process.env.JWT_SECRET;
const key = JWT_SECRET ? createSecretKey(Buffer.from(JWT_SECRET)) : null;

// Simple in-memory rate limiter for GET requests (per IP)
const RATE_MAP = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX = 120; // max 120 requests per minute per IP

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
  if(!key) return false;
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies['sa_token'];
  if(!token) return false;
  try { await jwtVerify(token, key); } catch(e){ return false; }
  try { if(await isRevoked(token)) return false; } catch(e){ return false; }
  return true;
}

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

  if(!await requireAuth(request)) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const rows = getAll();
  const url = new URL(request.url);
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
