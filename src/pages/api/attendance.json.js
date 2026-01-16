// API route: GET /api/attendance
// Returns JSON array of attendance, or CSV when ?format=csv
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

export async function get({ request }){
  if(!await requireAuth(request)) return new Response(JSON.stringify({ message: 'unauth' }), { status: 401 });
  let data = [];
  if(fs.existsSync(DATA_FILE)){
    try { data = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')||'[]'); } catch(e){ data = []; }
  }
  const url = new URL(request.url);
  if(url.searchParams.get('format') === 'csv'){
    // convert to CSV
    const rows = data.map(r => `${(r.name||'')},${(r.id||'')},${(r.date||'')},${(r.status||'')}`);
    const csv = ['name,id,date,status', ...rows].join('\n');
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv' } });
  }
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
