const FB_ADS_TOKEN = "EAAQPNWCQHmABRJaZBoOQjrZBIRBZA7CpchrLQrBraNfHhYdctdIZCXDSEXNYecpxTG82EjmZAZCUPpLHZAdrJZBPcgytWfTC0DnCERp7ZC4H53gtN9SPkSeUaJj3gOZCQ1Aql6eLgQZBTIDgzECbDGSmX8RzZCZBrjvsTfMszWiQPcUScriyYQ3ZBUb8z5q2N1zBdQtnjy8QZDZD";
const AD_ACCOUNT = "act_635529528561013";
const HOTMART_FEE = 1;

// Matching parcial: orden importa (internacional primero, después AR)
const CAMP_RULES = [
  { match: "casa mujeres", int: "int", prod: "Casa Mujeres INT" },
  { match: "casa mujeres", int: null, prod: "Casa Mujeres AR" },
  { match: "gym mujeres", int: "int", prod: "Guia Mujeres INT" },
  { match: "gym mujeres", int: null, prod: "Gym Mujeres AR" },
  { match: "recetario", int: "int", prod: "Recetario INT" },
  { match: "recetario", int: null, prod: "Recetario AR" },
  { match: "gluteo", int: "int", prod: "Gluteos INT" },
  { match: "gluteo", int: null, prod: "Gluteos AR" },
  { match: "definici", int: "int", prod: "Definicion INT" },
  { match: "definici", int: null, prod: "Definicion AR" },
  { match: "gym", int: "int", prod: "Gym INT" },
  { match: "gym", int: null, prod: "Gym AR" },
];

function matchCampaign(name) {
  const low = name.toLowerCase();
  const isInt = low.includes("internacional") || low.includes(" int ");
  for (const rule of CAMP_RULES) {
    if (!low.includes(rule.match)) continue;
    if (rule.int === "int" && isInt) return rule.prod;
    if (rule.int === null && !isInt) return rule.prod;
  }
  return null;
}

async function redisCmd(args){const url=process.env.KV_REST_API_URL;const token=process.env.KV_REST_API_TOKEN;if(!url||!token)return null;try{const r=await fetch(url,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(args)});return(await r.json()).result}catch{return null}}
function getDates(days){const d=[];const now=new Date(Date.now()-3*60*60*1000);for(let i=0;i<days;i++){const x=new Date(now);x.setDate(x.getDate()-i);d.push(x.toISOString().slice(0,10))}return d}

module.exports=async function handler(req,res){
if(req.method!=="GET")return res.status(405).json({error:"GET only"});
const days=parseInt(req.query.days)||7;
const dates=getDates(days);
const dateFrom=dates[dates.length-1],dateTo=dates[0];

const allSales=[];
for(const date of dates){const raw=await redisCmd(["LRANGE","sales:"+date,"0","-1"]);if(raw)allSales.push(...raw.map(s=>{try{return JSON.parse(s)}catch{return null}}).filter(Boolean))}

const byProd={};
for(const s of allSales){const p=s.p||"Desconocido";if(!byProd[p])byProd[p]={rev:0,rev_main:0,rev_bump:0,n:0,n_main:0,bumps:0};byProd[p].rev+=s.v;byProd[p].n++;if(s.bump){byProd[p].rev_bump+=s.v;byProd[p].bumps++}else{byProd[p].rev_main+=s.v;byProd[p].n_main++}}

const prodMetrics={};
for(const[p,d]of Object.entries(byProd)){
  const bumpRate=d.n_main>0?d.bumps/d.n_main:0;
  const aovGross=d.n_main>0?d.rev/d.n_main:0;
  const feesPerSale=HOTMART_FEE*(1+bumpRate);
  const aovNeto=aovGross-feesPerSale;
  const cpaBE=aovNeto>0?aovNeto:0;
  prodMetrics[p]={bumpRate,aovGross,aovNeto,cpaBE,mult:d.rev_main>0?d.rev/d.rev_main:1};
}
const gM=Object.values(byProd).reduce((a,d)=>a+d.rev_main,0);
const gT=Object.values(byProd).reduce((a,d)=>a+d.rev,0);
const globalMult=gM>0?gT/gM:1;

let adsets=[];
try{
const fields="campaign_name,adset_name,adset_id,spend,impressions,clicks,cpc,ctr,actions,action_values";
const fbUrl=`https://graph.facebook.com/v21.0/${AD_ACCOUNT}/insights?fields=${fields}&level=adset&time_range={"since":"${dateFrom}","until":"${dateTo}"}&limit=200&access_token=${FB_ADS_TOKEN}`;
const d=await(await fetch(fbUrl)).json();
if(d.data)for(const row of d.data){
const campaign=row.campaign_name||"";
const product=matchCampaign(campaign);
if(!product)continue;
const spend=parseFloat(row.spend)||0;
const clicks=parseInt(row.clicks)||0;
const ctr=parseFloat(row.ctr)||0;
let purchases=0,purchaseValue=0;
if(row.actions){const pa=row.actions.find(a=>a.action_type==="purchase"||a.action_type==="offsite_conversion.fb_pixel_purchase");if(pa)purchases=parseInt(pa.value)||0}
if(row.action_values){const pv=row.action_values.find(a=>a.action_type==="purchase"||a.action_type==="offsite_conversion.fb_pixel_purchase");if(pv)purchaseValue=parseFloat(pv.value)||0}
const cpa=purchases>0?spend/purchases:0;
const roasFb=spend>0?purchaseValue/spend:0;
const pm=prodMetrics[product];
const mult=pm?pm.mult:globalMult;
const realRevenue=purchaseValue*mult;
const roasReal=spend>0?realRevenue/spend:0;
const cpaBE=pm?pm.cpaBE:8;
let status="SIN DATA";
if(spend>0&&purchases>0){
  if(cpaBE>0)status=cpa<=cpaBE*0.6?"ESCALAR":cpa<=cpaBE*0.85?"RENTABLE":cpa<=cpaBE?"AJUSTADO":"MATAR";
  else status=roasReal>=3?"ESCALAR":roasReal>=2?"RENTABLE":roasReal>=1.5?"AJUSTADO":"MATAR";
}else if(spend>5)status="SIN VENTAS";
adsets.push({campaign,product,adset:row.adset_name,spend,clicks,ctr,purchases,purchaseValue,cpa,roasFb,mult,realRevenue,roasReal,status,cpaBE});
}}catch(e){console.error("FB error:",e.message)}
adsets.sort((a,b)=>b.spend-a.spend);

const products=["Gym AR","Gym INT","Gym Mujeres AR","Guia Mujeres INT","Recetario AR","Recetario INT","Gluteos AR","Gluteos INT","Definicion AR","Definicion INT","Casa Mujeres AR","Casa Mujeres INT"];
const prodRows=products.map(p=>{
const s=byProd[p]||{rev:0,rev_main:0,rev_bump:0,n:0,n_main:0,bumps:0};
const pm=prodMetrics[p]||{bumpRate:0,aovGross:0,aovNeto:0,cpaBE:0,mult:1};
const spend=adsets.filter(a=>a.product===p).reduce((acc,a)=>acc+a.spend,0);
const profit=s.rev-(s.n*HOTMART_FEE)-spend;
const roas=spend>0?s.rev/spend:0;
let st="SIN DATA";if(spend>0&&s.rev>0)st=roas>=3?"ESCALAR":roas>=2?"RENTABLE":roas>=1.5?"AJUSTADO":"MATAR";else if(spend>0)st="MATAR";
return{p,rev:s.rev,revBump:s.rev_bump,spend,profit,roas,st,n:s.n_main,bumps:s.bumps,...pm}});

const T=prodRows.reduce((a,r)=>{a.rev+=r.rev;a.spend+=r.spend;a.profit+=r.profit;a.n+=r.n;a.bumps+=r.bumps;return a},{rev:0,spend:0,profit:0,n:0,bumps:0});
T.roas=T.spend>0?T.rev/T.spend:0;

const $=v=>"$"+v.toFixed(2);
const sc=s=>{switch(s){case"ESCALAR":return{b:"#0f5132",t:"#d1e7dd",bo:"#198754"};case"RENTABLE":return{b:"#155724",t:"#d4edda",bo:"#28a745"};case"AJUSTADO":return{b:"#664d03",t:"#fff3cd",bo:"#ffc107"};case"MATAR":case"SIN VENTAS":return{b:"#842029",t:"#f8d7da",bo:"#dc3545"};default:return{b:"#495057",t:"#e9ecef",bo:"#6c757d"}}};
const badge=s=>{const c=sc(s);return`<span class="badge" style="background:${c.b};color:${c.t};border:1px solid ${c.bo}">${s}</span>`};
const rc=r=>r>=3?"green":r>=1.5?"gold":r>0?"red":"";

const prodTable=prodRows.filter(r=>r.spend>0||r.rev>0).map(r=>`<tr>
<td class="prod">${r.p}</td>
<td class="money">${$(r.rev)}</td>
<td class="money">${$(r.spend)}</td>
<td class="money ${r.profit>=0?'green':'red'}">${$(r.profit)}</td>
<td class="center">${r.n}</td>
<td class="center">${r.bumps}</td>
<td class="center">${r.n>0?(r.bumpRate*100).toFixed(0)+'%':'-'}</td>
<td class="money">${r.aovGross>0?$(r.aovGross):'-'}</td>
<td class="money green">${r.aovNeto>0?$(r.aovNeto):'-'}</td>
<td class="money gold">${r.cpaBE>0?$(r.cpaBE):'-'}</td>
<td class="center">${badge(r.st)}</td>
</tr>`).join("");

const campaigns={};for(const a of adsets){if(!campaigns[a.campaign])campaigns[a.campaign]=[];campaigns[a.campaign].push(a)}
let adsetHtml="";
for(const[camp,sets]of Object.entries(campaigns)){
const cs=sets.reduce((a,s)=>a+s.spend,0);const cp=sets.reduce((a,s)=>a+s.purchases,0);
const prod=sets[0]?.product||"";const pm=prodMetrics[prod];
const campCpaBE=pm?pm.cpaBE:0;
adsetHtml+=`<tr class="camp-row"><td colspan="9"><strong>${camp}</strong> <span class="dim">${$(cs)} gastado | ${cp} ventas${campCpaBE>0?' | CPA maximo: '+$(campCpaBE):''}</span></td></tr>`;
for(const a of sets){
const cpaClass=a.cpaBE>0&&a.cpa>0?(a.cpa<=a.cpaBE*0.6?'green':a.cpa<=a.cpaBE?'gold':'red'):'';
adsetHtml+=`<tr>
<td class="adset-name">${a.adset}</td>
<td class="money">${$(a.spend)}</td>
<td class="center">${a.purchases}</td>
<td class="money ${cpaClass}">${a.cpa>0?$(a.cpa):'-'}</td>
<td class="money dim">${a.cpaBE>0?$(a.cpaBE):'-'}</td>
<td class="money dim">${$(a.purchaseValue)}</td>
<td class="money">${$(a.realRevenue)}</td>
<td class="center ${a.roasReal>=3?'green-bg':a.roasReal>=1.5?'yellow-bg':a.roasReal>0?'red-bg':''}">${a.roasReal>0?a.roasReal.toFixed(2)+'x':'-'}</td>
<td class="center">${badge(a.status)}</td>
</tr>`}}

const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Musculo Lab - Panel de Control</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0f;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px}.container{max-width:1400px;margin:0 auto}h1{font-size:28px;color:#ffd700;margin-bottom:4px}h2{font-size:20px;color:#ffd700;margin:32px 0 12px;border-bottom:1px solid #333;padding-bottom:8px}.sub{color:#888;font-size:14px;margin-bottom:24px}.filters{display:flex;gap:8px;margin-bottom:24px}.filters a{padding:8px 16px;border-radius:6px;text-decoration:none;color:#ccc;background:#1a1a2e;border:1px solid #333;font-size:13px}.filters a:hover,.filters a.active{background:#ffd700;color:#000;border-color:#ffd700}.totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}.tc{background:#1a1a2e;border-radius:10px;padding:16px;border:1px solid #2a2a4a}.tc .l{color:#888;font-size:12px;text-transform:uppercase;margin-bottom:4px}.tc .v{font-size:24px;font-weight:700;color:#fff}.green{color:#4caf50}.red{color:#f44336}.gold{color:#ffd700}.dim{color:#666}table{width:100%;border-collapse:collapse;background:#12121e;border-radius:10px;overflow:hidden;margin-bottom:16px}thead th{background:#1a1a2e;color:#ffd700;padding:10px 8px;font-size:11px;text-transform:uppercase;text-align:left;border-bottom:2px solid #333;white-space:nowrap}tbody td{padding:10px 8px;border-bottom:1px solid #1e1e3a;font-size:13px}tbody tr:hover{background:#1a1a30}.prod,.adset-name{font-weight:600;color:#fff;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.adset-name{padding-left:24px;font-weight:400;color:#ccc}.money{text-align:right;font-family:'SF Mono',Consolas,monospace}.center{text-align:center}.green-bg{background:rgba(76,175,80,.15);color:#4caf50;font-weight:700}.yellow-bg{background:rgba(255,193,7,.15);color:#ffc107;font-weight:700}.red-bg{background:rgba(244,67,54,.15);color:#f44336;font-weight:700}.badge{padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.5px}.camp-row{background:#16162a}.camp-row td{padding:8px;border-bottom:1px solid #2a2a4a}tfoot td{padding:10px 8px;font-weight:700;background:#1a1a2e;border-top:2px solid #ffd700}.legend{margin-top:16px;display:flex;gap:16px;flex-wrap:wrap}.legend span{font-size:12px;color:#888}.note{color:#555;font-size:11px;margin-top:12px;text-align:center}.info-box{background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:12px;margin:16px 0;font-size:13px;color:#aaa}.info-box strong{color:#ffd700}@media(max-width:768px){table{font-size:11px;display:block;overflow-x:auto}thead th,tbody td,tfoot td{padding:6px 4px}.totals{grid-template-columns:repeat(2,1fr)}}</style></head><body><div class="container">
<h1>MUSCULO LAB</h1>
<div class="sub">Panel de Rentabilidad — ${dateFrom} a ${dateTo}</div>
<div class="filters"><a href="?days=1" ${days===1?'class="active"':''}>Hoy</a><a href="?days=3" ${days===3?'class="active"':''}>3 dias</a><a href="?days=7" ${days===7?'class="active"':''}>7 dias</a><a href="?days=14" ${days===14?'class="active"':''}>14 dias</a><a href="?days=30" ${days===30?'class="active"':''}>30 dias</a></div>

<div class="totals">
<div class="tc"><div class="l">Ingresos</div><div class="v gold">${$(T.rev)}</div></div>
<div class="tc"><div class="l">Gasto FB</div><div class="v">${$(T.spend)}</div></div>
<div class="tc"><div class="l">Ganancia</div><div class="v ${T.profit>=0?'green':'red'}">${$(T.profit)}</div></div>
<div class="tc"><div class="l">Ventas</div><div class="v">${T.n}</div></div>
<div class="tc"><div class="l">Bumps</div><div class="v">${T.bumps}</div></div>
<div class="tc"><div class="l">ROAS</div><div class="v ${rc(T.roas)}">${T.roas>0?T.roas.toFixed(2)+'x':'-'}</div></div>
</div>

<h2>RENTABILIDAD POR PRODUCTO</h2>
<div class="info-box"><strong>Datos reales de Hotmart y Shopify.</strong> Se actualizan con cada venta. CPA Maximo = lo maximo que podes pagar por venta sin perder plata.</div>
<table><thead><tr>
<th>Producto</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Gasto FB</th><th style="text-align:right">Ganancia</th>
<th style="text-align:center">Ventas</th><th style="text-align:center">Bumps</th><th style="text-align:center">% Bump</th>
<th style="text-align:right">Ticket Bruto</th><th style="text-align:right">Ticket Neto</th><th style="text-align:right">CPA Max</th><th style="text-align:center">Estado</th>
</tr></thead><tbody>${prodTable}</tbody>
<tfoot><tr><td>TOTAL</td><td class="money gold">${$(T.rev)}</td><td class="money">${$(T.spend)}</td><td class="money ${T.profit>=0?'green':'red'}">${$(T.profit)}</td><td class="center">${T.n}</td><td class="center">${T.bumps}</td><td></td><td></td><td></td><td></td><td></td></tr></tfoot></table>

<h2>DECISION POR CONJUNTO DE ANUNCIOS</h2>
<div class="info-box"><strong>CPA vs CPA Maximo:</strong> <span class="green">Verde = ganando bien (escalar)</span> | <span class="gold">Amarillo = rentable (mantener)</span> | <span class="red">Rojo = perdiendo plata (apagar)</span></div>
<table><thead><tr>
<th>Conjunto de Anuncios</th><th style="text-align:right">Gasto</th><th style="text-align:center">Ventas</th><th style="text-align:right">CPA</th><th style="text-align:right">CPA Max</th>
<th style="text-align:right">Ingreso FB</th><th style="text-align:right">Ingreso Real</th><th style="text-align:center">ROAS Real</th><th style="text-align:center">Accion</th>
</tr></thead><tbody>${adsetHtml||'<tr><td colspan="9" class="center dim" style="padding:20px">No hay datos</td></tr>'}</tbody></table>

<div class="legend"><span>ESCALAR: CPA menor al 60% del maximo</span><span>RENTABLE: 60-85%</span><span>AJUSTADO: 85-100%</span><span>MATAR: arriba del maximo</span></div>
<div class="note">Ingresos: Hotmart + Shopify (tiempo real) | Gasto: Facebook API | Comision: $${HOTMART_FEE}/transaccion | ${new Date().toISOString().slice(0,19)} UTC</div>
</div></body></html>`;

res.setHeader("Content-Type","text/html; charset=utf-8");
res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
return res.status(200).send(html);
};
