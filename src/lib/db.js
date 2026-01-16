import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'attendance.db');

// Ensure data directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Table for revoked JWTs (simple revocation list)
db.exec(`
  CREATE TABLE IF NOT EXISTS revoked_tokens (
    token TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
`);

function insertRows(rows){
  const insert = db.prepare('INSERT INTO attendance (id, name, date, status) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction((items) => {
    for(const it of items) insert.run(it.id, it.name, it.date, it.status);
  });
  insertMany(rows);
}

function getAll(){
  return db.prepare('SELECT name,id,date,status FROM attendance ORDER BY date DESC, name ASC').all();
}

function revokeToken(token, expiresAt){
  const stmt = db.prepare('INSERT OR REPLACE INTO revoked_tokens (token, expires_at) VALUES (?, ?)');
  stmt.run(token, expiresAt);
}

function isRevoked(token){
  const row = db.prepare('SELECT expires_at FROM revoked_tokens WHERE token = ?').get(token);
  if(!row) return false;
  // clean up expired revocations
  if(row.expires_at <= Math.floor(Date.now()/1000)){
    db.prepare('DELETE FROM revoked_tokens WHERE token = ?').run(token);
    return false;
  }
  return true;
}

export { insertRows, getAll, revokeToken, isRevoked, DB_PATH };
