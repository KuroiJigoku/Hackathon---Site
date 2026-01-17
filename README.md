# Smart Attendance — Astro Demo

This repository contains the source code for the Smart Attendance System (Team 7) demonstration. The application is built using the Astro framework and provides a streamlined interface for managing student attendance records through an administrative dashboard and automated JSON API synchronization.

## Features

* **Administrative Dashboard**: Secure login for administrators to view and manage attendance data.
* **Automated JSON Synchronization**: A background scheduler periodically fetches attendance data from remote JSON APIs and persists it to the local database.
* **Data Persistence**: Utilizes `better-sqlite3` for local, high-performance attendance tracking.
* **Intelligent Logic**: Built-in protection ensures that automatic imports do not overwrite manual administrative edits or downgrade a student's status from 'present' to 'absent'.
* **Production Ready**: Configured with the Astro Node.js adapter for server-side rendering (SSR) and full API route support.

## Tech Stack

* **Frontend/Meta-framework**: [Astro v5](https://astro.build/)
* **Runtime**: Node.js
* **Database**: SQLite via `better-sqlite3`
* **Authentication**: JWT (JSON Web Tokens) via `jose` and password hashing with `argon2`

## Prerequisites

* Node.js (latest LTS recommended)
* npm or yarn

## Installation

1. **Clone the repository**:

    ```bash
    git clone <repository-url>
    cd Hackathon---Site-main

    ```

2. **Install dependencies**:

    ```bash
    npm install

    ```

3. **Configure Environment Variables**:

    Copy the example environment file and update the values:

    ```bash
    cp .env.example .env

    ```

## Production Deployment with PM2

For production environments, use PM2 to manage the Node.js process. This ensures the server automatically restarts on failure and correctly loads environment variables.

### 1. Build the Project

Generate the production-ready server files:

```bash
npm run build

```

### 2. Start the Server

Start the application using the Node adapter entry point. The `--node-args="-r dotenv/config"` flag is used to ensure the `.env` file is loaded correctly into the process:

```bash
pm2 start dist/server/entry.mjs --name "smart-attendance" --node-args="-r dotenv/config"

```

### 3. Management Commands

* **View Logs**: `pm2 logs smart-attendance`
* **Restart Server**: `pm2 restart smart-attendance`
* **Monitor Status**: `pm2 status`

## API & Background Tasks

* **Manual Trigger**: The remote import can be triggered manually via a POST or GET request to `/api/import_remote.json` (requires admin session or `IMPORT_SECRET`).
* **Status Check**: The last import results can be viewed at `/api/import_status.json`.
* **Scheduler**: The system includes a background scheduler that handles overlapping runs and error logging to keep local data in sync with the remote API source.

## License

Rights Reserved.
