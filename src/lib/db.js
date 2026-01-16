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
    time TEXT,
    period TEXT,
    status TEXT NOT NULL,
    edited INTEGER DEFAULT 0,
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

// Migration: ensure 'edited' column exists on older DBs
try {
  const cols = db.prepare("PRAGMA table_info('attendance')").all();
  const existingCols = cols.map(c => c.name);

  if (!existingCols.includes('edited')) {
    db.exec("ALTER TABLE attendance ADD COLUMN edited INTEGER DEFAULT 0");
  }
  if (!existingCols.includes('time')) {
    db.exec("ALTER TABLE attendance ADD COLUMN time TEXT");
  }
  if (!existingCols.includes('period')) {
    db.exec("ALTER TABLE attendance ADD COLUMN period TEXT");
  }
} catch (e) {
  console.error("Database migration failed:", e);
}

function insertRows(rows){
  const insert = db.prepare('INSERT INTO attendance (id, name, date, time, period, status, edited) VALUES (?, ?, ?, ?, ?, ?, 0)');
  const insertMany = db.transaction((items) => {
    for(const it of items) insert.run(it.id, it.name, it.date, it.time, it.period, it.status);
  });
  insertMany(rows);
}

function updateStatus({ id, date, period, time, status, name, markEdited = false }){
  // Upsert: if entry exists for id+date+period, update only if not manually edited; else insert
  const existing = db.prepare('SELECT rowid, edited FROM attendance WHERE id = ? AND date = ? AND (period = ? OR period IS NULL)').get(id, date, period);
  if(existing){
    if(existing.edited && !markEdited){
      // preserve admin-edited row — do not overwrite
      return { skipped: true };
    }
    // If this update is coming from an admin edit, set edited flag
    const editedFlag = markEdited ? 1 : (existing.edited || 0);
    db.prepare('UPDATE attendance SET status = ?, time = ?, period = ?, name = COALESCE(?, name), edited = ? WHERE rowid = ?').run(status, time || null, period || null, name || null, editedFlag, existing.rowid);
    return { updated: true };
  }
  db.prepare('INSERT INTO attendance (id, name, date, time, period, status, edited) VALUES (?, ?, ?, ?, ?, ?, 0)').run(id, name || id, date, time || null, period || null, status);
  return { inserted: true };
}

function getAll(){
  return db.prepare('SELECT name,id,date,time,period,status,edited FROM attendance ORDER BY date DESC, name ASC').all();
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

export { insertRows, updateStatus, getAll, revokeToken, isRevoked, DB_PATH };
