import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'attendance.db');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Initialize table with modern schema
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

// MIGRATION: Automatically add missing columns to prevent SQLITE_ERROR
try {
  const info = db.prepare("PRAGMA table_info('attendance')").all();
  const columns = info.map(c => c.name);
  if (!columns.includes('time')) db.exec("ALTER TABLE attendance ADD COLUMN time TEXT");
  if (!columns.includes('period')) db.exec("ALTER TABLE attendance ADD COLUMN period TEXT");
  if (!columns.includes('edited')) db.exec("ALTER TABLE attendance ADD COLUMN edited INTEGER DEFAULT 0");
} catch (e) { console.error("Migration failed:", e); }


export function updateStatus({ id, date, period, time, status, name, markEdited = false }) {
  // Use "IS ?" to match values AND NULLs for the period exactly
  const existing = db.prepare(`
    SELECT rowid, edited, time, status 
    FROM attendance 
    WHERE id = ? AND date = ? AND period IS ?
  `).get(id, date, period);

  if (existing) {
    // PROTECT: Never overwrite manual admin edits during auto-imports
    if (existing.edited && !markEdited) return { skipped: true };

    const finalTime = markEdited ? existing.time : (time || existing.time);

    if (!markEdited) {
      const oldStatus = (existing.status || '').toLowerCase();
      const newStatus = (status || '').toLowerCase();
      const oldTime = existing.time || '';
      const newTime = time || '';

      // Logic: Don't let auto-imports overwrite 'present' with 'absent'
      if (oldStatus === 'present' && newStatus === 'absent') return { skipped: true };
      
      // Logic: Don't overwrite with older data
      if (oldTime && newTime && newTime <= oldTime && oldStatus === newStatus) return { skipped: true };
    }

    const editedFlag = markEdited ? 1 : (existing.edited || 0);
    db.prepare(`
      UPDATE attendance 
      SET status = ?, time = ?, period = ?, name = COALESCE(?, name), edited = ? 
      WHERE rowid = ?
    `).run(status, finalTime, period, name || null, editedFlag, existing.rowid);
    return { updated: true };
  }

  // Insert if it's a new unique record (ID + Date + Period)
  db.prepare('INSERT INTO attendance (id, name, date, time, period, status, edited) VALUES (?, ?, ?, ?, ?, ?, 0)')
    .run(id, name || id, date, time || null, period || null, status);
  return { inserted: true };
}

export function getAll() {
  // Sort by date and time for consistent dashboard rendering.
  return db.prepare('SELECT name,id,date,time,period,status,edited FROM attendance ORDER BY date DESC, time DESC, name ASC').all();
}

export { DB_PATH };