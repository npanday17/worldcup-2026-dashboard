// Serverless proxy for the ESPN scoreboard API (CORS-safe + CDN-cached).
// `dates` is constrained to YYYYMMDD so this can only ever hit one ESPN path.
// s-maxage lets Vercel's CDN share one copy per day-key across all visitors.
module.exports = async (req, res) => {
  const dates = (req.query && req.query.dates ? String(req.query.dates) : '');
  if (!/^\d{8}$/.test(dates)) {
    res.status(400).json({ error: 'dates must be YYYYMMDD' });
    return;
  }
  try {
    const r = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=' + dates
    );
    if (!r.ok) { res.status(502).json({ error: 'upstream ' + r.status }); return; }
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
};
