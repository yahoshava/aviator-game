# 🎮 Aviator Crash Game — Complete Beginner's Guide

> **A multiplayer real-time crash game using jCoin virtual currency.**
> No real money · No gambling · For entertainment only.

This guide assumes you have **NEVER** used Firebase, Node.js, or Vercel before. Every single step is explained.

---

## 📋 What You'll Need (One-Time Setup)

You need to install these FREE tools on your computer first:

### 1. Install Node.js
- Go to: **https://nodejs.org/**
- Click the **LTS** (Long Term Support) green button
- Download and run the installer
- Click "Next" on everything → "Install" → "Finish"

**To verify installation:** Open your terminal/command prompt and type:
```
node --version
```
You should see something like `v20.11.0`. If yes, you're good.

### 2. Install a Code Editor
- Download **VS Code** (free): https://code.visualstudio.com/
- Install it with default settings.

### 3. Have a Google Account
- You'll need one for Firebase (any Gmail works).

### 4. Have a GitHub Account (optional, for Vercel deployment)
- Sign up free at: https://github.com/

---

## 📁 STEP 1 — Put Your Project Folder Somewhere

1. Download the `aviator-game` folder (provided with this guide).
2. Move it to a simple location like:
   - **Windows**: `C:\Users\YourName\Desktop\aviator-game`
   - **Mac**: `/Users/YourName/Desktop/aviator-game`
3. Open VS Code → **File → Open Folder** → select the `aviator-game` folder.

You should see these files in the left panel:
```
aviator-game/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── README.md             ← this file
└── src/
    ├── main.jsx
    ├── firebase.js       ← you'll edit this later
    ├── App.jsx
    └── AdminPanel.jsx
```

---

## 🔥 STEP 2 — Create Your Firebase Project

Firebase is a free Google service that stores your game data online.

### 2.1 Go to Firebase Console
- Visit: **https://console.firebase.google.com/**
- Sign in with your Google account.

### 2.2 Create a New Project
1. Click the big blue **"Add project"** (or **"Create a project"**) button.
2. **Project name**: Type `aviator-game` (or any name you want).
3. Click **Continue**.
4. **Google Analytics**: Toggle **OFF** (not needed).
5. Click **Create project**.
6. Wait ~30 seconds. When done, click **Continue**.

✅ You now see your project dashboard.

### 2.3 Enable Firestore Database
Firestore is where we save all game data.

1. In the left sidebar → click **Build** → **Firestore Database**.
2. Click **Create database**.
3. A popup appears:
   - Select **"Start in test mode"** (important — don't pick "production mode")
   - Click **Next**
4. Choose a location closest to you (e.g., `us-central` or `europe-west1`)
5. Click **Enable**.
6. Wait ~30 seconds until the Firestore database appears.

✅ Firestore is now ready.

### 2.4 Get Your Firebase Configuration Keys
These keys tell your app which Firebase project to connect to.

1. Click the ⚙️ **gear icon** (top-left, near "Project overview") → **Project settings**.
2. Scroll down to **"Your apps"** section.
3. Click the **`</>`** web icon (looks like `</>`).
4. **App nickname**: Type anything, like `aviator-web`.
5. **DO NOT** check "Also set up Firebase Hosting".
6. Click **Register app**.
7. You'll now see a code block with `firebaseConfig = { ... }`.
8. **COPY the entire `firebaseConfig` object** — you'll need it in the next step.

Example of what you copy:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyABC123...",
  authDomain: "aviator-game-xxxxx.firebaseapp.com",
  projectId: "aviator-game-xxxxx",
  storageBucket: "aviator-game-xxxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123xyz"
};
```

9. Click **Continue to console** (bottom of the popup).

### 2.5 Paste the Config into Your Project
1. In VS Code, open `src/firebase.js`.
2. You'll see a placeholder `firebaseConfig` object.
3. **Replace it** with the one you copied from Firebase.
4. Save the file (`Ctrl+S` on Windows, `Cmd+S` on Mac).

**Before:**
```javascript
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  ...
};
```

**After (your actual keys):**
```javascript
const firebaseConfig = {
  apiKey:            "AIzaSyABC123...",
  authDomain:        "aviator-game-xxxxx.firebaseapp.com",
  ...
};
```

---

## 🛡️ STEP 3 — Set Up Firestore Security Rules

These rules decide who can read/write your data. Right now test mode allows anyone for 30 days. Let's make it permanent (for demo use).

1. In Firebase Console → **Firestore Database** → click the **Rules** tab (top).
2. You'll see a code editor with rules inside.
3. **Delete everything** inside and paste this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Global game state — anyone can read & write
    match /game/{doc} {
      allow read, write: if true;
    }

    // Players — anyone can read & write (demo mode)
    match /players/{playerId} {
      allow read, write: if true;
    }
  }
}
```

4. Click **Publish** (top-right).
5. Confirm by clicking Publish again.

✅ Rules saved.

> ⚠️ **Note**: These rules are **open to anyone**, which is fine for a demo. For real production, you'd add Firebase Authentication. That's beyond this guide.

---

## 💻 STEP 4 — Install and Run Locally

### 4.1 Open the Terminal in VS Code
1. In VS Code → top menu → **Terminal → New Terminal**
2. A terminal window opens at the bottom.

### 4.2 Install Dependencies
In the terminal, type:
```bash
npm install
```
Press **Enter**. Wait 1-2 minutes. You'll see lots of text scrolling — that's normal.

When finished you'll see a final line like `added 280 packages`.

### 4.3 Start the Game
In the same terminal, type:
```bash
npm run dev
```
Press **Enter**. You'll see output like:
```
  VITE v5.3.4  ready in 543 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 4.4 Open the Game in Your Browser
- Open a browser tab and go to: **http://localhost:5173/**
- The Aviator game should load!

🎉 **You're playing the game locally.**

---

## 🧪 STEP 5 — Test It With Multiple Players

1. Open **http://localhost:5173/** in your main browser.
2. Open the **same link** in another browser (e.g., Chrome + Firefox) OR an incognito window.
3. Each tab = one player, each with 1,000 starting jCoins.
4. Bet, cash out, watch the multiplier rise — both tabs see the exact same live round.

---

## 👑 STEP 6 — Make Yourself an Admin

The **⚙️ ADMIN** button won't appear unless `isAdmin: true` is set on your player.

### 6.1 Find Your Player ID
1. In your game browser tab → press **F12** (opens Developer Tools).
2. Click the **Console** tab at the top.
3. Type this and press Enter:
   ```javascript
   localStorage.getItem('aviator_pid')
   ```
4. You'll see something like `"p_abc123_xyz"`. **Copy this value** (without quotes).

### 6.2 Edit Your Player Document in Firebase
1. Go to **Firebase Console** → **Firestore Database** → **Data** tab.
2. You'll see collections `game` and `players`.
3. Click **players**.
4. Find the document with your player ID (the one you copied).
5. Click that document to open it.
6. Click **"+ Add field"**.
7. Fill in:
   - **Field**: `isAdmin`
   - **Type**: `boolean`
   - **Value**: `true`
8. Click **Add**.

### 6.3 Refresh Your Game
- Go back to the game in your browser → press **F5** to refresh.
- You'll now see a purple **⚙️ ADMIN** button in the top-right header!

---

## 💎 STEP 7 — How to Use the Admin Panel

Click the **⚙️ ADMIN** button.

### Tab 1: "💎 Add jCoins"
Send coins to players.

**Add coins to ONE specific player:**
- Username: `player_abc12` (their exact username)
- Amount: `500`
- Click **Add jCoins**

**Add coins to EVERY player at once:**
- Username: `all` (magic keyword — the field turns gold)
- Amount: `1000`
- Click **Add to ALL Players**

### Tab 2: "👥 Players"
See a live list of all players:
- Green dot = currently online
- 💎 shows their current balance
- Search by username
- Sort by balance / name / most recent

---

## 🌐 STEP 8 — Deploy to the Internet (Vercel)

Now your friends can play without running anything locally.

### Option A: Via GitHub (recommended)

#### 8.1 Create a GitHub repository
1. Go to https://github.com/new
2. **Repository name**: `aviator-game`
3. **Public** (Vercel's free plan requires public repos).
4. **Do NOT** check "Initialize with README" (since we already have files).
5. Click **Create repository**.

#### 8.2 Push Your Code to GitHub
GitHub shows you commands. In your VS Code terminal, run them one by one:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/aviator-game.git
git push -u origin main
```
Replace `YOUR_USERNAME` with your actual GitHub username. When prompted, log in to GitHub in your browser if it asks.

#### 8.3 Deploy to Vercel
1. Go to **https://vercel.com/signup** → sign up with GitHub (easiest).
2. Click **"Add New"** → **"Project"**.
3. Find your `aviator-game` repo → click **Import**.
4. **Framework preset**: should auto-detect as **Vite**. If not, select it.
5. **Root Directory**: leave as `./`
6. **Build Command**: `npm run build` (default, leave alone)
7. **Output Directory**: `dist` (default, leave alone)
8. Click **Deploy**.
9. Wait ~1 minute. Done!

You'll get a URL like `https://aviator-game-xxxx.vercel.app/` — share it with anyone!

### Option B: Vercel CLI (no GitHub needed)

```bash
npm install -g vercel
vercel
```
Follow the prompts:
- Set up and deploy? → **Yes**
- Which scope? → your account
- Link to existing project? → **No**
- Project name? → `aviator-game`
- Code directory? → `./`
- Override settings? → **No**

After ~1 minute, you get your live URL.

---

## 🎯 STEP 9 — Share With Friends

1. Copy your Vercel URL (e.g., `https://aviator-game-xxxx.vercel.app/`)
2. Send it to your friends.
3. Each friend gets **1,000 starting jCoins** automatically.
4. They pick a username (default auto-generated).
5. Everyone sees the **same live multiplier** in real time.

To give a friend more coins:
1. Ask for their username (shown in their "My Profile" card).
2. Click **⚙️ ADMIN** → **💎 Add jCoins** → type their username → amount → submit.

To give everyone free coins (e.g., for an event):
- Username: `all`
- Amount: `1000`

---

## 🎮 How the Game Plays

### Each Round:
1. **⏳ NEXT ROUND** phase (5 seconds) → everyone places bets
2. **🚀 FLYING** phase → multiplier rises from 1.00× upward
3. **💥 CRASHED** phase (3 seconds) → game ends, new round starts

### Bet Flow:
1. Enter bet amount → click **🎯 PLACE BET**
2. jCoins are deducted immediately
3. Watch the multiplier rise
4. Click **💸 CASH OUT** anytime → you win `bet × current multiplier`
5. If the plane crashes before you cash out → you lose your bet

### Auto Cash-Out:
- Set a value like `2.0` → automatically cashes out at 2.00× for you
- Leave blank to cash out manually

---

## 🆘 Troubleshooting

### "npm: command not found"
Node.js isn't installed properly. Re-install from https://nodejs.org/ and **restart your terminal**.

### "Permission denied" error on Firebase
Your Firestore rules block access. Go back to **Step 3** and make sure you published the rules.

### Game not loading / blank screen
1. Open browser F12 → **Console** tab → check for red errors.
2. Most common: wrong Firebase config. Check `src/firebase.js` — paste must match exactly what's in Firebase → Project Settings.

### Multiplier not moving
- Open the game in **two tabs**. One becomes the host automatically.
- If the host tab is closed, another tab takes over within 12 seconds.

### Admin button not showing
- Did you set `isAdmin: true` correctly? (case-sensitive, must be boolean, not a string)
- Did you refresh the page after setting it?
- Is your player ID in Firebase the same as `localStorage.getItem('aviator_pid')` in your browser?

### "Firestore: Missing or insufficient permissions"
Go to Firebase → Firestore → Rules → paste the rules from **Step 3** again → Publish.

### Coins not updating after admin adds them
Firestore updates live. If not instant:
1. Check the player's **username** in Firestore matches what you typed.
2. Usernames are **case-sensitive** (`Player1` ≠ `player1`).
3. Open the Players tab in admin → verify the player exists.

---

## 📊 Firestore Data Structure

### `game/state` (one document)
| Field          | Type      | Purpose                            |
|----------------|-----------|------------------------------------|
| status         | string    | "waiting" / "running" / "crashed"  |
| crashPoint     | number    | Where this round will crash        |
| multiplier     | number    | Last written value (reference)     |
| history        | number[]  | Last 10 crash values               |
| roundId        | string    | ID for current round               |
| startTime      | timestamp | When "running" phase began         |
| hostId         | string    | Player ID acting as host           |
| hostLastPing   | timestamp | Host heartbeat                     |

### `players/{playerId}` (one document per player)
| Field              | Type      | Purpose                         |
|--------------------|-----------|---------------------------------|
| jCoin              | number    | Player's virtual coin balance   |
| username           | string    | Display name                    |
| isAdmin            | boolean   | Can access admin panel          |
| currentBet         | number    | Active bet amount               |
| betRoundId         | string    | Which round the bet is for      |
| cashedOut          | boolean   | Whether they cashed out         |
| cashoutMultiplier  | number    | Multiplier they cashed out at   |
| lastSeen           | timestamp | For online player count         |

---

## 💡 How It Works Technically

- **Host election**: First client to connect wins a Firestore transaction and becomes "host". Only the host updates game state. If host disconnects (>12s), another client takes over.
- **Multiplier**: NOT written to Firestore every tick. Only `startTime` is stored. Every client calculates `(1.008)^(elapsed_ms / 100)` locally via `requestAnimationFrame` — smooth, accurate, and uses only ~2 Firestore writes per round.
- **All money operations** use Firestore transactions to prevent race conditions.
- **Real-time sync**: `onSnapshot` listeners push updates from Firestore to all clients instantly.

---

## 📝 Important Notes

- ⚠️ This game uses **jCoin only** — a virtual in-game currency. No real money. No payment integration. For entertainment only.
- ⚠️ Firebase's free tier (Spark plan) is **more than enough** for hundreds of players. You won't hit limits unless you have thousands of active users.
- ⚠️ The open Firestore rules are fine for a demo/friends game. For public launch, add Firebase Authentication.

---

## ❓ Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Run locally | `npm run dev` |
| Stop the local server | `Ctrl + C` in terminal |
| Build for production | `npm run build` |
| Deploy to Vercel | `vercel` |

---

🎉 **That's it! You now have a fully-functional real-time multiplayer crash game running on the internet.**

Questions, improvements, or issues — dig into `src/App.jsx` and `src/AdminPanel.jsx`. Every section has comments explaining what it does.
