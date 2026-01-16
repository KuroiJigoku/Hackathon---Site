import { jwtVerify } from 'jose';
import { createSecretKey } from 'crypto';

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

export async function verifyToken(token){
  if(!key || !token) return null;
  try{
    const { payload } = await jwtVerify(token, key);
    return payload || null;
  } catch(e){ return null; }
}

export async function isAuthenticated(request){
  if(!key) return false;
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies['sa_token'];
  if(!token) return false;
  const payload = await verifyToken(token);
  return !!payload;
}

export async function requireAdmin(request){
  return await isAuthenticated(request);
}

export { key as jwtKey };