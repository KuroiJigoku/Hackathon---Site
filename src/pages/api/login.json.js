// API route: POST /api/login
// Accepts { username, password } and sets an HttpOnly JWT cookie on success.
import argon2 from 'argon2';
import { SignJWT } from 'jose';
import { createSecretKey } from 'crypto';

// Strong defaults and configuration
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || ''; // recommended: argon2id hash
const ADMIN_PASS_PLAIN = process.env.ADMIN_PASS || ''; // empty by default to discourage plaintext
const JWT_SECRET = process.env.JWT_SECRET; // MUST be provided in production

// Fail-fast if JWT secret missing — do not fall back to an insecure default
if (!JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set. Set JWT_SECRET in environment for secure operation.');
}

const key = JWT_SECRET ? createSecretKey(Buffer.from(JWT_SECRET)) : null;

// Simple in-memory rate limiter per IP+username for demo purposes.
const LOGIN_ATTEMPTS = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Pre-compute a dummy hash to make timing similar even for invalid users.
const DUMMY_HASH = await argon2.hash('dummy-password-please-change');

function getClientIP(request){
  const xf = request.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function isBlocked(key){
  const v = LOGIN_ATTEMPTS.get(key);
  if(!v) return false;
  if(v.blockedUntil && Date.now() < v.blockedUntil) return true;
  if(v.first && (Date.now() - v.first) > WINDOW_MS){
    // window expired — reset
    LOGIN_ATTEMPTS.delete(key);
    return false;
  }
  return false;
}

function recordFailure(key){
  const now = Date.now();
  const v = LOGIN_ATTEMPTS.get(key) || { count: 0, first: now };
  v.count = (v.count || 0) + 1;
  if(!v.first) v.first = now;
  if(v.count >= MAX_ATTEMPTS){
    v.blockedUntil = Date.now() + LOCKOUT_MS;
  }
  LOGIN_ATTEMPTS.set(key, v);
}

function resetAttempts(key){ LOGIN_ATTEMPTS.delete(key); }

export async function post({ request }){
  // Require JWT secret configured for secure operation
  if(!key) return new Response(JSON.stringify({ message: 'Server misconfiguration' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let body;
  try { body = await request.json(); } catch(e){
    return new Response(JSON.stringify({ message: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { username, password } = body || {};
  if (!username || !password) return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const ip = getClientIP(request);
  const attemptKey = `${ip}:${username}`;
  if(isBlocked(attemptKey)){
    return new Response(JSON.stringify({ message: 'Too many attempts, try later' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  // Protect against user enumeration and timing attacks by always doing an Argon2 verify
  // Use the configured admin hash when username matches; otherwise verify the DUMMY_HASH.
  let passwordOk = false;
  try{
    if(username === ADMIN_USER && ADMIN_PASS_HASH){
      passwordOk = await argon2.verify(ADMIN_PASS_HASH, password);
    } else if(username === ADMIN_USER && ADMIN_PASS_PLAIN){
      // If a plaintext fallback is configured (not recommended), still run a dummy verify to normalize timing
      await argon2.verify(DUMMY_HASH, password).catch(()=>{});
      passwordOk = (password === ADMIN_PASS_PLAIN);
    } else {
      // Non-matching username: perform dummy verify to mitigate timing attacks
      await argon2.verify(DUMMY_HASH, password).catch(()=>{});
      passwordOk = false;
    }
  } catch(e){
    // On verification errors treat as failure but avoid leaking details
    passwordOk = false;
  }

  if(!passwordOk){
    recordFailure(attemptKey);
    return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // Successful login: clear attempts
  resetAttempts(attemptKey);

  // Create JWT (use HS512 for stronger hashing)
  const token = await new SignJWT({ user: ADMIN_USER })
    .setProtectedHeader({ alg: 'HS512' })
    .setIssuedAt()
    .setExpirationTime('4h')
    .sign(key);

  // Build secure cookie attributes
  const isSecure = (process.env.NODE_ENV === 'production');
  const maxAge = 4 * 3600; // 4 hours
  const cookieParts = [ `sa_token=${encodeURIComponent(token)}`, `HttpOnly`, `Path=/`, `Max-Age=${maxAge}`, `SameSite=Strict` ];
  if(isSecure) cookieParts.push('Secure');

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', cookieParts.join('; '));

  return new Response(JSON.stringify({ message: 'ok' }), { status: 200, headers });
}
