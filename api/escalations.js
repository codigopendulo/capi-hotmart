// ============================================================
// MÚSCULO LAB — Escalaciones Pendientes
// Endpoint: /api/escalations
// ============================================================

const config = require('../lib/config');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  if (!config.UPSTASH_URL) return res.status(500).json({ error: 'Redis no configurado' });

  try {
    // Buscar todas las keys de escalación
    const scanRes = await fetch(`${config.UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['KEYS', 'escalation:*']),
    });

    const scanData = await scanRes.json();
    const keys = scanData.result || [];

    if (keys.length === 0) {
      return res.status(200).json({ escalations: [], count: 0 });
    }

    // Obtener cada escalación
    const escalations = [];
    for (const key of keys.slice(0, 50)) { // max 50
      const getRes = await fetch(`${config.UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${config.UPSTASH_TOKEN}` },
      });
      const getData = await getRes.json();
      if (getData.result) {
        escalations.push(JSON.parse(getData.result));
      }
    }

    // Ordenar por fecha, más reciente primero
    escalations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({ escalations, count: escalations.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
