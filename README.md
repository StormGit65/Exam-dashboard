# ⛩️ Kaizen Dashboard

Kaizen Dashboard is a premium, offline-first Exam Preparation and Study Tracker designed to help students organize, analyze, and optimize their preparation journey. Built with Node.js, Express, and MongoDB, it provides comprehensive tracking tools for mock tests, daily study goals, journals, and dedicated desks/profiles.

---

## 🚀 Features

### 📅 Exam & Session Management
- **Interactive Exam Cards**: Keep track of upcoming exams with custom colors, dates, and times.
- **Section Configuration**: Setup sections with custom scoring metrics (positive and negative marks) and maximum marks.
- **Auto-Archiving**: Past exams automatically move to an archive based on date and time, keeping your main workspace clean.
- **Archive Management**: Retrieve past exam data, unarchive sessions, or customize batch labels easily.

### 📊 Mock Test Analytics
- **Performance Breakdown**: Log mock test scores with detailed section-by-section correct/wrong statistics.
- **Platform Filtering**: Track which platforms (e.g., mock portals, test series) you are using and filter performance accordingly.
- **Schedule Mocks**: Plan ahead by setting up scheduled dates and times for upcoming mock tests.
- **Advanced Calculations**: Automatically calculates total scores and percentage statistics based on section-wise rules.

### 🎯 Goal & Task Tracking
- **Daily Goals Checklist**: Create, edit, and check off study tasks for the current day.
- **Scheduled Milestones**: Assign tasks to specific dates, and add optional start/end times.
- **Reordering**: Drag, drop, and arrange goals to prioritize tasks.

### 📝 Daily Progress Journal (Completed Entries)
- **Log Daily Achievements**: Write down what you learned or achieved.
- **Visual Customization**: Assign different background colors to your logs to highlight important days.
- **Media Attachments**: Upload and attach screenshots, documents, PDFs, or audio guides (handled locally via Multer).

### 🖥️ My Desk Profiles
- Create custom profiles or study workspaces (e.g., separate desks for different subjects or general productivity tasks) outside of specific exams.

### ☁️ Cloud Sync (MongoDB Atlas)
- **Offline-First**: App always runs against a local MongoDB for speed and offline capability.
- **Auto Sync**: On startup, compares local and Atlas databases and syncs the newer one (like `git pull`).
- **Auto Push**: On shutdown (`Ctrl+C`), local data is pushed to Atlas (like `git push`).
- **Three Modes**: Works in DUAL (both connected), LOCAL-ONLY, or ATLAS-ONLY mode depending on what's available.
- **Pre-Sync Snapshots**: Before any destructive sync, a backup snapshot is saved (max 5 kept).
- **Sync Ledger**: Git-log-style history of every sync session.
- **Recovery Page**: `/sync` page to view sync history, snapshots, and restore from any snapshot.
- **Reconnect**: If databases are unreachable, a reconnect button lets you retry without restarting.

### 💾 Database Backup & Migration
- **One-click Backup**: Export the entire database into a single, portable `.archive` file.
- **Easy Recovery**: Move the archive to another machine and restore it with a single click.

---

## 🛠️ Tech Stack

- **Backend**: [Node.js](https://nodejs.org/), [Express](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) (local) + [MongoDB Atlas](https://www.mongodb.com/atlas) (cloud sync)
- **File Uploads**: [Multer](https://github.com/expressjs/multer)
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript
- **Config**: [dotenv](https://github.com/motdotla/dotenv) for environment variables

---

## 📦 Getting Started

### Prerequisites
Make sure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v16.x or higher recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) running locally on the default port: `mongodb://localhost:27017`

### Installation
1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Create your environment file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure your database credentials:
   ```env
   # Local MongoDB (offline database)
   MONGO_LOCAL_URI=mongodb://localhost:27017
   DB_NAME=ExamPrep

   # MongoDB Atlas (optional — leave empty for local-only mode)
   MONGO_ATLAS_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority

   PORT=3000
   ```

3. Seed the database with initial sample data (optional):
   ```bash
   npm run seed
   ```

### Running the Application

#### **Development Mode** (with Nodemon auto-reload)
```bash
npm run dev
```

#### **Production / Normal Mode**
```bash
npm start
```

#### **On Windows**
Simply double-click the `start.cmd` script in the root directory. It will automatically:
- Start the Node.js server.
- Wait a brief moment and launch the dashboard in your default web browser (`http://localhost:3000`).

#### **On Linux (Fedora/Debian/Ubuntu)**
Run the startup script in your terminal:
```bash
./start.sh
```
*(Ensure it is executable with `chmod +x start.sh`). It will launch the backend server and open the app in your default browser.*

---

## ☁️ Cloud Sync Setup

### Setting Up MongoDB Atlas (Free)
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and create a free M0 cluster.
2. Create a database user with read/write access.
3. Whitelist your IP address (or use `0.0.0.0/0` for all IPs).
4. Copy the connection string and paste it into your `.env` file as `MONGO_ATLAS_URI`.

### How Sync Works

| Mode | Local DB | Atlas DB | Primary | Behavior |
|------|----------|----------|---------|----------|
| **DUAL** | ✅ | ✅ | Local | Full sync on startup/shutdown |
| **LOCAL-ONLY** | ✅ | ❌ | Local | Works offline, warns user |
| **ATLAS-ONLY** | ❌ | ✅ | Atlas | Direct cloud mode |
| **NONE** | ❌ | ❌ | — | Shows reconnect page |

**Startup**: Compares `lastUpdated` timestamps → pulls newer data.
**Shutdown** (`Ctrl+C`): Pushes local → Atlas automatically.
**Snapshots**: Before any overwrite, a backup is saved to `ExamPrep_snap_<timestamp>` database (max 5).

### Sync Management Page
Visit `http://localhost:3000/sync` to:
- View connection status and current operating mode
- Browse the sync ledger (session history)
- Restore from any snapshot
- Manually push data to Atlas

---

## 💾 Database Backup & Recovery Tool

An offline GUI backup/restore utility is included to help migrate your data between machines.

### Prerequisites
The utility requires `tkinter` (Python's GUI framework) and MongoDB database tools:
- **Fedora**: `sudo dnf install python3-tkinter mongodb-database-tools`
- **Ubuntu/Debian**: `sudo apt install python3-tk mongodb-database-tools`

### Usage
1. Execute the tool:
   ```bash
   ./mongo_backup_gui.py
   ```
2. Click **Take Backup** to save a snapshot of the database to the local `backup/` folder.
3. Move the generated `.archive` file to your target machine and use the **Restore DB** button to recover your database state.

---

## 📂 Project Structure

```
├── public/                 # Frontend assets
│   ├── css/                # Styling (styles.css)
│   ├── js/                 # Client-side JavaScript (dashboard, timer, suntime, etc.)
│   ├── index.html          # Main portal
│   ├── dashboard.html      # Detailed exam dashboard
│   └── sync.html           # Database sync management page
├── backup/                 # Saved database backups (git-ignored)
├── uploads/                # Directory for user-uploaded attachments (git-ignored)
├── .env.example            # Environment variable template
├── .env                    # Your local environment variables (git-ignored)
├── sync.js                 # Database sync engine (local ↔ Atlas)
├── mongo_backup_gui.py     # Python GUI backup and restore utility
├── package.json            # NPM dependencies and run scripts
├── seed.js                 # Seeding script for mock data
├── server.js               # Express API and server configuration
├── start.cmd               # Quick launcher script for Windows
└── start.sh                # Startup script for Fedora/Linux
```
