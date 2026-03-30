# 🎮 NEXUS X·O — Online Multiplayer Tic Tac Toe

Real-time multiplayer Tic Tac Toe with shared-link rooms and Discord Activity support.

## Features
- ✅ Real-time multiplayer via WebSockets (Socket.io)
- ✅ Shareable room links — send to anyone, they join in one click
- ✅ 3 grid sizes: 3×3 (Easy), 5×5 (Medium), 7×7 (Hard)
- ✅ In-game live chat
- ✅ Score tracking across rounds
- ✅ Rematch system
- ✅ Discord Activity ready (see `discord/SETUP.md`)
- ✅ Mobile responsive

## Quick Start (Local)

```bash
npm install
npm start
# Open http://localhost:3000
```

## Deploy to Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## Discord Activity Setup
See `discord/SETUP.md` for full Discord integration instructions.

## Tech Stack
- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JS + CSS (no framework needed)
- **Deploy**: Railway / Render / Fly.io
- **Discord**: @discord/embedded-app-sdk (optional)
