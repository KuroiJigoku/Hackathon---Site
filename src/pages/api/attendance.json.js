import { getAll } from '../../lib/db.js';
import buildSecureHeaders from '../../lib/secure-headers.js';
import { startScheduler } from '../../lib/scheduler.js';
import { requireAdmin, jwtKey as key } from '../../lib/auth.js';

export const prerender = false;

// Simple rate limiter
const RATE_MAP = new Map();
const rateLimit = (ip) => {
  const now = Date.now();
  const entry = RATE_MAP.get(ip) || { count: 0, start: now };
  if (now - entry.start > 60000) { entry.count = 1; entry.start = now; } 
  else { entry.count += 1; }
  RATE_MAP.set(ip, entry);
  return entry.count <= 120;
};

export async function get({ request }) {
  if (!key) return new Response(JSON.stringify({ message: 'Server misconfiguration' }), { status: 500 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!rateLimit(ip)) return new Response(JSON.stringify({ message: 'Rate limit exceeded' }), { status: 429 });

  if (!await requireAdmin(request)) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401 });

  // Start background importer if not already running
  try { startScheduler(); } catch (e) { /* already running */ }

  const url = new URL(request.url);
  const rows = getAll(); // Read directly from the 'good' database

  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 1000);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const slice = rows.slice(offset, offset + limit);

  return new Response(JSON.stringify({
    total: rows.length,
    limit,
    offset,
    count: slice.length,
    data: slice
  }), { 
    status: 200, 
    headers: { 'Content-Type': 'application/json', ...buildSecureHeaders() } 
  });
}

export const GET = get;