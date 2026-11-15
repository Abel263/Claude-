const { fetchImage, allow, clientIp } = require('../lib/core');

module.exports = async (req, res) => {
  if (!allow(clientIp(req), 'i', 400)) return res.status(429).json({ error: 'rate_limited' });
  const r = await fetchImage(String(req.query.u || ''));
  if (r.status !== 200) return res.status(r.status).json({ error: r.error });
  res.setHeader('Content-Type', r.type);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).send(r.body);
};
