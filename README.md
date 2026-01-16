# Smart Attendance — Astro Demo

Demo website for the Smart Attendance System (Team 7). This is a minimal Astro-based demo that supports an Admin login, CSV upload for daily attendance, and CSV export.

Quick start

1. Install dependencies:

```bash
npm install
```

2. Create an `.env` file or set environment variables:

- `ADMIN_USER` (default: `admin`)
- `ADMIN_PASS` (demo plaintext fallback, default: `adminpass`) or `ADMIN_PASS_HASH` (bcrypt hash — recommended)
- `JWT_SECRET` (default used for demo if unset)

3. Run dev server:

```bash
npm run dev
```

Notes
- This demo uses an HttpOnly JWT cookie for session handling. For production, set `ADMIN_PASS_HASH` to an `argon2` hash and a strong `JWT_SECRET`.
- Implementation notes: the demo uses `argon2` for secure password hashing and `jose` for modern JWT creation and verification.

Generating secrets

Use the included script to generate a secure `ADMIN_PASS_HASH` and `JWT_SECRET` (requires project dependencies installed):

```bash
npm install
node scripts/generate_secrets.mjs        # prompts for password and prints values
node scripts/generate_secrets.mjs --pass yourPassword --write   # non-interactive, writes to .env
```

The script writes `ADMIN_PASS_HASH` and `JWT_SECRET` into `.env` when `--write` is supplied.
- Attendance is stored in `data/attendance.json`.
