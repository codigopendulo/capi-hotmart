const crypto = require('crypto');
const CAPI_TOKEN = process.env.CAPI_TOKEN || "";
const HOTMART_HOTTOK = process.env.HOTMART_HOTTOK || "";
const KLAVIYO_PRIVATE_API_KEY = process.env.KLAVIYO_PRIVATE_API_KEY || "";
const KLAVIYO_API_VERSION = "2024-10-15";
const FB_API_VERSION = "v21.0";
const MAIN_PRICE = 9;
const BUMP_PRICE = 6;
// Mapeo por NOMBRE del producto (partial match)
// avatar_type se usa para segmentación en Klaviyo
const NAME_RULES = [
  { match: "contractura", pixel: "1036294476026316", name: "Chau Contracturas INT", avatar_type: "general" },
  { match: "masaje", pixel: "1036294476026316", name: "Chau Contracturas INT", avatar_type: "general" },
  { match: "keto", pixel: "1505031714597684", name: "Keto Reto INT", avatar_type: "general" },
  { match: "atleta", pixel: "1301395001965987", name: "Atleta Hibrido INT", avatar_type: "general" },
  { match: "hibrido", pixel: "1301395001965987", name: "Atleta Hibrido INT", avatar_type: "general" },
  { match: "menopaus", pixel: "973331068507360", name: "Menopausia INT", avatar_type: "menopausia" },
  { match: "movilidad", pixel: "1652293156214890", name: "Movilidad INT", avatar_type: "general" },
  { match: "casa", match2: "mujer", pixel: "4425253034371518", name: "Casa Mujeres INT", avatar_type: "mujer" },
  { match: "gluteo", pixel: "1280087564046010", name: "Gluteos INT", avatar_type: "mujer" },
  { match: "tortas", pixel: "1583923546681286", name: "Tortas INT", avatar_type: "general" },
  { match: "fryer", pixel: "2742914289411827", name: "Air Fryer INT", avatar_type: "general" },
  { match: "prote", pixel: "2081677916076217", name: "Proteina INT", avatar_type: "general" },
  { match: "recetario", pixel: "875087032201190", name: "Recetario INT", avatar_type: "general" },
  { match: "definici", pixel: "909452265335265", name: "Definicion INT", avatar_type: "general" },
  { match: "mujer", pixel: "1647651849595676", name: "Guia Mujeres INT", avatar_type: "mujer" },
  { match: "gym", pixel: "890153273827620", name: "Gym INT", avatar_type: "principiante" },
  { match: "entrenar", pixel: "890153273827620", name: "Gym INT", avatar_type: "principiante" },
];
const FALLBACK_PIXEL = "1557076912260111";
const FALLBACK_NAME = "Desconocido";
function matchProduct(productName) {
  const low = (productName || "").toLowerCase();
  for (const rule of NAME_RULES) {
    if (!low.includes(rule.match)) continue;
    if (rule.match2 && !low.includes(rule.match2)) continue;
    return rule;
  }
  return null;
}
function sha256(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(value.toString().trim().toLowerCase()).digest("hex");
}
function log(level, msg, data = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message: msg, ...data }));
}
async function redisPush(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(["LPUSH", key, JSON.stringify(value)])
    });
    return await r.json();
  } catch (e) { log("error", "Redis error", { error: e.message }); return null; }
}
// ============================================================================
// FB CONVERSIONS API — REACTIVADO (junio 2026)
// Vuelve a ser la ÚNICA fuente de Purchase hacia Meta (apagar el pixel nativo
// de Hotmart para no contar doble). Dedup determinístico: event_id = transaction.
// ============================================================================
async function sendToFacebook({ pixelId, email, firstName, lastName, country, value, eventTime, transactionId, eventSourceUrl }) {
  if (!CAPI_TOKEN) {
    log("warn", "CAPI_TOKEN no configurada, skip FB");
    return { status: "skipped", reason: "no_token" };
  }
  if (!pixelId) {
    log("warn", "Sin pixelId, skip FB", { transaction: transactionId });
    return { status: "skipped", reason: "no_pixel" };
  }
  const userData = {};
  if (email) userData.em = [sha256(email)];
  if (firstName) userData.fn = [sha256(firstName)];
  if (lastName) userData.ln = [sha256(lastName)];
  if (country) userData.country = [sha256(country)];
  const eventBody = {
    data: [{
      event_name: "Purchase",
      event_time: eventTime,
      event_id: String(transactionId),          // dedup determinístico (= transaction Hotmart)
      action_source: "website",
      event_source_url: eventSourceUrl || "https://musculolab.lat",
      user_data: userData,
      custom_data: { currency: "USD", value: value }
    }]
  };
  try {
    const url = "https://graph.facebook.com/" + FB_API_VERSION + "/" + pixelId + "/events?access_token=" + CAPI_TOKEN;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventBody)
    });
    const resp = await r.json().catch(() => ({}));
    if (r.ok) {
      log("info", "FB CAPI Purchase enviado OK", { pixel: pixelId, transaction: transactionId, value, events_received: resp?.events_received });
      return { status: "ok" };
    }
    log("error", "FB CAPI error", { status: r.status, body: JSON.stringify(resp).slice(0, 500), transaction: transactionId });
    return { status: "error", code: r.status };
  } catch (e) {
    log("error", "FB CAPI exception", { error: e.message, transaction: transactionId });
    return { status: "exception", error: e.message };
  }
}
// ============================================================================
// BRIDGE KLAVIYO — agregado v0.3 del Prompt Maestro Email Marketing
// ============================================================================
// Dedupe: chequea en Redis si ya enviamos esta transacción a Klaviyo
async function klaviyoAlreadySent(transactionId) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token || !transactionId) return false;
  try {
    const key = "klaviyo_sent:" + transactionId;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", key])
    });
    const data = await r.json();
    return data?.result === "1";
  } catch (e) {
    log("warn", "Klaviyo dedupe check failed (continuing)", { error: e.message });
    return false;
  }
}
// Marca en Redis que ya enviamos esta transacción (TTL 24hs)
async function klaviyoMarkSent(transactionId) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token || !transactionId) return;
  try {
    const key = "klaviyo_sent:" + transactionId;
    await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, "1", "EX", "86400"])
    });
  } catch (e) {
    log("warn", "Klaviyo mark sent failed (continuing)", { error: e.message });
  }
}
// Detecta idioma/locale del buyer en función del país
function detectLanguage(country) {
  const c = (country || "").toUpperCase();
  if (c === "AR" || c === "ARG" || c === "ARGENTINA") return "es-AR";
  return "es-neutro";
}
// Envía evento custom a Klaviyo: "Hotmart Order Placed"
// Klaviyo crea automáticamente el perfil si no existe
async function sendToKlaviyo(payload) {
  if (!KLAVIYO_PRIVATE_API_KEY) {
    log("warn", "KLAVIYO_PRIVATE_API_KEY no configurada, skip");
    return { status: "skipped", reason: "no_api_key" };
  }
  if (!payload.email) {
    log("warn", "Klaviyo skip: sin email", { transaction: payload.transactionId });
    return { status: "skipped", reason: "no_email" };
  }
  // Dedupe
  const alreadySent = await klaviyoAlreadySent(payload.transactionId);
  if (alreadySent) {
    log("info", "Klaviyo dedupe hit, skip duplicate", { transaction: payload.transactionId });
    return { status: "deduped" };
  }
  const nameParts = (payload.fullName || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
  const eventBody = {
    data: {
      type: "event",
      attributes: {
        properties: {
          product_name: payload.productName,
          product_match_key: payload.matchKey || "unknown",
          avatar_type: payload.avatarType || "general",
          value_usd: payload.value,
          currency: "USD",
          order_id: payload.transactionId,
          is_order_bump: payload.isOrderBump,
          source_platform: "hotmart",
          language: payload.language,
          country: payload.country || "",
          dashboard_name: payload.dashName || ""
        },
        time: new Date(payload.eventTime * 1000).toISOString(),
        value: payload.value,
        value_currency: "USD",
        unique_id: "hotmart_" + payload.transactionId + (payload.isOrderBump ? "_bump" : "_main"),
        metric: {
          data: {
            type: "metric",
            attributes: { name: "Hotmart Order Placed" }
          }
        },
        profile: {
          data: {
            type: "profile",
            attributes: {
              email: payload.email,
              first_name: firstName,
              last_name: lastName,
              location: { country: payload.country || "" },
              properties: {
                source_platform: "hotmart",
                language: payload.language,
                avatar_type: payload.avatarType || "general",
                last_hotmart_product: payload.productName,
                last_hotmart_purchase_date: new Date(payload.eventTime * 1000).toISOString()
              }
            }
          }
        }
      }
    }
  };
  try {
    const url = "https://a.klaviyo.com/api/events/";
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Klaviyo-API-Key " + KLAVIYO_PRIVATE_API_KEY,
        "Content-Type": "application/json",
        "accept": "application/json",
        "revision": KLAVIYO_API_VERSION
      },
      body: JSON.stringify(eventBody)
    });
    if (r.status === 202 || r.status === 200) {
      await klaviyoMarkSent(payload.transactionId);
      log("info", "Klaviyo event enviado OK", {
        transaction: payload.transactionId,
        email: payload.email,
        product: payload.productName,
        avatar: payload.avatarType,
        bump: payload.isOrderBump
      });
      return { status: "ok" };
    } else {
      const errText = await r.text().catch(() => "");
      log("error", "Klaviyo API error", {
        status: r.status,
        body: errText.slice(0, 500),
        transaction: payload.transactionId
      });
      return { status: "error", code: r.status };
    }
  } catch (e) {
    log("error", "Klaviyo fetch exception", {
      error: e.message,
      transaction: payload.transactionId
    });
    return { status: "exception", error: e.message };
  }
}
// ============================================================================
// HANDLER PRINCIPAL — original + FB CAPI reactivado + bridge Klaviyo
// ============================================================================
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = req.body;
    log("info", "Webhook recibido", { event: body?.event, product_name: body?.data?.product?.name, offer_code: body?.data?.purchase?.offer?.code });
    if (HOTMART_HOTTOK) {
      const receivedToken = body?.hottok || req.headers["x-hotmart-hottok"] || "";
      if (receivedToken !== HOTMART_HOTTOK) return res.status(401).json({ error: "Invalid hottok" });
    }
    const event = body?.event;
    if (!/^PURCHASE_(APPROVED|COMPLETE|PROTEST)$/.test(event)) {
      return res.status(200).json({ status: "ignored", reason: "event " + event + " not tracked" });
    }
    const data = body?.data || {};
    const product = data?.product || {};
    const buyer = data?.buyer || {};
    const purchase = data?.purchase || {};
    const productId = String(product?.id || "");
    const productName = product?.name || "";
    const offerCode = purchase?.offer?.code || "";
    const buyerEmail = buyer?.email || "";
    const buyerName = buyer?.name || "";
    const buyerCountry = buyer?.address?.country || "";
    const transactionId = purchase?.transaction || "";
    const approvedDate = purchase?.approved_date || Date.now();
    const isOrderBump = purchase?.offer?.payment_type === "ORDER_BUMP" || purchase?.is_order_bump === true;
    // Mapear por nombre del producto
    const config = matchProduct(productName);
    const pixelId = config?.pixel || FALLBACK_PIXEL;
    const dashName = config?.name || productName;
    const avatarType = config?.avatar_type || "general";
    const matchKey = config?.match || "unknown";
    // Precio fijo (Hotmart manda moneda local, no sirve)
    const price = isOrderBump ? BUMP_PRICE : MAIN_PRICE;
    const saleDate = new Date(typeof approvedDate === "number" && approvedDate > 1e12 ? approvedDate : (approvedDate || Date.now()));
    const dateKey = saleDate.toISOString().slice(0, 10);
    const eventTime = typeof approvedDate === "number" && approvedDate > 1e12 ? Math.floor(approvedDate / 1000) : Math.floor(Date.now() / 1000);
    await redisPush("sales:" + dateKey, {
      t: transactionId, p: dashName, v: price,
      c: "USD", d: dateKey, ts: Math.floor(saleDate.getTime() / 1000),
      bump: isOrderBump ? 1 : 0, oc: offerCode,
    });
    // ========================================================================
    // BRIDGE KLAVIYO — fire-and-forget, NO bloquea el flujo principal
    // ========================================================================
    try {
      const klaviyoResult = await sendToKlaviyo({
        email: buyerEmail,
        fullName: buyerName,
        country: buyerCountry,
        language: detectLanguage(buyerCountry),
        productName: productName,
        dashName: dashName,
        matchKey: matchKey,
        avatarType: avatarType,
        value: price,
        transactionId: transactionId,
        isOrderBump: isOrderBump,
        eventTime: eventTime
      });
      log("info", "Klaviyo bridge result", { result: klaviyoResult.status, transaction: transactionId });
    } catch (klErr) {
      log("error", "Klaviyo bridge exception (ignored, FB sigue)", { error: klErr.message, transaction: transactionId });
    }
    // ========================================================================
    // FB CAPI — order bumps NO se mandan a Facebook (señal limpia)
    // ========================================================================
    if (isOrderBump) {
      return res.status(200).json({ status: "ok", reason: "order_bump", transaction: transactionId, saved: true });
    }
    if (!config) log("warn", "Producto NO mapeado, usando fallback pixel", { product_name: productName, pixel: FALLBACK_PIXEL });
    let fbStatus = "skipped";
    try {
      const nameParts = (buyerName || "").trim().split(/\s+/);
      const fbResult = await sendToFacebook({
        pixelId: pixelId,
        email: buyerEmail,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        country: buyerCountry,
        value: price,
        eventTime: eventTime,
        transactionId: transactionId
      });
      fbStatus = fbResult.status;
    } catch (fbErr) {
      log("error", "FB CAPI exception (ignored)", { error: fbErr.message, transaction: transactionId });
    }
    log("info", "Purchase procesado", { pixel: pixelId, product: dashName, transaction: transactionId, value: price, fb: fbStatus });
    return res.status(200).json({ status: "ok", pixel: pixelId, product: dashName, transaction: transactionId, fb: fbStatus, saved: true });
  } catch (err) {
    log("error", "Error", { error: err.message });
    return res.status(200).json({ status: "error", message: err.message });
  }
};
