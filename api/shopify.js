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
  } catch (e) { return null; }
}

const HANDLE_MAP = {
  "como-entrenar-bien-en-el-gym": "Gym AR",
  "como-entrenar-bien-en-el-gym-guia-completa-4-bonos": "Gym AR",
  "guia-de-entrenamiento-para-mujeres": "Gym Mujeres AR",
  "guia-de-entrenamiento-para-mujeres-pack-completo-4-bonos": "Gym Mujeres AR",
  "recetario-fitness": "Recetario AR",
  "recetario-fitness-108-recetas-con-macros-calculados-5-bonos": "Recetario AR",
  "gluteosconciencia": "Gluteos AR",
  "definicion-con-ciencia": "Definicion AR",
  "definicion-con-ciencia-el-sistema-completo-para-definir-4-bonos": "Definicion AR",
  "entrenamiento-en-casa-para-mujeres": "Casa Mujeres AR",
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const order = req.body;
    if (!order || !order.line_items) return res.status(200).json({ status: "ignored", reason: "no line_items" });

    const dateKey = new Date(order.created_at || Date.now()).toISOString().slice(0, 10);
    const orderId = String(order.id || "");
    const email = order.email || "";
    const totalPrice = parseFloat(order.total_price) || 0;
    const currency = order.currency || "ARS";

    for (const item of order.line_items) {
      const handle = (item.product_id ? Object.keys(HANDLE_MAP).find(h => item.title && HANDLE_MAP[h]) : null) || "";
      const variant = item.variant_title || "";
      const prodName = HANDLE_MAP[handle] || HANDLE_MAP[Object.keys(HANDLE_MAP).find(k => item.title && item.title.toLowerCase().includes(k.split("-").join(" ").substring(0,10)))] || item.title || "Shopify Desconocido";

      await redisPush("sales:" + dateKey, {
        t: "shopify_" + orderId + "_" + item.id,
        p: prodName,
        v: parseFloat(item.price) || 0,
        c: currency,
        d: dateKey,
        ts: Math.floor(new Date(order.created_at || Date.now()).getTime() / 1000),
        bump: 0,
        oc: "shopify",
        src: "shopify",
      });
    }

    console.log(JSON.stringify({ level: "info", message: "Shopify orden guardada", order_id: orderId, items: order.line_items.length, total: totalPrice }));
    return res.status(200).json({ status: "ok", order_id: orderId, items: order.line_items.length });
  } catch (err) {
    console.error("Shopify webhook error:", err.message);
    return res.status(200).json({ status: "error", message: err.message });
  }
};
