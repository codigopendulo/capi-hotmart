// ============================================================
// MÚSCULO LAB — WhatsApp Cloud API Webhook
// Endpoint: /api/whatsapp
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
      console.log('[WA] Webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // --- POST: Incoming messages ---
  if (req.method === 'POST') {
    const body = req.body;

    // Responder 200 inmediatamente
    res.status(200).send('EVENT_RECEIVED');

    try {
      if (!body.entry) return;

      for (const entry of body.entry) {
        const changes = entry.changes || [];

        for (const change of changes) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          if (!value.messages) continue;

          for (const message of value.messages) {
            // Solo texto (ignorar audio, imagen, stickers, etc.)
            if (message.type !== 'text') {
              // Responder que solo procesamos texto
              await sendWhatsAppMessage(
                message.from,
                'Por ahora solo puedo leer mensajes de texto. Escribime tu consulta y te ayudo. 💪'
              );
              continue;
            }

            const senderId = message.from;           // número de teléfono
            const messageText = message.text.body;

            console.log(`[WA] Mensaje de ${senderId}: ${messageText.substring(0, 100)}`);

            // Marcar como leído
            await markAsRead(message.id);

            // Procesar con el agente IA
            const response = await processMessage(`wa_${senderId}`, messageText, 'whatsapp');

            // Enviar respuesta
            await sendWhatsAppMessage(senderId, response);
          }
        }
      }
    } catch (err) {
      console.error('[WA] Error procesando webhook:', err);
    }

    return;
  }

  res.status(405).send('Method not allowed');
};

// --- Enviar mensaje por WhatsApp ---
async function sendWhatsAppMessage(to, text) {
  if (!config.META_PAGE_TOKEN || !config.WHATSAPP_PHONE_ID) {
    console.error('[WA] Token o Phone ID no configurado');
    return;
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${config.WHATSAPP_PHONE_ID}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.META_PAGE_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[WA] Error enviando mensaje: ${res.status}`, err);
    } else {
      console.log(`[WA] Mensaje enviado a ${to}`);
    }
  } catch (err) {
    console.error('[WA] Error enviando mensaje:', err);
  }
}

// --- Marcar como leído ---
async function markAsRead(messageId) {
  if (!config.META_PAGE_TOKEN || !config.WHATSAPP_PHONE_ID) return;

  try {
    await fetch(`https://graph.facebook.com/v19.0/${config.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.META_PAGE_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch {
    // Silenciar errores de read receipt
  }
}

// --- Notificar a Lucas (escalación por WA) ---
async function notifyLucas(customerPhone, motivo) {
  const text = `🚨 ESCALACIÓN AGENTE IA\n\nCliente: ${customerPhone}\nMotivo: ${motivo}\n\nRespondele directamente por WA o IG.`;
  await sendWhatsAppMessage(config.LUCAS_WHATSAPP, text);
}

module.exports.notifyLucas = notifyLucas;
