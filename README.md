# SubCast - Setup & Run Guide

## 1. Requirement (Only Once)
Install **Node.js** (LTS version) if not already installed:
- Download: https://nodejs.org

---

## 2. GitHub Setup

### Option A: Via Terminal (Copy & Paste)
```bash
# 1. Clone repository
git clone <YOUR_REPOSITORY_URL>
cd SubCast

# 2. Install dependencies (Auto-downloads libraries)
npm install

# 3. Start app
npm run dev
```
Open browser at: **`http://localhost:5173`**

### Option B: 1-Click (Without Terminal)
1. Download repository as ZIP & extract it.
2. Double-click **`Start_SubCast.bat`** (it will auto-install dependencies & open browser).

---

## 3. Pendrive Sharing (Share without heavy node_modules)

### Step 1: Export Clean Folder (Sender PC)
1. Double-click **`Export_For_Pendrive.bat`**.
2. It creates a clean folder on your Desktop: `Desktop\SubCast_Client_Ready` (without heavy `node_modules`).
3. Copy this `SubCast_Client_Ready` folder to your Pendrive.

### Step 2: Run on New / Client PC (Receiver PC)
1. Copy the folder from Pendrive to the PC (Desktop or any drive).
2. Make sure Node.js is installed (https://nodejs.org).
3. Open folder in terminal and run:
```bash
npm install
npm run dev
```
**OR simply double-click:**
- **`Setup_SubCast.bat`** (auto-installs dependencies & creates a Desktop shortcut).
- **`Start_SubCast.bat`** (auto-installs dependencies & launches app immediately).

---

## 4. Useful 1-Click Scripts

| File | What it does |
| :--- | :--- |
| `Start_SubCast.bat` | Auto-installs dependencies + opens browser at localhost:5173. |
| `Setup_SubCast.bat` | Full setup + creates desktop shortcut with app icon. |
| `Launch_SubCast.vbs` | Runs app silently in background (no black CMD window). |
| `Export_For_Pendrive.bat` | Exports clean, lightweight folder for pendrive sharing. |

---

## 5. Quick Troubleshooting

- **Error: 'node' is not recognized**: Install Node.js from https://nodejs.org and restart terminal/PC.
- **Port 5173 already in use**: App is already running in background. Open `http://localhost:5173` directly in browser.
- **First Time Transcribe**: AI Whisper model (~40MB) downloads once in browser cache; afterwards it works 100% offline.
