# GhostView

Browse publicly available TikTok and Instagram profiles privately.

## Files
- `index.html`: the whole app (UI)
- `server.js`: the backend that loads public TikTok profile data (no dependencies)
- `package.json`: lets hosting services start the server

## Run it on your computer
Install Node.js 18 or newer, then run this in the folder:

```
node server.js
```

Open http://localhost:3000

## Put it online (free, from your phone)
1. Make a new GitHub repository and upload these three files.
2. On render.com, click New → Web Service and pick the repository.
3. Use start command `node server.js` and the free plan. Render sets PORT automatically.
4. Open the address Render gives you.

Railway and Fly.io work the same way. Static-only hosts such as Netlify Drop or GitHub Pages can't run `server.js`. On those, GhostView automatically uses TikTok's official embeds instead.

## How TikTok data is fetched
- Reads only the public profile page and TikTok's public embed page, the same pages anyone who isn't signed in sees.
- No accounts, cookies or private APIs, and no CAPTCHA solving or proxy rotation. If TikTok blocks a request, GhostView shows a message and offers TikTok's embed instead.
- Private accounts show only their public header. Accounts TikTok won't embed, usually under-18 or with embedding turned off, aren't shown.
- Your IP address never reaches TikTok. Images are proxied too.
- Each profile is cached for 10 minutes. Each visitor can make up to 30 profile lookups a minute.
- Stories and follower/following lists need a signed-in TikTok account, so they're not included.
- Collecting data this way may go against TikTok's Terms of Service. You decide how you use it.

Note: TikTok sometimes blocks data-center servers more than home connections. If profiles stop loading on your host, the app falls back to TikTok's embeds automatically.
