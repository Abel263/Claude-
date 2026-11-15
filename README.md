# GhostView

Browse publicly available TikTok and Instagram profiles privately.

## Run it on your computer
Install Node.js 18 or newer, then run this in the folder:

```
node server.js
```

Open http://localhost:3000

## Put it online (free, no card): Vercel
1. Go to **vercel.com** and choose **Continue with GitHub**.
2. Tap **Add New… → Project**, then **Import** next to this repository.
3. Leave every setting as it is and tap **Deploy**.
4. Open the address Vercel gives you, for example `claude-xxxx.vercel.app`. On iPhone, tap Share → **Add to Home Screen**.

Vercel uses `index.html` and the functions in `/api`. Every push to this repo updates the site automatically.

### Other hosts
Render, Railway and Fly.io run `server.js` instead. Use start command `node server.js`. Static-only hosts like Netlify Drop or GitHub Pages can't run the API, so GhostView falls back to TikTok's official embeds there.

## Files
- `index.html`: the whole app
- `api/`: Vercel functions (`/api/health`, `/api/tiktok/profile/:user`, `/api/img`)
- `lib/core.js`: shared TikTok data logic
- `server.js`: the same API as a standalone Node server

## How TikTok data is fetched
- Reads only the public profile page and TikTok's public embed page, the same pages anyone who isn't signed in sees.
- No accounts, cookies or private APIs, and no CAPTCHA solving or proxy rotation. If TikTok blocks a request, GhostView shows a message and offers TikTok's embed instead.
- Private accounts show only their public header. Accounts TikTok won't embed, usually under-18 or with embedding turned off, aren't shown.
- Your IP address never reaches TikTok. Images are proxied too.
- Each profile is cached for 10 minutes. Each visitor can make up to 30 profile lookups a minute.
- Stories and follower/following lists need a signed-in TikTok account, so they're not included.
- Collecting data this way may go against TikTok's Terms of Service. You decide how you use it.

Note: TikTok sometimes blocks data-center servers more than home connections. If profiles stop loading on your host, the app falls back to TikTok's embeds automatically.
