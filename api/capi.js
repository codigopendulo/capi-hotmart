const crypto = require('crypto');

const CAPI_TOKEN = "EAAU2nRv7I5IBRMoxp6MqNyxuNr68UUrZCPP6z7xqkjljenSn4d4nZAnoe6eZAHmAnepaEaptmnzdRwiXulsRLNLNEUMZA9DjnzjnZAJMWcCSQZC0DIMmlVQ55v7jewmZBfk7CZC2PafOPkve8IFJvirMGtICZCXzgJYWIkLEs3OzUX9ZAiARdBNF35rwij1s3tjpGo0AZDZD";

const HOTMART_HOTTOK = process.env.HOTMART_HOTTOK || "";

const OFFER_MAP = {
  "I104547441C": {
    pixel: "890153273827620",
    landing: "https://gym.musculolab.lat",
    currency: "USD",
    name: "Gym INT",
  },
  "R104629036L": {
    pixel: "1647651849595676",
    landing: "https://gymmujeres.musculolab.lat",
    currency: "USD",
    name: "Guia Mujeres INT",
  },
  "Q104712566V": {
    pixel: "875087032201190",
    landing: "https://recetario.musculolab.lat",
    currency: "USD",
    name: "Recetario INT",
  },
  "H104799008S": {
    pixel: "1280087564046010",
    landing: "https://gluteos.musculolab.lat",
    currency: "USD",
    name: "Gluteos INT",
  },
  "C104936101L": {
    pixel: "909452265335265",
    landing: "https://definicion.musculolab.lat",
    currency: "USD",
    name: "Definicion INT",
  },
  "B104990340O": {
    pixel: "4425253034371518",
    landing: "https://casa.musculolab.lat",
    currency: "USD",
    name: "Casa Mujeres INT",
  },
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

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body;

    log("info", "Webhook recibido", {
      event: body?.event,
      product_id: body?.data?.product?.id,
      product_name: body?.data?.product?.name,
      offer_code: body?.data?.purchase?.offer?.code,
    });

    if (HOTMART_HOTTOK) {
      const receivedToken = body?.hottok || req.headers["x-hotmart-hottok"] || "";
      if (receivedToken !== HOTMART_HOTTOK) {
        log("warn", "Hottok invalido", { received: receivedToken?.slice(0, 10) + "..." });
        return res.status(401).json({ error: "Invalid hottok" });
      }
    }

    const event = body?.event;
    const VALID_EVENTS = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE", "PURCHASE_PROTEST"];

    if (!VALID_EVENTS.includes(event)) {
      log("info", "Evento ignorado", { event });
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

    const isOrderBump =
      purchase?.offer?.payment_type === "ORDER_BUMP" ||
      purchase?.is_order_bump === true ||
      (purchase?.offer?.key && purchase?.parent_purchase_transaction);

    if (isOrderBump) {
      log("info", "Order bump filtrado", {
        product_id: productId,
        product_name: productName,
        transaction: transactionId,
        value: purchaseValue,
      });
      return res.status(200).json({ status: "filtered", reason: "order_bump", transaction: transactionId });
    }

    const config = OFFER_MAP[offerCode] || PRODUCT_MAP[productId] || null;
    const pixelId = config?.pixel || FALLBACK_PIXEL;
    const landingUrl = config?.landing || FALLBACK_LANDING;
    const currency = config?.currency || purchaseCurrency || "USD";

    if (!config) {
      log("warn", "Producto NO mapeado — fallback", {
        product_id: productId,
        offer_code: offerCode,
        product_name: productName,
        fallback_pixel: FALLBACK_PIXEL,
      });
    }

    const eventTime = Math.floor(
      (typeof approvedDate === "number" ? approvedDate : new Date(approvedDate).getTime()) / 1000
    );

    const nameParts = buyerName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const eventData = {
      data: [
        {
          event_name: "Purchase",
          event_time: eventTime || Math.floor(Date.now() / 1000),
          event_id: "hotmart_" + transactionId,
          action_source: "website",
          event_source_url: landingUrl,
          user_data: {
            ...(sha256(buyerEmail) ? { em: [sha256(buyerEmail)] } : {}),
            ...(sha256(firstName) ? { fn: [sha256(firstName)] } : {}),
            ...(sha256(lastName) ? { ln: [sha256(lastName)] } : {}),
            ...(buyer?.address?.country ? { country: [sha256(buyer.address.country)] } : {}),
          },
          custom_data: {
            currency: currency,
            value: parseFloat(purchaseValue) || 0,
            content_name: productName,
            content_type: "product",
            content_ids: [productId],
            order_id: transactionId,
          },
        },
      ],
    };

    const FB_API_VERSION = "v21.0";
    const fbUrl = "https://graph.facebook.com/" + FB_API_VERSION + "/" + pixelId + "/events?access_token=" + CAPI_TOKEN;

    const fbResponse = await fetch(fbUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData),
    });

    const fbResult = await fbResponse.json();

    if (!fbResponse.ok) {
      log("error", "Facebook CAPI error", {
        status: fbResponse.status,
        fb_error: fbResult?.error,
        pixel: pixelId,
        product: productName,
        transaction: transactionId,
      });
      return res.status(200).json({
        status: "fb_error",
        fb_status: fbResponse.status,
        fb_error: fbResult?.error?.message || "unknown",
        pixel: pixelId,
        transaction: transactionId,
      });
    }

    log("info", "Purchase enviado a Facebook CAPI", {
      pixel: pixelId,
      product: config?.name || productName,
      transaction: transactionId,
      value: purchaseValue,
      currency: currency,
      fb_events_received: fbResult?.events_received,
    });

    return res.status(200).json({
      status: "ok",
      pixel: pixelId,
      product: config?.name || productName,
      transaction: transactionId,
      events_received: fbResult?.events_received || 0,
    });
  } catch (err) {
    log("error", "Error procesando webhook", { error: err.message, stack: err.stack });
    return res.status(200).json({ status: "error", message: err.message });
  }
};
