#!/bin/bash

# Test: Unauthenticated access to /api/attendance.json
curl -i -X GET http://localhost:4321/api/attendance.json

# Test: Authenticated access to /api/attendance.json
curl -i -X GET http://localhost:4321/api/attendance.json \
  --cookie "sa_token=<YOUR_JWT_TOKEN>"

# Test: Unauthenticated POST to /api/import_remote.json
curl -i -X POST http://localhost:4321/api/import_remote.json

# Test: Authenticated POST to /api/import_remote.json
curl -i -X POST http://localhost:4321/api/import_remote.json \
  --cookie "sa_token=<YOUR_JWT_TOKEN>"

# Test: Using IMPORT_SECRET for /api/import_remote.json
curl -i -X POST http://localhost:4321/api/import_remote.json?secret=<YOUR_IMPORT_SECRET>

# Test: Logout endpoint
curl -i -X POST http://localhost:4321/api/logout.json \
  --cookie "sa_token=<YOUR_JWT_TOKEN>"

# Test: GET logout (dev only)
curl -i -X GET http://localhost:4321/api/logout.json