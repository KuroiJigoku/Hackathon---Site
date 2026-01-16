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

/**
 * Smart Update Logic:
 * 1. Never overwrites manual admin edits.
 * 2. Only updates if new data is 'better' (Present > Absent) or strictly newer by time.
 */
export function updateStatus({ id, date, period, time, status, name, markEdited = false }) {
  const existing = db.prepare(`
    SELECT rowid, edited, time, status 
    FROM attendance 
    WHERE id = ? AND date = ? AND (period = ? OR (period IS NULL AND ? IS NULL))
  `).get(id, date, period, period);

  if (existing) {
    if (existing.edited && !markEdited) return { skipped: true, reason: 'manual_edit_protected' };

    if (!markEdited) {
      const oldStatus = (existing.status || '').toLowerCase();
      const newStatus = (status || '').toLowerCase();
      const oldTime = existing.time || '';
      const newTime = time || '';

      // Priority: Don't let an 'absent' status overwrite an existing 'present' status
      if (oldStatus === 'present' && newStatus === 'absent') return { skipped: true };
      if (oldTime && newTime && newTime <= oldTime && oldStatus === newStatus) return { skipped: true };
    }

    const editedFlag = markEdited ? 1 : (existing.edited || 0);
    db.prepare(`
      UPDATE attendance SET status = ?, time = ?, period = ?, name = COALESCE(?, name), edited = ? 
      WHERE rowid = ?
    `).run(status, time, period, name, editedFlag, existing.rowid);
    return { updated: true };
  }

  db.prepare('INSERT INTO attendance (id, name, date, time, period, status, edited) VALUES (?, ?, ?, ?, ?, ?, 0)')
    .run(id, name || id, date, time, period, status);
  return { inserted: true };
}

export function getAll() {
  return db.prepare('SELECT name,id,date,time,period,status,edited FROM attendance ORDER BY date DESC, time DESC').all();
}

export { DB_PATH };