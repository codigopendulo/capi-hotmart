const crypto = require('crypto');

const CAPI_TOKEN = "EAAU2nRv7I5IBRMoxp6MqNyxuNr68UUrZCPP6z7xqkjljenSn4d4nZAnoe6eZAHmAnepaEaptmnzdRwiXulsRLNLNEUMZA9DjnzjnZAJMWcCSQZC0DIMmlVQ55v7jewmZBfk7CZC2PafOPkve8IFJvirMGtICZCXzgJYWIkLEs3OzUX9ZAiARdBNF35rwij1s3tjpGo0AZDZD";
const HOTMART_HOTTOK = process.env.HOTMART_HOTTOK || "";

const OFFER_MAP = {
  "I104547441C": { pixel: "890153273827620", name: "Gym INT", landing: "https://gym.musculolab.lat", currency: "USD" },
  "R104629036L": { pixel: "1647651849595676", name: "Guia Mujeres INT", landing: "https://gymmujeres.musculolab.lat", currency: "USD" },
  "Q104712566V": { pixel: "875087032201190", name: "Recetario INT", landing: "https://recetario.musculolab.lat", currency: "USD" },
  "H104799008S": { pixel: "1280087564046010", name: "Gluteos INT", landing: "https://gluteos.musculolab.lat", currency: "USD" },
  "C104936101L": { pixel: "909452265335265", name: "Definicion INT", landing: "https://definicion.musculolab.lat", currency: "USD" },
  "B104990340O": { pixel: "4425253034371518", name: "Casa Mujeres INT", landing: "https://casa.musculolab.lat", currency: "USD" },
};
const PRODUCT_MAP = {};
const FALLBACK_PIXEL = "1557076912260111";
const FALLBACK_LANDING = "https://musculolab.lat";

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

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body;
    log("info", "Webhook recibido", { event: body?.event, product_id: body?.data?.product?.id, offer_code: body?.data?.purchase?.offer?.code });

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
    const purchaseValue = purchase?.price?.value || purchase?.original_offer_price?.value || 0;
    const purchaseCurrency = purchase?.price?.currency_code || "USD";
    const transactionId = purchase?.transaction || "";
    const approvedDate = purchase?.approved_date || Date.now();
    const isOrderBump = purchase?.offer?.payment_type === "ORDER_BUMP" || purchase?.is_order_bump === true;

    const saleDate = new Date(typeof approvedDate === "number" && approvedDate > 1e12 ? approvedDate : (approvedDate || Date.now()));
    const dateKey = saleDate.toISOString().slice(0, 10);
    const config = OFFER_MAP[offerCode] || PRODUCT_MAP[productId] || null;

    await redisPush("sales:" + dateKey, {
      t: transactionId, p: config?.name || productName, v: isOrderBump ? 6 : 9,
      c: purchaseCurrency, d: dateKey, ts: Math.floor(saleDate.getTime() / 1000),
      bump: isOrderBump ? 1 : 0, oc: offerCode,
    });

    if (isOrderBump) {
      log("info", "Order bump guardado, NO enviado a FB", { product: config?.name || productName, value: purchaseValue });
      return res.status(200).json({ status: "filtered", reason: "order_bump", transaction: transactionId, saved: true });
    }

    const pixelId = config?.pixel || FALLBACK_PIXEL;
    const landingUrl = config?.landing || FALLBACK_LANDING;
    const currency = config?.currency || purchaseCurrency || "USD";
    if (!config) log("warn", "Producto NO mapeado", { product_id: productId, offer_code: offerCode });

    const eventTime = typeof approvedDate === "number" && approvedDate > 1e12 ? Math.floor(approvedDate / 1000) : Math.floor(Date.now() / 1000);
    const nameParts = buyerName.trim().split(/\s+/);
    const eventData = {
      data: [{
        event_name: "Purchase", event_time: eventTime, event_id: "hotmart_" + transactionId,
        action_source: "website", event_source_url: landingUrl,
        user_data: {
          ...(sha256(buyerEmail) ? { em: [sha256(buyerEmail)] } : {}),
          ...(sha256(nameParts[0]) ? { fn: [sha256(nameParts[0])] } : {}),
          ...(sha256(nameParts.slice(1).join(" ")) ? { ln: [sha256(nameParts.slice(1).join(" "))] } : {}),
          ...(buyer?.address?.country ? { country: [sha256(buyer.address.country)] } : {}),
        },
        custom_data: { currency, value: parseFloat(purchaseValue) || 0, content_name: productName, content_type: "product", content_ids: [productId], order_id: transactionId },
      }],
    };

    const fbUrl = "https://graph.facebook.com/v21.0/" + pixelId + "/events?access_token=" + CAPI_TOKEN;
    const fbResponse = await fetch(fbUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventData) });
    const fbResult = await fbResponse.json();

    if (!fbResponse.ok) {
      log("error", "FB CAPI error", { fb_error: fbResult?.error, pixel: pixelId, transaction: transactionId });
      return res.status(200).json({ status: "fb_error", fb_error: fbResult?.error?.message || "unknown", pixel: pixelId, transaction: transactionId });
    }
    log("info", "Purchase enviado a FB", { pixel: pixelId, product: config?.name || productName, transaction: transactionId, value: purchaseValue });
    return res.status(200).json({ status: "ok", pixel: pixelId, product: config?.name || productName, transaction: transactionId, events_received: fbResult?.events_received || 0 });
  } catch (err) {
    log("error", "Error", { error: err.message });
    return res.status(200).json({ status: "error", message: err.message });
  }
};
