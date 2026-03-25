// ============================================================
// MÚSCULO LAB — Búsqueda de Órdenes (Shopify + Hotmart/Redis)
// ============================================================

const config = require('./config');

// --- Shopify: buscar órdenes por email ---
async function searchShopifyOrders(email) {
  if (!config.SHOPIFY_TOKEN) return { ok: false, error: 'Token Shopify no configurado' };

  try {
    const url = `https://${config.SHOPIFY_SHOP}/admin/api/2024-01/orders.json?email=${encodeURIComponent(email)}&status=any&limit=10`;
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': config.SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Shopify API ${res.status}: ${errText}` };
    }

    const data = await res.json();
    if (!data.orders || data.orders.length === 0) {
      return { ok: true, found: false, orders: [] };
    }

    const orders = data.orders.map(o => ({
      id: o.id,
      order_number: o.order_number,
      name: o.name,
      email: o.email,
      created_at: o.created_at,
      financial_status: o.financial_status,
      total_price: o.total_price,
      currency: o.currency,
      customer_name: `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.trim(),
      products: (o.line_items || []).map(li => li.title).join(', '),
      fulfilled: o.fulfillment_status === 'fulfilled',
    }));

    return { ok: true, found: true, orders };
  } catch (err) {
    return { ok: false, error: `Error Shopify: ${err.message}` };
  }
}

// --- Redis: buscar ventas Hotmart por email ---
// Requiere que el webhook de Hotmart indexe por email (ver nota abajo)
async function searchHotmartSales(email) {
  if (!config.UPSTASH_URL || !config.UPSTASH_TOKEN) {
    return { ok: false, error: 'Redis no configurado' };
  }

  try {
    // Buscar por key hotmart_order:{email}
    const key = `hotmart_order:${email.toLowerCase().trim()}`;
    const res = await fetch(`${config.UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${config.UPSTASH_TOKEN}` },
    });

    const data = await res.json();
    if (!data.result) {
      return { ok: true, found: false, sales: [] };
    }

    const sales = JSON.parse(data.result);
    return { ok: true, found: true, sales: Array.isArray(sales) ? sales : [sales] };
  } catch (err) {
    return { ok: false, error: `Error Redis: ${err.message}` };
  }
}

// --- Buscar en ambas plataformas ---
async function searchAllOrders(email) {
  const [shopify, hotmart] = await Promise.all([
    searchShopifyOrders(email),
    searchHotmartSales(email),
  ]);
  return { shopify, hotmart };
}

module.exports = {
  searchShopifyOrders,
  searchHotmartSales,
  searchAllOrders,
};
