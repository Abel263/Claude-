const { tiktokProfile, allow, clientIp, normUser, USER_RX } = require('../../../lib/core');

module.exports = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'method' });
  if (!allow(clientIp(req), 'p', 30)) { res.setHeader('Retry-After', '20'); return res.status(429).json({ error: 'rate_limited' }); }
  const user = normUser(req.query.user);
  if (!USER_RX.test(user)) return res.status(400).json({ error: 'invalid_username' });
  const r = await tiktokProfile(user).catch(() => ({ status: 502, error: 'upstream_unavailable' }));
  // Let Vercel's CDN reuse good results for 10 minutes so TikTok isn't asked again and again.
  res.setHeader('Cache-Control', r.status === 200 ? 'public, s-maxage=600, stale-while-revalidate=300' : r.status === 404 ? 'public, s-maxage=300' : 'no-store');
  res.status(r.status).json(r);
};
