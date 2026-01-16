// API route: POST /api/login
// Accepts { username, password } and sets an HttpOnly JWT cookie on success.
import argon2 from 'argon2';
import { SignJWT } from 'jose';
import { createSecretKey } from 'crypto';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || ''; // recommend argon2 hash
const ADMIN_PASS_PLAIN = process.env.ADMIN_PASS || 'adminpass'; // fallback for demo only
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const key = createSecretKey(Buffer.from(JWT_SECRET));

export async function post({ request }){
  const body = await request.json();
  const { username, password } = body || {};
  if (!username || !password) return new Response(JSON.stringify({ message: 'Invalid' }), { status: 400 });

  if (username !== ADMIN_USER) {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
  }

  let ok = false;
  if (ADMIN_PASS_HASH) {
    // If an argon2 hash is provided via env, verify securely
    try { ok = await argon2.verify(ADMIN_PASS_HASH, password); } catch(e){ ok = false; }
  } else {
    // Demo fallback: plain compare (NOT recommended for production)
    ok = password === ADMIN_PASS_PLAIN;
  }

  if (!ok) return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 });

  const token = await new SignJWT({ user: ADMIN_USER })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('4h')
    .sign(key);

  // Set HttpOnly cookie; Astro-friendly response
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `sa_token=${token}; HttpOnly; Path=/; Max-Age=${4*3600}; SameSite=Strict`);

  return new Response(JSON.stringify({ message: 'ok' }), { status: 200, headers });
}
