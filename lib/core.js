// GhostView core: public TikTok profile data. Shared by server.js (Render/Railway/local)
// and the Vercel functions in /api. Zero dependencies, Node 18+.
//
// Ground rules:
//  - Reads only pages TikTok serves to signed-out visitors: the public profile page and
//    TikTok's official public embed page. No accounts, no cookies, no private APIs.
//  - No bot-check workarounds: no CAPTCHA solving, no proxy rotation, no request signing.
//  - Private accounts: public header only. Accounts TikTok won't embed (usually under-18): not shown.
//  - Visitors' IPs and cookies never reach TikTok; images are proxied.
'use strict';
const CACHE_MS = 10 * 60 * 1000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const USER_RX = /^[a-zA-Z0-9._]{2,24}$/;
const IMG_HOSTS = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|ibyteimg\.com|muscdn\.com|byteimg\.com)$/i;

/* ---------------- small helpers ---------------- */
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';

// Per-visitor rate limit (token bucket)
const buckets = new Map();
function allow(ip, kind, perMin) {
  const key = kind + ip, now = Date.now();
  const b = buckets.get(key) || { t: perMin, at: now };
  b.t = Math.min(perMin, b.t + ((now - b.at) / 60000) * perMin); b.at = now;
  if (b.t < 1) { buckets.set(key, b); return false; }
  b.t -= 1; buckets.set(key, b); return true;
}
setInterval(() => { const cut = Date.now() - 5 * 60000; for (const [k, b] of buckets) if (b.at < cut) buckets.delete(k); }, 60000).unref();

// Polite upstream queue: at most 2 requests to TikTok at once, spaced out.
let active = 0, last = 0; const waiting = [];
function slot() {
  return new Promise(resolve => {
    const tryRun = () => {
      const gap = 400 - (Date.now() - last);
      if (active < 2 && gap <= 0) { active++; last = Date.now(); resolve(() => { active--; if (waiting.length) waiting.shift()(); }); }
      else setTimeout(tryRun, Math.max(gap, 50));
    };
    if (active < 2) tryRun(); else waiting.push(tryRun);
  });
}
async function upstream(url, { binary = false, timeout = 12000 } = {}) {
  const done = await slot();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctl.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: binary ? 'image/avif,image/webp,image/*,*/*;q=0.8' : 'text/html,application/xhtml+xml' }
    });
    const body = binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
    return { status: r.status, body, type: r.headers.get('content-type') || '' };
  } finally { clearTimeout(t); done(); }
}

// Small LRU cache
const cache = new Map();
function cacheGet(k) { const e = cache.get(k); if (!e) return null; if (Date.now() - e.at > CACHE_MS) { cache.delete(k); return null; } cache.delete(k); cache.set(k, e); return e; }
function cacheSet(k, v) { cache.set(k, { v, at: Date.now() }); if (cache.size > 500) cache.delete(cache.keys().next().value); }

const img = u => (u ? '/api/img?u=' + encodeURIComponent(u) : null);
const jsonScript = (html, id) => {
  const m = html.match(new RegExp('<script[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</script>'));
  if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; }
};
// TikTok video IDs encode their creation time in the top 32 bits.
const idTime = id => { try { return Number(BigInt(id) >> 32n) * 1000; } catch { return null; } };
const hashtags = s => [...new Set((String(s || '').match(/#[\p{L}\p{N}_]+/gu) || []).map(h => h.slice(1)))];

/* ---------------- TikTok profile ---------------- */
async function tiktokProfile(user) {
  const hit = cacheGet('tt:' + user);
  if (hit) return { ...hit.v, cachedAt: hit.at };

  const [page, embed] = await Promise.allSettled([
    upstream('https://www.tiktok.com/@' + user),
    upstream('https://www.tiktok.com/embed/@' + user)
  ]);

  // 1) Public profile page (server-rendered JSON TikTok sends to signed-out visitors)
  let detail = null, pageBlocked = false;
  if (page.status === 'fulfilled' && page.value.status === 200) {
    const d = jsonScript(page.value.body, '__UNIVERSAL_DATA_FOR_REHYDRATION__');
    detail = d && d.__DEFAULT_SCOPE__ && d.__DEFAULT_SCOPE__['webapp.user-detail'];
    if (!detail) pageBlocked = true;
  } else pageBlocked = true;

  if (detail && detail.statusCode && detail.statusCode !== 0) {
    if ([10202, 10221, 10222, 10223].includes(detail.statusCode))
      return { status: 404, error: 'not_found' };
    return { status: 451, error: 'restricted', code: detail.statusCode };
  }

  // 2) Official public embed page: recent videos, and TikTok's own "can this be shown off-platform" signal
  let eInfo = null, eVideos = null, embedOk = false;
  if (embed.status === 'fulfilled' && embed.value.status === 200) {
    const s = jsonScript(embed.value.body, '__FRONTITY_CONNECT_STATE__');
    const data = s && s.source && s.source.data && Object.values(s.source.data).find(x => x && x.userInfo);
    if (data) { eInfo = data.userInfo; eVideos = data.videoList || []; embedOk = eInfo && eInfo.code === 200; }
  }

  const u = detail && detail.userInfo && detail.userInfo.user;
  const st = detail && detail.userInfo && (detail.userInfo.statsV2 || detail.userInfo.stats);
  const isPrivate = u ? !!u.privateAccount : !!(eInfo && eInfo.privateAccount);

  if (!u && !eInfo) {
    if (embed.status === 'fulfilled' && embed.value.status === 400 && !pageBlocked) return { status: 404, error: 'not_found' };
    return { status: 502, error: 'upstream_unavailable' };
  }
  // Public account that TikTok refuses to embed: usually under 18 or embedding turned off. Respect it.
  if (!isPrivate && !embedOk) return { status: 451, error: 'restricted' };

  const num = v => (v == null ? null : Number(v));
  const profile = {
    username: (u && u.uniqueId) || eInfo.uniqueId || user,
    nickname: (u && u.nickname) || (eInfo && eInfo.nickname) || null,
    bio: (u && u.signature) || (eInfo && eInfo.signature) || '',
    bioLink: (u && u.bioLink && u.bioLink.link) || null,
    verified: !!((u && u.verified) || (eInfo && eInfo.verified)),
    private: isPrivate,
    organization: !!(u && u.isOrganization),
    avatar: img((u && (u.avatarMedium || u.avatarThumb)) || (eInfo && eInfo.avatarThumbUrl)),
    avatarLarge: img(u && u.avatarLarger) // full size, when the profile page provided it
  };
  const stats = {
    followers: num(st ? st.followerCount : eInfo && eInfo.followerCount),
    following: num(st ? st.followingCount : eInfo && eInfo.followingCount),
    likes: num(st ? (st.heartCount ?? st.heart) : eInfo && eInfo.heartCount),
    videos: st ? num(st.videoCount) : null
  };

  let videos = [];
  if (!isPrivate && eVideos) {
    videos = eVideos.filter(v => v && v.id && !v.privateItem).map(v => ({
      id: String(v.id),
      desc: v.desc || '',
      hashtags: hashtags(v.desc),
      cover: img(v.coverUrl || v.originCoverUrl),
      plays: num(v.playCount),
      createdAt: idTime(v.id),
      pinned: false
    }));
    // Pinned detection: TikTok lists pinned videos first, ahead of newer ones.
    // A leading video that is older than one listed after it must be pinned.
    for (let i = 0; i < videos.length - 1; i++) {
      const laterNewest = Math.max(...videos.slice(i + 1).map(v => v.createdAt || 0));
      if ((videos[i].createdAt || 0) < laterNewest) videos[i].pinned = true; else break;
    }
  }

  const result = {
    status: 200, profile, stats, videos,
    partial: !u, // profile page was blocked; fell back to embed data only (no video count / full-size photo)
    source: { profilePage: !!u, embed: embedOk },
    fetchedAt: Date.now()
  };
  cacheSet('tt:' + user, result);
  return result;
}

/* ---------------- image fetch ---------------- */
// Returns { status, body?, type?, error? }
async function fetchImage(raw) {
  let u; try { u = new URL(raw); } catch { return { status: 400, error: 'bad_url' }; }
  if (u.protocol !== 'https:' || !IMG_HOSTS.test(u.hostname)) return { status: 403, error: 'host_not_allowed' };
  try {
    const r = await upstream(u.href, { binary: true, timeout: 10000 });
    if (r.status !== 200 || !/^image\//.test(r.type) || r.body.length > 6 * 1024 * 1024) return { status: 502, error: 'image_unavailable' };
    return { status: 200, body: r.body, type: r.type };
  } catch { return { status: 504, error: 'image_timeout' }; }
}

function normUser(raw) { return decodeURIComponent(String(raw || '')).replace(/^@/, '').toLowerCase(); }

module.exports = { tiktokProfile, fetchImage, allow, clientIp, normUser, USER_RX };
