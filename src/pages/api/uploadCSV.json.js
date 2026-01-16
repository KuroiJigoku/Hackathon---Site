// API route: POST /api/uploadCSV
// Accepts { rows: [{ name,id,date,status }] } and appends to data/attendance.json
import fs from 'fs';
import path from 'path';
import { jwtVerify } from 'jose';
import { createSecretKey } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const DATA_FILE = path.resolve('./data/attendance.json');
const key = createSecretKey(Buffer.from(JWT_SECRET));

async function requireAuth(request){
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('sa_token='));
  if(!match) return false;
  const token = match.split('=')[1];
  try { await jwtVerify(token, key); return true; } catch(e){ return false; }
}

export async function post({ request }){
  if(!await requireAuth(request)) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401 });
  const body = await request.json();
  const rows = body?.rows || [];
  // ensure data directory exists
  const dir = path.dirname(DATA_FILE);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let existing = [];
  if(fs.existsSync(DATA_FILE)){
    try { existing = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')||'[]'); } catch(e){ existing = []; }
  }
  // Append rows
  const out = existing.concat(rows);
  fs.writeFileSync(DATA_FILE, JSON.stringify(out, null, 2), 'utf8');
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
