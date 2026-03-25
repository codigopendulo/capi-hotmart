// ============================================================
// MÚSCULO LAB — Instagram DM Webhook
// Endpoint: /api/instagram
// ============================================================

const config = require('../lib/config');
const { processMessage } = require('../lib/agent');

module.exports = async function handler(req, res) {
  // --- GET: Webhook verification ---
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN) {
      console.log('[IG] Webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // --- POST: Incoming messages ---
  if (req.method === 'POST') {
    const body = req.body;

    // Responder 200 inmediatamente (Meta requiere respuesta rápida)
    res.status(200).send('EVENT_RECEIVED');

    try {
      // Procesar cada entry
      if (!body.entry) return;

      for (const entry of body.entry) {
        // Instagram messaging
        const messaging = entry.messaging || [];

        for (const event of messaging) {
          // Solo procesar mensajes de texto (ignorar reacciones, stickers, etc)
          if (!event.message || !event.message.text) continue;

          // Ignorar ecos (mensajes enviados POR nosotros)
          if (event.message.is_echo) continue;

          const senderId = event.sender.id;
          const messageText = event.message.text;

          console.log(`[IG] Mensaje de ${senderId}: ${messageText.substring(0, 100)}`);

          // Procesar con el agente IA
          const response = await processMessage(senderId, messageText, 'instagram');

          // Enviar respuesta por Instagram DM
          await sendInstagramMessage(senderId, response);
        }
      }
    } catch (err) {
      console.error('[IG] Error procesando webhook:', err);
    }

    return;
  }

  res.status(405).send('Method not allowed');
};

// --- Enviar mensaje por Instagram ---
async function sendInstagramMessage(recipientId, text) {
  if (!config.META_PAGE_TOKEN) {
    console.error('[IG] META_PAGE_TOKEN no configurado');
    return;
  }

  try {
    // Instagram usa la misma Graph API que Messenger
    const url = `https://graph.facebook.com/v19.0/me/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: 'RESPONSE',
        access_token: config.META_PAGE_TOKEN,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[IG] Error enviando mensaje: ${res.status}`, err);
    } else {
      console.log(`[IG] Mensaje enviado a ${recipientId}`);
    }
  } catch (err) {
    console.error('[IG] Error enviando mensaje:', err);
  }
}
