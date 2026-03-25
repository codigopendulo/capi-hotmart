// ============================================================
// MÚSCULO LAB — Agente IA — Configuración
// ============================================================
// Todas las keys van como Environment Variables en Vercel
// Settings → Environment Variables → agregar cada una
// ============================================================

module.exports = {
  // --- Claude API ---
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',

  // --- Meta / Facebook ---
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN || 'musculolab_verify_2026',
  META_PAGE_TOKEN: process.env.META_PAGE_TOKEN,       // Page Access Token (IG + WA)
  WHATSAPP_PHONE_ID: process.env.WHATSAPP_PHONE_ID,   // Phone Number ID de WA Cloud API
  PAGE_ID: '980057071859053',

  // --- Shopify ---
  SHOPIFY_SHOP: 'gwi7wa-j3.myshopify.com',
  SHOPIFY_TOKEN: process.env.SHOPIFY_TOKEN,

  // --- Upstash Redis ---
  UPSTASH_URL: process.env.KV_REST_API_URL,
  UPSTASH_TOKEN: process.env.KV_REST_API_TOKEN,

  // --- Escalación ---
  LUCAS_WHATSAPP: '5491164513871',
  LUCAS_NAME: 'Lucas',

  // --- Límites ---
  MAX_CONVERSATION_HISTORY: 10,  // últimos N mensajes en contexto
  CONVERSATION_TTL: 3600,        // 1 hora sin actividad → reset contexto
  MAX_RESPONSE_LENGTH: 500,      // chars máximo por respuesta (IG/WA son mobile)
};
