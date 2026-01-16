import { createSecretKey } from 'crypto';
import { jwtVerify } from 'jose';
import { updateStatus } from '../../lib/db.js';
import buildSecureHeaders from '../../lib/secure-headers.js';
import { requireAdmin } from '../../lib/auth.js';

export const prerender = false;

// use centralized auth helper

export async function post({ request }){
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  if(!await requireAdmin(request)) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401, headers: { ...base, 'Content-Type': 'application/json' } });

  let body;
  try{ body = await request.json(); } catch(e){ return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers: { ...base, 'Content-Type': 'application/json' } }); }

  const { id, date, period, status, time, name } = body || {};
  if(!id || !date || !status) return new Response(JSON.stringify({ message: 'Missing fields' }), { status: 400, headers: { ...base, 'Content-Type': 'application/json' } });

  try{
    // Mark this update as an admin edit so future automated imports won't overwrite it
    const res = updateStatus({ id, date, period, time, status, name, markEdited: true });
    return new Response(JSON.stringify({ ok: true, res }), { status: 200, headers: { ...base, 'Content-Type': 'application/json' } });
  } catch(e){
    return new Response(JSON.stringify({ message: 'Failed to update' }), { status: 500, headers: { ...base, 'Content-Type': 'application/json' } });
  }
}

export const POST = post;
