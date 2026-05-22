# Unleashed Cubing Academy

A speedcubing web app — algorithm library, trainer, and timer — built with vanilla JS.

**Live site:** https://unleashedcubing.github.io/unleashed-cubing-academy/

---

## Pages

| Page | What it does |
|------|-------------|
| **Algorithms** | Browse and search algorithm sets for 3x3, 2x2, 4x4, 5x5, and Pyraminx |
| **Trainer** | Practice algorithms with a timed drilling loop |
| **Timer** | Full-featured solve timer with sessions, stats, and graphs |
| **Battles** | 1v1 real-time battles (unlocks at 150 solves) |
| **Account** | Personal records, solve history heatmap, WCA records, algorithm progress |
| **Quests** | Milestone challenges to complete |

---

## Timer

### Starting and stopping
- **Desktop:** hold Space to arm (timer turns green), release to start. Press Space again to stop.
- **Mobile:** tap anywhere on the timer screen — same hold-and-release behaviour.
- Any key stops the timer while it's running.

### Input modes
Open **Settings** (gear icon) → Input Method:
- **Timer** — Space / tap (default)
- **Typing** — type your time manually (e.g. `12.34` or `1:02.34` or `DNF`)
- **Stackmat** — audio-jack Stackmat (coming soon)

### Inspection
Settings → **Inspection: On** enables the WCA 15-second inspection countdown. Press Space to start inspection, then hold and release to start the solve.

### Focus mode
Settings → **Focus: On** hides the timer display while the solve is running so you can't watch it.

### Hold delay
Settings → **Hold** — adds a short hold requirement before arming (0 / 0.30s / 0.55s).

### Decimal precision
Settings → **Decimals** — switches between 2 and 3 decimal places.

---

## Sessions

### Creating a session
Click **+** in the session rail (right side on desktop, bottom bar on mobile). Set a name, cube type, icon, and colour. You can optionally import solves from a CSTimer export.

### Importing from CSTimer
1. In CSTimer, go to **Export → Export to file** — save the `.txt` file.
2. Open the **Create Session** modal → drag or click the import area.
3. Each CSTimer session appears as a row — check the ones you want, edit names/icons/colours, then click **Import N Sessions**.

### Editing or deleting
Long-press or click the pencil icon on a session row in the session panel.

---

## Solve notes and tags

After a solve, the result popup appears. Click a time in the **Time List** to open the note dialog (or press `#` on desktop).

- Type a free-text note (up to 120 characters).
- Tap quick tags: **LL skip, Lucky, New PB, Easy cross, OLL skip, PLL skip, Unlucky, Lookahead**.
- Tags toggle on/off — tapping an active tag removes it from the note.

### Searching the time list
Click the 🔍 icon in the Time List header and type:
- Any text to match against notes
- `sub 10` — solves faster than 10 seconds
- `sub-pb` — solves faster than your PB
- `dnf` — DNF solves only
- `pb` — personal bests only

---

## Stat widgets

Up to 4 widgets sit above the timer (2 on mobile). Click **+** to add one, drag the grip handle to reorder, click the ⚙ to change type.

| Widget | Shows |
|--------|-------|
| **Ao5** | Average of last 5 solves |
| **Ao12** | Average of last 12 solves |
| **Comparison** | Your Ao5 vs your all-time best Ao5 |
| **Goal** | Countdown to a target time you set |
| **Streak** | Consecutive solves under a threshold |
| **Scramble** | Current scramble in large text |

Press `W` on the timer page to hide/show the widget row.

---

## Graphs

- **Progress** — line graph of your last solves, with PB markers. Hover a point to see the exact time.
- **Time Distribution** — histogram bucketed by whole seconds.

Press `G` on the timer page to hide/show the graphs.

Graphs are hidden on mobile to keep the screen clean.

---

## Account / Sign-in

### Sign-in options
Click **Sign in** (bottom of sidebar on desktop, top-right icon on mobile):

| Option | What you get |
|--------|-------------|
| **Google** | Full cloud sync — solves, sessions, settings, and learned algorithms sync across all devices |
| **WCA Login** | Links your WCA competition record (PRs shown on Account page). Solves stay local. |
| **Continue without signing in** | Everything stored in the browser only |

### Linking WCA to an existing Google account
Go to **Account → Edit Profile → WCA** tab and click **Verify with WCA**.

---

## Mobile layout

- The sidebar becomes a horizontal top bar.
- The session rail moves to a fixed bottom bar — swipe horizontally to see all sessions.
- Progress and Time Distribution graphs are hidden.
- Only the first 2 stat widgets are shown.
- Tap the **list icon** (bottom-right button) to open the Session Overview and Time List as a bottom sheet.

---

## Keyboard shortcuts (desktop)

| Key | Action |
|-----|--------|
| `Space` (hold → release) | Arm and start timer |
| `Space` (while running) | Stop timer |
| `#` | Open solve note for last solve |
| `W` | Toggle stat widgets |
| `G` | Toggle progress graphs |
| `Esc` | Close any open modal |

---

## Supported puzzles

2x2 · 3x3 · 4x4 · 5x5 · 6x6 · 7x7 · Pyraminx · Skewb · Megaminx · Square-1 · Clock

---

## Common questions

**My scrambles aren't generating.**
The scramble engine is loaded from a CDN (`cdn.cubing.net`). If it fails, it retries 3 times automatically. If it still fails, click the **retry** link in the scramble area. Check your internet connection.

**I signed in but my data isn't syncing.**
Make sure you signed in with Google (WCA login is local-only). Also check that Firebase is configured — the project needs `firebase-config.js` with valid credentials and the domain (`unleashedcubing.github.io`) added to Firebase Authorized Domains.

**Can I use this offline?**
Scramble generation and WCA login require internet. Everything else (timing, sessions, notes) works offline once the page has loaded.

**My solves from another device aren't appearing.**
Cloud sync only works when signed in with Google and Firebase is configured. After signing in, the app pulls the latest data automatically.

**The timer isn't starting when I tap on mobile.**
Make sure you're tapping a non-interactive area — tapping buttons or the session rail won't start the timer. Tap the scramble text or the timer display area.

**How do I import my CSTimer history?**
See [Importing from CSTimer](#importing-from-cstimer) above.

**Battles says "unlock at 150 solves" — how do I unlock it?**
Record 150 solves in the Timer across any cube. The counter is shown on the locked Battles screen. You can also enter a beta tester code if you have one.

---

## Tech stack

- Vanilla JavaScript (ES modules, no bundler)
- [cubing.js](https://github.com/cubing/cubing.js) for scramble generation and cube previews
- Firebase v11 (Auth + Firestore) for cloud sync
- WCA OAuth (PKCE implicit flow) for competition record linking
- GitHub Pages for hosting
