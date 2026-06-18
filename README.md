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

### 💾 Database Backup & Migration
- **One-click Backup**: Export the entire database into a single, portable `.archive` file.
- **Easy Recovery**: Move the archive to another machine and restore it with a single click.

---

## 🛠️ Tech Stack

- **Backend**: [Node.js](https://nodejs.org/), [Express](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) (using local connection)
- **File Uploads**: [Multer](https://github.com/expressjs/multer)
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript

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

2. Seed the database with initial sample data (optional):
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
│   └── dashboard.html      # Detailed exam dashboard
├── backup/                 # Saved database backups (git-ignored)
├── uploads/                # Directory for user-uploaded attachments (git-ignored)
├── mongo_backup_gui.py     # Python GUI backup and restore utility
├── package.json            # NPM dependencies and run scripts
├── seed.js                 # Seeding script for mock data
├── server.js               # Express API and server configuration
├── start.cmd               # Quick launcher script for Windows
└── start.sh                # Startup script for Fedora/Linux
```
