// ============================================================
// MÚSCULO LAB — Agent Health Check
// Endpoint: /api/agent-health
// ============================================================

const config = require('../lib/config');

module.exports = async function handler(req, res) {
  const checks = {
    anthropic_key: !!config.ANTHROPIC_API_KEY,
    meta_page_token: !!config.META_PAGE_TOKEN,
    meta_verify_token: !!config.META_VERIFY_TOKEN,
    whatsapp_phone_id: !!config.WHATSAPP_PHONE_ID,
    shopify_token: !!config.SHOPIFY_TOKEN,
    redis_url: !!config.UPSTASH_URL,
    redis_token: !!config.UPSTASH_TOKEN,
  };

  const allGood = Object.values(checks).every(v => v);

  res.status(200).json({
    status: allGood ? 'OK' : 'MISSING_CONFIG',
    checks,
    timestamp: new Date().toISOString(),
  });
};
