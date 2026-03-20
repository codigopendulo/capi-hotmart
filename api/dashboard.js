const FB_ADS_TOKEN = "EAAQPNWCQHmABRJaZBoOQjrZBIRBZA7CpchrLQrBraNfHhYdctdIZCXDSEXNYecpxTG82EjmZAZCUPpLHZAdrJZBPcgytWfTC0DnCERp7ZC4H53gtN9SPkSeUaJj3gOZCQ1Aql6eLgQZBTIDgzECbDGSmX8RzZCZBrjvsTfMszWiQPcUScriyYQ3ZBUb8z5q2N1zBdQtnjy8QZDZD";
const AD_ACCOUNT = "act_635529528561013";

const CAMPAIGN_MAP = {
  "GYM internacional": "Gym INT",
  "GYM MUJERES INTERNACIONAL": "Guia Mujeres INT",
  "Recetario Fitness Internacional": "Recetario INT",
};

async function redisLRange(key, start, stop) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return [];
  try {
    const r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(["LRANGE", key, String(start), String(stop)]) });
    const data = await r.json();
    return (data.result || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function getDates(days) {
  const d = []; const now = new Date();
  for (let i = 0; i < days; i++) { const x = new Date(now); x.setDate(x.getDate() - i); d.push(x.toISOString().slice(0, 10)); }
  return d;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const days = parseInt(req.query.days) || 7;
  const dates = getDates(days);

  const allSales = [];
  for (const date of dates) { allSales.push(...await redisLRange("sales:" + date, 0, -1)); }

  const byProd = {};
  for (const s of allSales) {
    const p = s.p || "Desconocido";
    if (!byProd[p]) byProd[p] = { rev: 0, rev_main: 0, rev_bump: 0, n: 0, n_main: 0, bumps: 0 };
    byProd[p].rev += s.v; byProd[p].n++;
    if (s.bump) { byProd[p].rev_bump += s.v; byProd[p].bumps++; } else { byProd[p].rev_main += s.v; byProd[p].n_main++; }
  }

  const CMAP = { "GYM internacional": "Gym INT", "GYM MUJERES INTERNACIONAL": "Guia Mujeres INT", "Recetario Fitness Internacional": "Recetario INT", "Gl\u00fateos Internacional": "Gluteos INT", "Definici\u00f3n con Ciencia Internacional": "Definicion INT" };
  let fbSpend = {};
  try {
    const fbUrl = `https://graph.facebook.com/v21.0/${AD_ACCOUNT}/insights?fields=campaign_name,spend&level=campaign&time_range={"since":"${dates[dates.length-1]}","until":"${dates[0]}"}&limit=100&access_token=${FB_ADS_TOKEN}`;
    const d = await (await fetch(fbUrl)).json();
    if (d.data) for (const r of d.data) { const p = CMAP[r.campaign_name]; if (p) fbSpend[p] = (fbSpend[p]||0) + parseFloat(r.spend||0); }
  } catch {}

  const products = ["Gym INT", "Guia Mujeres INT", "Recetario INT", "Gluteos INT", "Definicion INT", "Casa Mujeres INT"];
  const rows = products.map(p => {
    const s = byProd[p] || { rev: 0, rev_main: 0, rev_bump: 0, n: 0, n_main: 0, bumps: 0 };
    const spend = fbSpend[p] || 0;
    const roas = spend > 0 ? s.rev / spend : 0;
    const profit = s.rev - spend;
    const cpa = s.n_main > 0 ? spend / s.n_main : 0;
    let st = "SIN DATA";
    if (spend > 0 && s.rev > 0) { st = roas >= 3 ? "ESCALAR" : roas >= 2 ? "RENTABLE" : roas >= 1.5 ? "BREAKEVEN" : "MATAR"; } else if (spend > 0) st = "MATAR";
    return { p, rev: s.rev, spend, profit, roas, st, n: s.n_main, bumps: s.bumps, cpa };
  });

  const T = rows.reduce((a, r) => { a.rev += r.rev; a.spend += r.spend; a.profit += r.profit; a.n += r.n; a.bumps += r.bumps; return a; }, { rev: 0, spend: 0, profit: 0, n: 0, bumps: 0 });
  T.roas = T.spend > 0 ? T.rev / T.spend : 0;
  T.cpa = T.n > 0 ? T.spend / T.n : 0;

  const sc = s => { switch(s){case"ESCALAR":return{b:"#0f5132",t:"#d1e7dd",bo:"#198754"};case"RENTABLE":return{b:"#155724",t:"#d4edda",bo:"#28a745"};case"BREAKEVEN":return{b:"#664d03",t:"#fff3cd",bo:"#ffc107"};case"MATAR":return{b:"#842029",t:"#f8d7da",bo:"#dc3545"};default:return{b:"#495057",t:"#e9ecef",bo:"#6c757d"};} };
  const $ = v => "$" + v.toFixed(2);
  const rc = r => r >= 3 ? "green" : r >= 1.5 ? "gold" : r > 0 ? "red" : "";
  const tr = rows.map(r => { const c = sc(r.st); return `<tr><td class="prod">${r.p}</td><td class="money">${$(r.rev)}</td><td class="money">${$(r.spend)}</td><td class="money ${r.profit>=0?'green':'red'}">${$(r.profit)}</td><td class="center ${r.roas>=3?'green-bg':r.roas>=1.5?'yellow-bg':r.roas>0?'red-bg':''}">${r.roas>0?r.roas.toFixed(2)+'x':'-'}</td><td class="center"><span class="badge" style="background:${c.b};color:${c.t};border:1px solid ${c.bo}">${r.st}</span></td><td class="center">${r.n}</td><td class="center">${r.bumps}</td><td class="money">${r.cpa>0?$(r.cpa):'-'}</td></tr>`; }).join("");

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Musculo Lab ROAS</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0f;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px}.container{max-width:1200px;margin:0 auto}h1{font-size:28px;color:#ffd700;margin-bottom:4px}.sub{color:#888;font-size:14px;margin-bottom:24px}.filters{display:flex;gap:8px;margin-bottom:24px}.filters a{padding:8px 16px;border-radius:6px;text-decoration:none;color:#ccc;background:#1a1a2e;border:1px solid #333;font-size:13px}.filters a:hover,.filters a.active{background:#ffd700;color:#000;border-color:#ffd700}.totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px}.tc{background:#1a1a2e;border-radius:10px;padding:16px;border:1px solid #2a2a4a}.tc .l{color:#888;font-size:12px;text-transform:uppercase;margin-bottom:4px}.tc .v{font-size:24px;font-weight:700;color:#fff}.green{color:#4caf50}.red{color:#f44336}.gold{color:#ffd700}table{width:100%;border-collapse:collapse;background:#12121e;border-radius:10px;overflow:hidden}thead th{background:#1a1a2e;color:#ffd700;padding:12px 10px;font-size:12px;text-transform:uppercase;text-align:left;border-bottom:2px solid #333}tbody td{padding:12px 10px;border-bottom:1px solid #1e1e3a;font-size:14px}tbody tr:hover{background:#1a1a30}.prod{font-weight:600;color:#fff}.money{text-align:right;font-family:'SF Mono',Consolas,monospace}.center{text-align:center}.green-bg{background:rgba(76,175,80,.15);color:#4caf50;font-weight:700}.yellow-bg{background:rgba(255,193,7,.15);color:#ffc107;font-weight:700}.red-bg{background:rgba(244,67,54,.15);color:#f44336;font-weight:700}.badge{padding:4px 10px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.5px}tfoot td{padding:12px 10px;font-weight:700;background:#1a1a2e;border-top:2px solid #ffd700}.legend{margin-top:20px;display:flex;gap:16px;flex-wrap:wrap}.legend span{font-size:12px;color:#888}.note{color:#555;font-size:11px;margin-top:16px;text-align:center}@media(max-width:768px){table{font-size:12px}thead th,tbody td,tfoot td{padding:8px 6px}.totals{grid-template-columns:repeat(2,1fr)}}</style></head><body><div class="container"><h1>MUSCULO LAB</h1><div class="sub">ROAS Dashboard — Revenue Hotmart (con bumps) vs Spend Facebook — ${dates[dates.length-1]} a ${dates[0]}</div><div class="filters"><a href="?days=1" ${days===1?'class="active"':''}>Hoy</a><a href="?days=3" ${days===3?'class="active"':''}>3d</a><a href="?days=7" ${days===7?'class="active"':''}>7d</a><a href="?days=14" ${days===14?'class="active"':''}>14d</a><a href="?days=30" ${days===30?'class="active"':''}>30d</a></div><div class="totals"><div class="tc"><div class="l">Revenue</div><div class="v gold">${$(T.rev)}</div></div><div class="tc"><div class="l">Spend</div><div class="v">${$(T.spend)}</div></div><div class="tc"><div class="l">Profit</div><div class="v ${T.profit>=0?'green':'red'}">${$(T.profit)}</div></div><div class="tc"><div class="l">ROAS</div><div class="v ${rc(T.roas)}">${T.roas>0?T.roas.toFixed(2)+'x':'-'}</div></div><div class="tc"><div class="l">Ventas</div><div class="v">${T.n}</div></div><div class="tc"><div class="l">Bumps</div><div class="v">${T.bumps}</div></div></div><table><thead><tr><th>Producto</th><th style="text-align:right">Revenue</th><th style="text-align:right">Spend</th><th style="text-align:right">Profit</th><th style="text-align:center">ROAS</th><th style="text-align:center">Estado</th><th style="text-align:center">Ventas</th><th style="text-align:center">Bumps</th><th style="text-align:right">CPA</th></tr></thead><tbody>${tr}</tbody><tfoot><tr><td>TOTAL</td><td class="money gold">${$(T.rev)}</td><td class="money">${$(T.spend)}</td><td class="money ${T.profit>=0?'green':'red'}">${$(T.profit)}</td><td class="center ${rc(T.roas)}" style="font-weight:700">${T.roas>0?T.roas.toFixed(2)+'x':'-'}</td><td></td><td class="center">${T.n}</td><td class="center">${T.bumps}</td><td class="money">${T.cpa>0?$(T.cpa):'-'}</td></tr></tfoot></table><div class="legend"><span>🟢 ESCALAR 3x+</span><span>🟢 RENTABLE 2-3x</span><span>🟡 BREAKEVEN 1.5-2x</span><span>🔴 MATAR &lt;1.5x</span></div><div class="note">Revenue: webhooks Hotmart (real-time) | Spend: Facebook API (cache 5min) | ${new Date().toISOString().slice(0,19)} UTC</div></div></body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res.status(200).send(html);
};
