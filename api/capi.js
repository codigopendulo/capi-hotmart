const crypto = require('crypto');

const CAPI_TOKEN = "EAAU2nRv7I5IBRMoxp6MqNyxuNr68UUrZCPP6z7xqkjljenSn4d4nZAnoe6eZAHmAnepaEaptmnzdRwiXulsRLNLNEUMZA9DjnzjnZAJMWcCSQZC0DIMmlVQ55v7jewmZBfk7CZC2PafOPkve8IFJvirMGtICZCXzgJYWIkLEs3OzUX9ZAiARdBNF35rwij1s3tjpGo0AZDZD";
const HOTMART_HOTTOK = process.env.HOTMART_HOTTOK || "";
const MAIN_PRICE = 9;
const BUMP_PRICE = 6;

// Mapeo por NOMBRE del producto (partial match)
const NAME_RULES = [
  { match: "casa", match2: "mujer", pixel: "4425253034371518", name: "Casa Mujeres INT" },
  { match: "gluteo", pixel: "1280087564046010", name: "Gluteos INT" },
  { match: "recetario", pixel: "875087032201190", name: "Recetario INT" },
  { match: "definici", pixel: "909452265335265", name: "Definicion INT" },
  { match: "mujer", pixel: "1647651849595676", name: "Guia Mujeres INT" },
  { match: "gym", pixel: "890153273827620", name: "Gym INT" },
  { match: "entrenar", pixel: "890153273827620", name: "Gym INT" },
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
    const transactionId = purchase?.transaction || "";
    const approvedDate = purchase?.approved_date || Date.now();
    const isOrderBump = purchase?.offer?.payment_type === "ORDER_BUMP" || purchase?.is_order_bump === true;

    // Mapear por nombre del producto
    const config = matchProduct(productName);
    const pixelId = config?.pixel || FALLBACK_PIXEL;
    const dashName = config?.name || productName;

    // Precio fijo (Hotmart manda moneda local, no sirve)
    const price = isOrderBump ? BUMP_PRICE : MAIN_PRICE;

    const saleDate = new Date(typeof approvedDate === "number" && approvedDate > 1e12 ? approvedDate : (approvedDate || Date.now()));
    const dateKey = saleDate.toISOString().slice(0, 10);

    await redisPush("sales:" + dateKey, {
      t: transactionId, p: dashName, v: price,
      c: "USD", d: dateKey, ts: Math.floor(saleDate.getTime() / 1000),
      bump: isOrderBump ? 1 : 0, oc: offerCode,
    });

    if (isOrderBump) {
      log("info", "Order bump guardado, NO enviado a FB", { product: dashName, value: price });
      return res.status(200).json({ status: "filtered", reason: "order_bump", transaction: transactionId, saved: true });
    }

    if (!config) log("warn", "Producto NO mapeado", { product_name: productName });

    const eventTime = typeof approvedDate === "number" && approvedDate > 1e12 ? Math.floor(approvedDate / 1000) : Math.floor(Date.now() / 1000);
    const nameParts = buyerName.trim().split(/\s+/);
    const eventData = {
      data: [{
        event_name: "Purchase", event_time: eventTime, event_id: "hotmart_" + transactionId,
        action_source: "website", event_source_url: "https://musculolab.lat",
        user_data: {
          ...(sha256(buyerEmail) ? { em: [sha256(buyerEmail)] } : {}),
          ...(sha256(nameParts[0]) ? { fn: [sha256(nameParts[0])] } : {}),
          ...(sha256(nameParts.slice(1).join(" ")) ? { ln: [sha256(nameParts.slice(1).join(" "))] } : {}),
          ...(buyer?.address?.country ? { country: [sha256(buyer.address.country)] } : {}),
        },
        custom_data: { currency: "USD", value: price, content_name: productName, content_type: "product", content_ids: [productId], order_id: transactionId },
      }],
    };

    const fbUrl = "https://graph.facebook.com/v21.0/" + pixelId + "/events?access_token=" + CAPI_TOKEN;
    const fbResponse = await fetch(fbUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventData) });
    const fbResult = await fbResponse.json();

    if (!fbResponse.ok) {
      log("error", "FB CAPI error", { fb_error: fbResult?.error, pixel: pixelId, transaction: transactionId });
      return res.status(200).json({ status: "fb_error", fb_error: fbResult?.error?.message || "unknown", pixel: pixelId, transaction: transactionId });
    }
    log("info", "Purchase enviado a FB", { pixel: pixelId, product: dashName, transaction: transactionId, value: price });
    return res.status(200).json({ status: "ok", pixel: pixelId, product: dashName, transaction: transactionId, events_received: fbResult?.events_received || 0 });
  } catch (err) {
    log("error", "Error", { error: err.message });
    return res.status(200).json({ status: "error", message: err.message });
  }
};
