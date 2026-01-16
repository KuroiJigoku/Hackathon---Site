// API route: POST /api/logout
// Clears the auth cookie and records token revocation in the DB
import { jwtVerify } from 'jose';
import { createSecretKey } from 'crypto';
import { revokeToken } from '../../lib/db.js';
import buildSecureHeaders from '../../lib/secure-headers.js';
export const prerender = false;

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

export async function post({ request }){
  // Always clear cookie client-side
  const isSecure = (process.env.NODE_ENV === 'production');
  const cookieParts = [ `sa_token=deleted`, `HttpOnly`, `Path=/`, `Max-Age=0`, `Expires=Thu, 01 Jan 1970 00:00:00 GMT`, `SameSite=Strict` ];
  if(isSecure) cookieParts.push('Secure');
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  const headers = new Headers({ ...base, 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', cookieParts.join('; '));

  // If we have a valid JWT secret and token, verify and record revocation
  try{
    if(key){
      const cookieHeader = request.headers.get('cookie') || '';
      const cookies = parseCookies(cookieHeader);
      const token = cookies['sa_token'];
      if(token){
        // Verify to extract claims and ensure token is legitimate before revoking
        const { payload } = await jwtVerify(token, key).catch(() => ({ payload: null }));
        if(payload && payload.exp){
          // payload.exp is seconds since epoch
          revokeToken(token, payload.exp);
        }
      }
    }
  } catch (e) {
    // Don't fail logout on DB or verification errors; cookie will still be cleared
    console.warn('Logout revocation failed', e);
  }

  return new Response(JSON.stringify({ message: 'logged out' }), { status: 200, headers });
}

export async function get({ request }){
  // Allow GET logout in non-production (convenience for curl/dev). Production remains POST-only.
  if(process.env.NODE_ENV !== 'production'){
    // reuse POST logic
    return await post({ request }).catch(()=>{
      const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
      return new Response(JSON.stringify({ message: 'Logout failed' }), { status: 500, headers: { ...base, 'Content-Type': 'application/json' } });
    });
  }
  const base = buildSecureHeaders({ allowUnsafeInlineStyles: process.env.NODE_ENV !== 'production' });
  return new Response(JSON.stringify({ message: 'Method Not Allowed' }), { status: 405, headers: { ...base, 'Content-Type': 'application/json' } });
}

// Uppercase aliases for Astro router compatibility
export const GET = get;
export const POST = post;
