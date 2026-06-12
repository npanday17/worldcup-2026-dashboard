// Serverless proxy for the Polymarket gamma-api (CORS-safe + CDN-cached).
// Allowlisted to the two World Cup markets the dashboard uses, so it can never
// be turned into an open proxy. The Cache-Control s-maxage lets Vercel's CDN
// serve one shared copy to every visitor, so upstream is hit ~once per window.
const ALLOWED_SLUGS = new Set(['world-cup-winner', 'world-cup-golden-boot-winner']);

module.exports = async (req, res) => {
  const slug = (req.query && req.query.slug ? String(req.query.slug) : '');
  if (!ALLOWED_SLUGS.has(slug)) {
    res.status(400).json({ error: 'slug not allowed' });
    return;
  }
  try {
    const r = await fetch(
      'https://gamma-api.polymarket.com/events?slug=' + encodeURIComponent(slug),
      { headers: { accept: 'application/json' } }
    );
    if (!r.ok) { res.status(502).json({ error: 'upstream ' + r.status }); return; }
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
};
