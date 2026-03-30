# ⚡ NEXUS X·O — Discord Activity Setup Guide

## What is a Discord Activity?
Discord Activities are web apps that run **inside a Discord voice channel** via an iframe.
Everyone in the voice channel can play together in real time.

---

## Step 1 — Create a Discord Application

1. Go to https://discord.com/developers/applications
2. Click **"New Application"**
3. Name it **"NEXUS X·O"**
4. Go to **"OAuth2"** → copy the **Client ID**

---

## Step 2 — Enable Activities

1. In your app settings, go to **"Activities"** (left sidebar)
2. Enable **"Activities"**
3. Set the **Root URL** to your deployed server URL  
   e.g. `https://your-app.railway.app`

---

## Step 3 — URL Mapping (Proxy)

Discord proxies your app through `*.discordsays.com`.
Add these URL mappings in the Activities settings:

| Prefix | Target |
|--------|--------|
| `/`    | `your-app.railway.app` |

---

## Step 4 — Install the Discord Embedded App SDK

```bash
npm install @discord/embedded-app-sdk
```

Add this to your `public/js/game.js` top (for Discord mode):

```javascript
import { DiscordSDK } from "@discord/embedded-app-sdk";

const discordSdk = new DiscordSDK("YOUR_CLIENT_ID");

async function initDiscord() {
  await discordSdk.ready();
  
  // Authorize with Discord
  const { code } = await discordSdk.commands.authorize({
    client_id: "YOUR_CLIENT_ID",
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify", "guilds"],
  });

  // Get user info
  const response = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const { access_token } = await response.json();
  
  // Authenticate with Discord
  await discordSdk.commands.authenticate({ access_token });
  
  // Get channel participants
  const channel = await discordSdk.commands.getChannel({
    channel_id: discordSdk.channelId,
  });
  
  console.log("Discord channel:", channel.name);
  console.log("Discord instance ID:", discordSdk.instanceId);
  
  // Use instanceId as room code so everyone in the voice channel joins the same game
  document.getElementById('join-code').value = discordSdk.instanceId.slice(0, 6).toUpperCase();
  joinRoom();
}

// Run if inside Discord
if (window.location.ancestorOrigins?.[0]?.includes('discord.com')) {
  initDiscord();
}
```

---

## Step 5 — Add Token Exchange Endpoint (server/index.js)

```javascript
app.post('/api/token', async (req, res) => {
  const { code } = req.body;
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
    }),
  });
  const { access_token } = await response.json();
  res.json({ access_token });
});
```

Add to your `.env`:
```
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
```

---

## Step 6 — Deploy to Railway (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Deploy
railway up
```

Set environment variables in Railway dashboard:
- `PORT` = (auto-set by Railway)
- `DISCORD_CLIENT_ID` = your Discord app client ID
- `DISCORD_CLIENT_SECRET` = your Discord app client secret

Your URL will be something like:
`https://nexus-ttt-production.up.railway.app`

---

## Step 7 — Test in Discord

1. Join any voice channel in your Discord server
2. Click the **🚀 Activities** button (rocket icon, bottom of voice panel)
3. Search for **"NEXUS X·O"**
4. Launch it — everyone in the channel sees the same game!

---

## Shared Link Mode (No Discord needed)

The server already supports shared links out of the box:

1. Run the server: `npm start`
2. Open `http://localhost:3000`
3. Create a room → copy the link
4. Send the link to a friend
5. They open it and join automatically!

For online play, deploy to Railway/Render/Fly.io and share the public URL.

---

## Quick Deploy Options

| Platform | Command | Free Tier |
|----------|---------|-----------|
| Railway  | `railway up` | ✅ Yes |
| Render   | Push to GitHub | ✅ Yes |
| Fly.io   | `fly launch` | ✅ Yes |
| Heroku   | `git push heroku main` | ❌ Paid |

---

## .env Template

```env
PORT=3000
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
NODE_ENV=production
```
