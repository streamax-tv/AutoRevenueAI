import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, createHmac, randomUUID, randomBytes } from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 3001);
const DATA_FILE = new URL('./data-v3.json', import.meta.url);
const PUBLIC_DIR = new URL('./public/', import.meta.url);
const SECRET = process.env.APP_SECRET || 'change-me-in-production';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const WA_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'autorevenue-verify';
const WA_ACCESS = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

const seed = {
  dealerships: [{ id:'d1', name:'Atlas Cars', city:'Casablanca', phone:'+212600000000', plan:'Growth', createdAt:new Date().toISOString() }],
  users: [{ id:'u1', dealershipId:'d1', name:'Admin', email:'admin@atlas-cars.ma', passwordHash:hash('admin123'), role:'owner' }],
  inventory: [
    {id:'car1',dealershipId:'d1',make:'Mercedes-Benz',model:'GLC 300',year:2023,km:32400,fuel:'Hybrid',price:56900,status:'Available',stock:'AT-GLC-23',description:'AMG Line, full options, excellent condition'},
    {id:'car2',dealershipId:'d1',make:'BMW',model:'320d M Sport',year:2022,km:48120,fuel:'Diesel',price:38900,status:'Available',stock:'AT-BMW-22',description:'M Sport, automatic, clean history'},
    {id:'car3',dealershipId:'d1',make:'Audi',model:'Q5 S line',year:2023,km:27850,fuel:'Diesel',price:47900,status:'Reserved',stock:'AT-Q5-23',description:'S line, quattro, premium interior'},
    {id:'car4',dealershipId:'d1',make:'Mercedes-Benz',model:'CLA 220d',year:2023,km:41770,fuel:'Diesel',price:34900,status:'Available',stock:'AT-CLA-23',description:'AMG Line, automatic, low consumption'}
  ],
  leads: [
    {id:'l1',dealershipId:'d1',name:'Youssef El Amrani',phone:'+212611111111',channel:'WhatsApp',vehicleId:'car4',status:'Qualified',score:'HOT',budget:36000,finance:false,timeline:'This week',tradeIn:false,lastMessage:'Can I see the CLA tomorrow?',createdAt:new Date(Date.now()-480000).toISOString(),updatedAt:new Date(Date.now()-480000).toISOString()},
    {id:'l2',dealershipId:'d1',name:'Sarah Benali',phone:'+212622222222',channel:'Instagram',vehicleId:'car2',status:'Appointment',score:'HOT',budget:40000,finance:true,timeline:'This week',tradeIn:true,lastMessage:'Saturday 11 works for me',createdAt:new Date(Date.now()-1260000).toISOString(),updatedAt:new Date(Date.now()-1260000).toISOString()},
    {id:'l3',dealershipId:'d1',name:'Mehdi Alaoui',phone:'+212633333333',channel:'Website',vehicleId:'car1',status:'New',score:'WARM',budget:57000,finance:false,timeline:'This month',tradeIn:false,lastMessage:'Is it still available?',createdAt:new Date(Date.now()-2520000).toISOString(),updatedAt:new Date(Date.now()-2520000).toISOString()},
    {id:'l4',dealershipId:'d1',name:'Nadia Idrissi',phone:'+212644444444',channel:'Facebook',vehicleId:'car3',status:'New',score:'COLD',budget:45000,finance:false,timeline:'Unknown',tradeIn:false,lastMessage:'I will think about it',createdAt:new Date(Date.now()-3600000).toISOString(),updatedAt:new Date(Date.now()-3600000).toISOString()}
  ],
  messages: [], appointments: [
    {id:'a1',dealershipId:'d1',leadId:'l2',vehicleId:'car2',start:'2026-09-12T11:00:00+01:00',status:'Booked',notes:'Customer requested test drive'},
    {id:'a2',dealershipId:'d1',leadId:'l1',vehicleId:'car4',start:'2026-09-10T17:30:00+01:00',status:'Booked',notes:'Confirm 2h before'},
    {id:'a3',dealershipId:'d1',leadId:'l3',vehicleId:'car1',start:'2026-09-13T10:00:00+01:00',status:'Tentative',notes:''}
  ],
  plans: [{id:'starter',name:'Starter',price:99,limit:100},{id:'growth',name:'Growth',price:249,limit:500},{id:'pro',name:'Pro',price:499,limit:2000}],
  settings: [{dealershipId:'d1',businessHours:'09:00-19:00',timezone:'Africa/Casablanca',language:'fr',systemPrompt:'You are a helpful automotive sales assistant. Never invent stock, price or appointment availability.'}]
};

function hash(s){ return createHash('sha256').update(s).digest('hex'); }
let saving = Promise.resolve();
async function load(){ if(!existsSync(DATA_FILE)){ await save(seed); return structuredClone(seed); } return JSON.parse(await readFile(DATA_FILE,'utf8')); }
let db = await load();
function save(next=db){ saving=saving.then(()=>writeFile(DATA_FILE,JSON.stringify(next,null,2))); return saving; }
function json(res,status,data){ const body=JSON.stringify(data); res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}); res.end(body); }
function text(res,status,body,type='text/plain'){res.writeHead(status,{'content-type':type});res.end(body)}
async function body(req){let b=''; for await(const c of req)b+=c; if(!b)return {}; try{return JSON.parse(b)}catch{return {raw:b}}}
function token(user){const p=Buffer.from(JSON.stringify({uid:user.id,did:user.dealershipId,exp:Date.now()+86400000})).toString('base64url'); return p+'.'+createHmac('sha256',SECRET).update(p).digest('base64url');}
function auth(req){const h=req.headers.authorization||''; if(!h.startsWith('Bearer '))return null; const [p,s]=h.slice(7).split('.'); if(!p||!s)return null; const good=createHmac('sha256',SECRET).update(p).digest('base64url'); if(!timingSafe(s,good))return null; try{const x=JSON.parse(Buffer.from(p,'base64url')); if(x.exp<Date.now())return null; return db.users.find(u=>u.id===x.uid&&u.dealershipId===x.did)||null}catch{return null}}
function timingSafe(a,b){return a===b;}
function requireAuth(req,res){const u=auth(req); if(!u){json(res,401,{error:'Unauthorized'});return null}return u;}
function id(){return randomUUID();}
function scoreLead(l){let n=0; if(l.budget) n+=25; if(l.timeline==='This week')n+=30; if(l.timeline==='This month')n+=15; if(l.finance)n+=10; if(l.tradeIn)n+=10; if(l.vehicleId)n+=10; if(n>=65)return 'HOT'; if(n>=35)return 'WARM'; return 'COLD';}
function vehicleText(v){return `${v.make} ${v.model} ${v.year} — ${v.km.toLocaleString()} km — ${v.fuel} — €${v.price.toLocaleString()} — ${v.status}`;}
async function aiReply({lead,message,dealershipId}){
  const stock=db.inventory.filter(v=>v.dealershipId===dealershipId&&v.status!=='Sold');
  if(OPENAI_KEY){
    const prompt=`Dealership: ${db.dealerships.find(d=>d.id===dealershipId)?.name}. Inventory:\n${stock.map(vehicleText).join('\n')}\nLead: ${lead.name}, budget ${lead.budget||'unknown'}, timeline ${lead.timeline||'unknown'}, score ${lead.score}.\nCustomer: ${message}\nReply naturally, concise, in the customer's language if clear. Only mention vehicles/prices in inventory. Ask one useful qualification question or offer a test drive.`;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${OPENAI_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',messages:[{role:'system',content:'You are an automotive sales AI.'},{role:'user',content:prompt}],temperature:.3})});
    if(r.ok){const x=await r.json();return x.choices?.[0]?.message?.content||'';}
  }
  const low=message.toLowerCase();
  if(/available|disponible|dispo|موجود/.test(low)) return lead.vehicleId?`Oui, le véhicule est actuellement ${db.inventory.find(v=>v.id===lead.vehicleId)?.status==='Available'?'disponible':'réservé'}. Je peux aussi vous proposer un essai. Quel jour vous arrange ?`:'Oui. Quel modèle recherchez-vous et quel est votre budget ?';
  if(/prix|price|ثمن/.test(low)){const v=db.inventory.find(v=>v.id===lead.vehicleId);return v?`Le ${v.make} ${v.model} est à €${v.price.toLocaleString()}. Souhaitez-vous réserver un essai ?`:'Je peux vous proposer les véhicules disponibles selon votre budget.';}
  if(/essai|test|drive|زيارة/.test(low))return 'Avec plaisir. Donnez-moi le jour et l’heure qui vous conviennent, et je vous propose le créneau disponible.';
  return 'Bonjour ! Je peux vous aider à choisir le bon véhicule, vérifier la disponibilité et organiser un essai. Quel est votre budget et quand souhaitez-vous acheter ?';
}

async function sendWhatsApp(to,textMsg){
 if(!WA_ACCESS||!WA_PHONE_ID) return {simulated:true,to,text:textMsg};
 const r=await fetch(`https://graph.facebook.com/v23.0/${WA_PHONE_ID}/messages`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${WA_ACCESS}`},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:textMsg}})});
 return {ok:r.ok,body:await r.json()};
}

async function route(req,res){
 if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'});return res.end()}
 const u=new URL(req.url,`http://${req.headers.host}`), path=u.pathname;
 if(req.method==='GET'&&path==='/api/health')return json(res,200,{ok:true,version:'0.3.0',time:new Date().toISOString(),ai:!!OPENAI_KEY,whatsapp:!!WA_ACCESS});
 if(req.method==='GET'&&path==='/api/whatsapp/webhook'){if(u.searchParams.get('hub.verify_token')===WA_TOKEN)return text(res,200,u.searchParams.get('hub.challenge')||'');return text(res,403,'Forbidden')}
 if(req.method==='POST'&&path==='/api/whatsapp/webhook'){const b=await body(req); await processWhatsApp(b); return json(res,200,{received:true})}
 if(req.method==='POST'&&path==='/api/auth/login'){const b=await body(req);const user=db.users.find(x=>x.email===b.email&&x.passwordHash===hash(b.password||''));if(!user)return json(res,401,{error:'Invalid credentials'});return json(res,200,{token:token(user),user:{id:user.id,name:user.name,email:user.email,role:user.role,dealershipId:user.dealershipId},dealership:db.dealerships.find(d=>d.id===user.dealershipId)})}
 const user=requireAuth(req,res); if(!user)return; const did=user.dealershipId;
 if(req.method==='GET'&&path==='/api/me')return json(res,200,{user:{id:user.id,name:user.name,email:user.email,role:user.role},dealership:db.dealerships.find(d=>d.id===did),settings:db.settings.find(s=>s.dealershipId===did)});
 if(req.method==='GET'&&path==='/api/dashboard'){const leads=db.leads.filter(x=>x.dealershipId===did);const inv=db.inventory.filter(x=>x.dealershipId===did);const ap=db.appointments.filter(x=>x.dealershipId===did);return json(res,200,{stats:{newLeads:leads.filter(x=>x.status==='New').length,qualified:leads.filter(x=>x.status==='Qualified'||x.score==='HOT').length,appointments:ap.filter(x=>x.status==='Booked').length,inventory:inv.filter(x=>x.status==='Available').length,aiHandled:92,attributedRevenue:186400},leads,inventory:inv,appointments:ap,revenueLeaks:buildLeaks(did)})}
 if(req.method==='GET'&&path==='/api/leads')return json(res,200,db.leads.filter(x=>x.dealershipId===did));
 if(req.method==='POST'&&path==='/api/leads'){const b=await body(req);const l={id:id(),dealershipId:did,name:b.name||'New lead',phone:b.phone||'',channel:b.channel||'Website',vehicleId:b.vehicleId||null,status:'New',score:'COLD',budget:Number(b.budget)||null,finance:!!b.finance,timeline:b.timeline||'Unknown',tradeIn:!!b.tradeIn,lastMessage:b.lastMessage||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};l.score=scoreLead(l);db.leads.push(l);await save();return json(res,201,l)}
 if(req.method==='PATCH'&&path.startsWith('/api/leads/')){const x=db.leads.find(x=>x.id===path.split('/').pop()&&x.dealershipId===did);if(!x)return json(res,404,{error:'Lead not found'});const b=await body(req);Object.assign(x,b,{updatedAt:new Date().toISOString()});x.score=scoreLead(x);await save();return json(res,200,x)}
 if(req.method==='GET'&&path==='/api/inventory')return json(res,200,db.inventory.filter(x=>x.dealershipId===did));
 if(req.method==='POST'&&path==='/api/inventory'){const b=await body(req);const x={id:id(),dealershipId:did,make:b.make,model:b.model,year:Number(b.year),km:Number(b.km||0),fuel:b.fuel||'Petrol',price:Number(b.price),status:b.status||'Available',stock:b.stock||`AT-${Date.now()}`,description:b.description||''};db.inventory.push(x);await save();return json(res,201,x)}
 if(req.method==='PATCH'&&path.startsWith('/api/inventory/')){const x=db.inventory.find(x=>x.id===path.split('/').pop()&&x.dealershipId===did);if(!x)return json(res,404,{error:'Vehicle not found'});Object.assign(x,await body(req));await save();return json(res,200,x)}
 if(req.method==='GET'&&path==='/api/appointments')return json(res,200,db.appointments.filter(x=>x.dealershipId===did));
 if(req.method==='POST'&&path==='/api/appointments'){const b=await body(req);const a={id:id(),dealershipId:did,leadId:b.leadId,vehicleId:b.vehicleId||null,start:b.start,status:b.status||'Booked',notes:b.notes||''};db.appointments.push(a);const l=db.leads.find(x=>x.id===a.leadId);if(l)l.status='Appointment';await save();return json(res,201,a)}
 if(req.method==='POST'&&path==='/api/ai/reply'){const b=await body(req);const lead=db.leads.find(x=>x.id===b.leadId&&x.dealershipId===did);if(!lead)return json(res,404,{error:'Lead not found'});lead.lastMessage=b.message||'';lead.updatedAt=new Date().toISOString();lead.score=scoreLead(lead);const reply=await aiReply({lead,message:b.message||'',dealershipId:did});db.messages.push({id:id(),dealershipId:did,leadId:lead.id,direction:'in',text:b.message,at:new Date().toISOString()},{id:id(),dealershipId:did,leadId:lead.id,direction:'out',text:reply,at:new Date().toISOString()});await save();return json(res,200,{reply,lead})}
 if(req.method==='POST'&&path==='/api/whatsapp/send'){const b=await body(req);const lead=db.leads.find(x=>x.id===b.leadId&&x.dealershipId===did);if(!lead)return json(res,404,{error:'Lead not found'});const out=await sendWhatsApp(lead.phone,b.message||'');db.messages.push({id:id(),dealershipId:did,leadId:lead.id,direction:'out',text:b.message,at:new Date().toISOString(),delivery:out});await save();return json(res,200,out)}
 if(req.method==='GET'&&path==='/api/leaks')return json(res,200,buildLeaks(did));
 if(req.method==='POST'&&path==='/api/leaks/fix-all'){const leaks=buildLeaks(did);let fixed=0;for(const x of leaks.items){const l=db.leads.find(z=>z.id===x.leadId);if(l){l.status=l.status==='New'?'Qualified':l.status;l.updatedAt=new Date().toISOString();fixed++;}}await save();return json(res,200,{fixed,remaining:buildLeaks(did)})}
 if(req.method==='GET'&&path==='/api/messages')return json(res,200,db.messages.filter(x=>x.dealershipId===did).slice(-100).reverse());
 if(req.method==='POST'&&path==='/api/billing/checkout'){const b=await body(req);return json(res,200,{mode:'checkout-placeholder',plan:b.plan||'growth',message:'Set STRIPE_SECRET_KEY to enable live billing.'})}
 if(req.method==='POST'&&path==='/api/settings'){const b=await body(req);let s=db.settings.find(x=>x.dealershipId===did);Object.assign(s,b);await save();return json(res,200,s)}
 return json(res,404,{error:'Not found'});
}
function buildLeaks(did){const leads=db.leads.filter(x=>x.dealershipId===did);const hot=leads.filter(x=>x.score==='HOT'&&x.status==='New');const stale=leads.filter(x=>Date.now()-Date.parse(x.updatedAt)>86400000&&x.status!=='Sold');const items=[...hot.map(l=>({id:`hot-${l.id}`,type:'Hot lead ignored',leadId:l.id,amount:Math.round((l.budget||35000)*.15),action:'Send immediate WhatsApp follow-up'})),...stale.map(l=>({id:`stale-${l.id}`,type:'Stale prospect',leadId:l.id,amount:Math.round((l.budget||30000)*.08),action:'Launch reactivation sequence'}))];return {total:items.reduce((s,x)=>s+x.amount,0),count:items.length,items};}
async function processWhatsApp(payload){try{const change=payload.entry?.[0]?.changes?.[0]?.value;const msg=change?.messages?.[0];if(!msg)return;const phone=msg.from;const textMsg=msg.text?.body||'[media]';let lead=db.leads.find(l=>l.phone.replace(/\D/g,'').endsWith(phone.replace(/\D/g,'')));const did=lead?.dealershipId||'d1';if(!lead){lead={id:id(),dealershipId:did,name:change.contacts?.[0]?.profile?.name||phone,phone,channel:'WhatsApp',vehicleId:null,status:'New',score:'COLD',budget:null,finance:false,timeline:'Unknown',tradeIn:false,lastMessage:textMsg,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};db.leads.push(lead);}lead.lastMessage=textMsg;lead.updatedAt=new Date().toISOString();const reply=await aiReply({lead,message:textMsg,dealershipId:did});db.messages.push({id:id(),dealershipId:did,leadId:lead.id,direction:'in',text:textMsg,at:new Date().toISOString()},{id:id(),dealershipId:did,leadId:lead.id,direction:'out',text:reply,at:new Date().toISOString()});await save();if(msg.type==='text')await sendWhatsApp(phone,reply);}catch(e){console.error('WA webhook',e)}}

const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/api/'))return await route(req,res);let p=req.url==='/'?'/index.html':req.url;const file=new URL('.'+p.replace(/\.\./g,'') ,PUBLIC_DIR);if(existsSync(file)){const ext=file.pathname.split('.').pop();const types={html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml',json:'application/json'};return text(res,200,await readFile(file),types[ext]||'application/octet-stream')}return text(res,404,'Not found')}catch(e){console.error(e);json(res,500,{error:'Server error'})}});
server.listen(PORT,()=>console.log(`AutoRevenue AI v0.3 running on http://localhost:${PORT}`));
