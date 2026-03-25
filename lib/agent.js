// ============================================================
// MÚSCULO LAB — Agente IA Principal
// Claude API con tool use + contexto conversacional
// ============================================================

const config = require('./config');
const { PRODUCTOS, INSTRUCCIONES_DESCARGA } = require('./knowledge');
const { searchAllOrders } = require('./orders');

// ========== SYSTEM PROMPT ==========
const SYSTEM_PROMPT = `Sos el asistente de atención al cliente de Músculo Lab (@musculo.lab), una marca de fitness que vende ebooks digitales (guías de entrenamiento, recetarios, etc).

PERSONALIDAD:
- Hablás en español rioplatense casual (vos, sos, tenés, dale, etc.)
- Sos amable, directo y resolutivo — no das vueltas
- Usás emojis con moderación (💪🔥✅📱)
- Sos experto en fitness pero no te hacés el sabelotodo
- Respondé SIEMPRE en menos de 4 oraciones cortas (la gente está en el celu)

PRODUCTOS DISPONIBLES (todos incluyen ebook principal + bonos):
${PRODUCTOS.map(p => `• ${p.nombre} — ${p.precio_ar} / ${p.precio_usd} — ${p.descripcion}`).join('\n')}

MÉTODOS DE PAGO:
- Argentina: MercadoPago (tarjeta, débito, transferencia, cuotas)
- Internacional: Hotmart (tarjeta, PayPal)

FORMATO DE EBOOKS: PDF, se descargan al celular/tablet/compu, acceso de por vida.

INSTRUCCIONES DE DESCARGA:
- Shopify (AR): Llega email con link de descarga. Revisar spam.
- Hotmart (INT): Entrar a hotmart.com → Mis Compras → Acceder → Descargar PDFs.

REGLAS IMPORTANTES:
1. Si alguien dice que no le llegó el ebook → pedí su EMAIL DE COMPRA y usá la herramienta buscar_ordenes
2. Si alguien pregunta por un producto → recomendá el más adecuado y mandá el link
3. Si alguien quiere reembolso → buscá la orden primero, después escalá a un humano
4. NUNCA inventes información de órdenes — si no encontrás, decilo
5. Si no podés resolver algo → usá la herramienta escalar_a_humano
6. Para preguntas de entrenamiento específicas (ej: "qué ejercicio hago para X") → respondé brevemente y mencioná que la guía lo cubre en detalle
7. Si alguien saluda → saludá y preguntá en qué podés ayudar
8. Si detectás que la persona es de Argentina → usá precios AR y links AR. Si es de otro país → USD y Hotmart.
9. Cuando mandes un link de producto, SIEMPRE preguntá de dónde es para dar el link correcto (AR o internacional)

COSAS QUE NO HACÉS:
- No das planes de entrenamiento personalizados gratis (para eso están los ebooks)
- No diagnosticás lesiones ni condiciones médicas
- No procesás pagos ni reembolsos directamente
- No compartas datos internos del negocio`;

// ========== TOOLS ==========
const TOOLS = [
  {
    name: 'buscar_ordenes',
    description: 'Busca órdenes de compra por email del cliente en Shopify (Argentina) y Hotmart (internacional). Usá esta herramienta cuando alguien dice que no le llegó el ebook, tiene problemas con la descarga, o querés verificar una compra.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Email del cliente con el que hizo la compra',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'recomendar_producto',
    description: 'Recomienda un producto basado en lo que el cliente necesita. Usá esta herramienta cuando alguien pregunta qué producto le conviene, quiere empezar a entrenar, o pregunta qué vendemos.',
    input_schema: {
      type: 'object',
      properties: {
        necesidad: {
          type: 'string',
          description: 'Lo que el cliente necesita o busca (ej: entrenar en casa, glúteos, definir, recetas, gym)',
        },
        genero: {
          type: 'string',
          enum: ['mujer', 'hombre', 'no_especificado'],
          description: 'Género del cliente si se puede inferir',
        },
        ubicacion: {
          type: 'string',
          enum: ['argentina', 'internacional', 'no_especificado'],
          description: 'Si es de Argentina o internacional',
        },
      },
      required: ['necesidad'],
    },
  },
  {
    name: 'escalar_a_humano',
    description: 'Escalá a Lucas (el dueño) cuando no podés resolver el problema. Usá para: reembolsos, quejas serias, problemas técnicos complejos, o cuando el cliente pide hablar con una persona.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description: 'Resumen breve del problema para Lucas',
        },
        urgencia: {
          type: 'string',
          enum: ['baja', 'media', 'alta'],
          description: 'Nivel de urgencia',
        },
      },
      required: ['motivo'],
    },
  },
];

// ========== TOOL EXECUTION ==========
async function executeTool(toolName, toolInput) {
  switch (toolName) {
    case 'buscar_ordenes': {
      const result = await searchAllOrders(toolInput.email);
      let response = '';

      // Shopify
      if (result.shopify.ok && result.shopify.found) {
        const orders = result.shopify.orders;
        response += `SHOPIFY (Argentina):\n`;
        orders.forEach(o => {
          response += `- Orden #${o.order_number} | ${o.created_at.split('T')[0]} | ${o.products} | ${o.total_price} ${o.currency} | Estado: ${o.financial_status}\n`;
        });
      } else if (result.shopify.ok) {
        response += `SHOPIFY: No se encontraron órdenes con ese email.\n`;
      } else {
        response += `SHOPIFY: Error buscando — ${result.shopify.error}\n`;
      }

      // Hotmart
      if (result.hotmart.ok && result.hotmart.found) {
        response += `\nHOTMART (Internacional):\n`;
        result.hotmart.sales.forEach(s => {
          response += `- ${s.product || 'Producto'} | ${s.date || 'fecha desconocida'} | ${s.price || ''}\n`;
        });
      } else if (result.hotmart.ok) {
        response += `HOTMART: No se encontraron compras con ese email.\n`;
      } else {
        response += `HOTMART: ${result.hotmart.error}\n`;
      }

      return response || 'No se encontraron órdenes en ninguna plataforma.';
    }

    case 'recomendar_producto': {
      const { necesidad, genero, ubicacion } = toolInput;
      const lower = necesidad.toLowerCase();
      let recomendaciones = [];

      // Lógica de recomendación
      if (lower.includes('casa') || lower.includes('hogar') || lower.includes('sin gym') || lower.includes('sin equip')) {
        recomendaciones.push(PRODUCTOS.find(p => p.id === 'casa_mujeres'));
      }
      if (lower.includes('glúteo') || lower.includes('gluteo') || lower.includes('cola')) {
        recomendaciones.push(PRODUCTOS.find(p => p.id === 'gluteos'));
      }
      if (lower.includes('defini') || lower.includes('bajar') || lower.includes('grasa') || lower.includes('marcar')) {
        recomendaciones.push(PRODUCTOS.find(p => p.id === 'definicion'));
      }
      if (lower.includes('receta') || lower.includes('comida') || lower.includes('cocin') || lower.includes('nutri') || lower.includes('dieta')) {
        recomendaciones.push(PRODUCTOS.find(p => p.id === 'recetario'));
      }
      if (lower.includes('gym') || lower.includes('gimnas') || lower.includes('pesas') || lower.includes('fuerza')) {
        if (genero === 'mujer') {
          recomendaciones.push(PRODUCTOS.find(p => p.id === 'mujeres'));
        } else {
          recomendaciones.push(PRODUCTOS.find(p => p.id === 'gym'));
        }
      }

      // Si no matcheó nada, recomendar según género
      if (recomendaciones.length === 0) {
        if (genero === 'mujer') {
          recomendaciones = [
            PRODUCTOS.find(p => p.id === 'mujeres'),
            PRODUCTOS.find(p => p.id === 'casa_mujeres'),
          ];
        } else {
          recomendaciones = [
            PRODUCTOS.find(p => p.id === 'gym'),
            PRODUCTOS.find(p => p.id === 'definicion'),
          ];
        }
      }

      // Filtrar nulls
      recomendaciones = recomendaciones.filter(Boolean);

      // Formatear respuesta con links según ubicación
      let resp = 'PRODUCTOS RECOMENDADOS:\n';
      recomendaciones.forEach(p => {
        const link = ubicacion === 'argentina' ? p.landing_ar : ubicacion === 'internacional' ? p.landing_int : `AR: ${p.landing_ar} | INT: ${p.landing_int}`;
        resp += `\n📖 ${p.nombre}\n${p.descripcion}\nPrecio: ${ubicacion === 'internacional' ? p.precio_usd : ubicacion === 'argentina' ? p.precio_ar : `${p.precio_ar} / ${p.precio_usd}`}\nBonos: ${p.bonos.join(', ')}\nLink: ${link}\n`;
      });

      return resp;
    }

    case 'escalar_a_humano': {
      // En producción, acá se manda un mensaje a Lucas por WA
      // Por ahora retornamos la info para que el agente le avise al cliente
      return `ESCALADO: Motivo: ${toolInput.motivo} | Urgencia: ${toolInput.urgencia || 'media'}. Lucas va a ser notificado y te va a responder lo antes posible.`;
    }

    default:
      return `Herramienta "${toolName}" no reconocida.`;
  }
}

// ========== REDIS HELPERS ==========
async function getConversation(senderId) {
  if (!config.UPSTASH_URL) return [];
  try {
    const key = `conv:${senderId}`;
    const res = await fetch(`${config.UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${config.UPSTASH_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : [];
  } catch {
    return [];
  }
}

async function saveConversation(senderId, messages) {
  if (!config.UPSTASH_URL) return;
  try {
    const key = `conv:${senderId}`;
    // Mantener solo los últimos N mensajes
    const trimmed = messages.slice(-config.MAX_CONVERSATION_HISTORY * 2);
    await fetch(`${config.UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', key, JSON.stringify(trimmed), 'EX', config.CONVERSATION_TTL]),
    });
  } catch (err) {
    console.error('Error saving conversation:', err);
  }
}

// Guardar escalación en Redis para que Lucas la vea
async function saveEscalation(senderId, platform, motivo) {
  if (!config.UPSTASH_URL) return;
  try {
    const timestamp = new Date().toISOString();
    const key = `escalation:${timestamp}`;
    const data = { senderId, platform, motivo, timestamp, resolved: false };
    await fetch(`${config.UPSTASH_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', key, JSON.stringify(data), 'EX', 86400 * 7]), // 7 días
    });
  } catch (err) {
    console.error('Error saving escalation:', err);
  }
}

// ========== MAIN AGENT ==========
async function processMessage(senderId, messageText, platform = 'instagram') {
  if (!config.ANTHROPIC_API_KEY) {
    return 'Disculpá, estamos teniendo un problema técnico. Escribinos en un ratito. 🙏';
  }

  try {
    // 1. Obtener historial de conversación
    const history = await getConversation(senderId);

    // 2. Agregar mensaje del usuario
    history.push({ role: 'user', content: messageText });

    // 3. Llamar a Claude API
    let messages = history.map(m => ({ role: m.role, content: m.content }));
    let assistantResponse = '';
    let iterations = 0;
    const MAX_ITERATIONS = 5; // prevenir loops

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const body = {
        model: config.CLAUDE_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
        tools: TOOLS,
      };

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Claude API error ${res.status}:`, errText);
        return 'Disculpá, estamos teniendo un problema técnico. Probá de nuevo en unos minutos. 🙏';
      }

      const data = await res.json();

      // Procesar respuesta
      if (data.stop_reason === 'end_turn' || data.stop_reason === 'stop') {
        // Respuesta final de texto
        assistantResponse = data.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        break;
      }

      if (data.stop_reason === 'tool_use') {
        // Ejecutar tools
        const toolUseBlocks = data.content.filter(c => c.type === 'tool_use');
        const toolResults = [];

        for (const tool of toolUseBlocks) {
          console.log(`[Agent] Tool: ${tool.name}`, JSON.stringify(tool.input));
          const result = await executeTool(tool.name, tool.input);

          // Si es escalación, guardar
          if (tool.name === 'escalar_a_humano') {
            await saveEscalation(senderId, platform, tool.input.motivo);
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: result,
          });
        }

        // Agregar la respuesta del assistant y los tool results al historial
        messages.push({ role: 'assistant', content: data.content });
        messages.push({ role: 'user', content: toolResults });
      } else {
        // Respuesta sin tool use (text)
        assistantResponse = data.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        break;
      }
    }

    // 4. Truncar respuesta si es muy larga para mobile
    if (assistantResponse.length > config.MAX_RESPONSE_LENGTH) {
      // Cortar en el último punto/salto de línea antes del límite
      const cutoff = assistantResponse.lastIndexOf('.', config.MAX_RESPONSE_LENGTH);
      if (cutoff > config.MAX_RESPONSE_LENGTH * 0.5) {
        assistantResponse = assistantResponse.substring(0, cutoff + 1);
      } else {
        assistantResponse = assistantResponse.substring(0, config.MAX_RESPONSE_LENGTH) + '...';
      }
    }

    // 5. Guardar conversación actualizada
    history.push({ role: 'assistant', content: assistantResponse });
    await saveConversation(senderId, history);

    return assistantResponse;
  } catch (err) {
    console.error('[Agent] Error:', err);
    return 'Disculpá, tuve un error. Probá de nuevo o escribinos por WhatsApp al 5491164513871. 🙏';
  }
}

module.exports = { processMessage };
