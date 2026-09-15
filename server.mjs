import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, createHmac, randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { URL } from 'node:url';
import pg from 'pg';
const { Pool } = pg;

const PORT=Number(process.env.PORT||3001);
const DATA_FILE=new URL('./data-v3.json',import.meta.url);
const PUBLIC_DIR=new URL('./public/',import.meta.url);
const SECRET=process.env.APP_SECRET||'change-me-in-production';
const OPENAI_KEY=process.env.OPENAI_API_KEY||'';
const WA_TOKEN=process.env.WHATSAPP_VERIFY_TOKEN||'autorevenue-verify';
const WA_ACCESS=process.env.WHATSAPP_ACCESS_TOKEN||'';
const WA_PHONE_ID=process.env.WHATSAPP_PHONE_NUMBER_ID||'';
const DATABASE_URL=process.env.DATABASE_URL||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:5}):null;
const MAX_BODY=256*1024;
const rateBuckets=new Map();
const SECURITY_HEADERS={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
};
function hashLegacy(s){return createHash('sha256').update(String(s)).digest('hex')}
function hashPassword(s){const salt=randomBytes(16);const key=scryptSync(String(s),salt,64,{N:16384,r:8,p:1});return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`}
function verifyPassword(password,stored){
  if(typeof stored!=='string') return {ok:false,migrate:false};
  if(stored.startsWith('scrypt$')){
    try{
      const p=stored.split('$'); if(p.length!==7) return {ok:false,migrate:false};
      const N=Number(p[1]),r=Number(p[2]),q=Number(p[3]); const salt=Buffer.from(p[4],'base64'); const expected=Buffer.from(p[5],'base64');
      if(!Number.isInteger(N)||!Number.isInteger(r)||!Number.isInteger(q)||!expected.length) return {ok:false,migrate:false};
      const actual=scryptSync(String(password),salt,expected.length,{N,r,p:q});
      return {ok:actual.length===expected.length&&timingSafeEqual(actual,expected),migrate:false};
    }catch{return {ok:false,migrate:false}}
  }
  return {ok:stored===hashLegacy(password),migrate:stored===hashLegacy(password)};
}
function clientIp(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim()||'unknown'}
function allowRate(key,max,windowMs){
  const now=Date.now(); const old=rateBuckets.get(key)||[]; const live=old.filter(t=>t>now-windowMs);
  if(live.length>=max){rateBuckets.set(key,live);return Math.max(1,Math.ceil((live[0]+windowMs-now)/1000))}
  live.push(now);rateBuckets.set(key,live);return 0;
}
setInterval(()=>{const now=Date.now();for(const [k,v] of rateBuckets)if(!v.length||v[v.length-1]<now-900000)rateBuckets.delete(k)},300000).unref();

const seed={
  dealership:{id:'d1',name:'Atlas Cars',city:'Casablanca',currency:'EUR'},
  users:[{id:'u1',email:'admin@atlas-cars.ma',name:'Admin',passwordHash:hashLegacy('admin123'),role:'admin',dealershipId:'d1'}],
  inventory:[
    {id:'c1',make:'Mercedes-Benz',model:'GLC 300',year:2023,mileage:32400,fuel:'Hybrid',price:56900,status:'Available'},
    {id:'c2',make:'BMW',model:'320d M Sport',year:2022,mileage:48120,fuel:'Diesel',price:38900,status:'Available'},
    {id:'c3',make:'Audi',model:'Q5 S line',year:2023,mileage:27850,fuel:'Diesel',price:47900,status:'Reserved'},
    {id:'c4',make:'Mercedes-Benz',model:'CLA 220d',year:2023,mileage:41770,fuel:'Diesel',price:34900,status:'Available'}
  ],
  leads:[
    {id:'l1',name:'Youssef El Amrani',phone:'+212600000001',channel:'WhatsApp',vehicleId:'c4',score:'HOT',stage:'Qualified',budget:36000,timeline:'this week',lastMessage:'Interested in CLA 220d',createdAt:'2026-09-14T09:00:00Z',updatedAt:'2026-09-14T10:00:00Z'},
    {id:'l2',name:'Sarah Benali',phone:'+212600000002',channel:'Instagram',vehicleId:'c2',score:'HOT',stage:'Appointment',budget:40000,timeline:'this week',lastMessage:'Wants to see the BMW',createdAt:'2026-09-13T12:00:00Z',updatedAt:'2026-09-14T08:00:00Z'},
    {id:'l3',name:'Mehdi Alaoui',phone:'+212600000003',channel:'Website',vehicleId:'c1',score:'WARM',stage:'New',budget:57000,timeline:'this month',lastMessage:'Asked about availability',createdAt:'2026-09-12T11:00:00Z',updatedAt:'2026-09-12T11:00:00Z'},
    {id:'l4',name:'Nadia Idrissi',phone:'+212600000004',channel:'Facebook',vehicleId:'c3',score:'COLD',stage:'New',budget:45000,timeline:'researching',lastMessage:'Comparing SUVs',createdAt:'2026-09-10T15:00:00Z',updatedAt:'2026-09-10T15:00:00Z'}
  ],
  appointments:[],messages:[],settings:{businessHours:'09:00-19:00',timezone:'Africa/Casablanca',calendarConnected:false},billing:{plan:'Demo',status:'active'}
};
let db=null,saving=Promise.resolve();
async function load(){
  if(pool){
    await pool.query(`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const r=await pool.query('SELECT data FROM app_state WHERE id=1');
    if(r.rows[0]){db=r.rows[0].data;return}
    db=structuredClone(seed);await pool.query('INSERT INTO app_state(id,data) VALUES(1,$1::jsonb)',[JSON.stringify(db)]);return;
  }
  try{db=JSON.parse(await readFile(DATA_FILE,'utf8'))}catch{db=structuredClone(seed);await save()}
}
async function save(){saving=saving.then(async()=>{if(pool)await pool.query('UPDATE app_state SET data=$1::jsonb, updated_at=NOW() WHERE id=1',[JSON.stringify(db)]);else await writeFile(DATA_FILE,JSON.stringify(db,null,2));}).catch(()=>{});return saving}
function json(res,status,data,extra={}){res.writeHead(status,{...SECURITY_HEADERS,'content-type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data))}
function text(res,status,data,type='text/plain; charset=utf-8',extra={}){res.writeHead(status,{...SECURITY_HEADERS,'content-type':type,...extra});res.end(data)}
async function body(req){let b='',size=0;for await(const c of req){size+=Buffer.byteLength(c);if(size>MAX_BODY){const e=new Error('Payload too large');e.status=413;throw e}b+=c}if(!b)return{};try{return JSON.parse(b)}catch{const e=new Error('Malformed JSON');e.status=400;throw e}}
function token(user){const exp=Date.now()+86400000;const p=Buffer.from(JSON.stringify({id:user.id,exp})).toString('base64url');return `${p}.${createHmac('sha256',SECRET).update(p).digest('base64url')}`}
function auth(req){const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))return null;const [p,s]=h.slice(7).split('.');if(!p||!s)return null;try{const good=createHmac('sha256',SECRET).update(p).digest('base64url');if(s.length!==good.length||!timingSafeEqual(Buffer.from(s),Buffer.from(good)))return null;const x=JSON.parse(Buffer.from(p,'base64url').toString());return x.exp>Date.now()?db.users.find(u=>u.id===x.id):null}catch{return null}}
function requireAuth(req,res){const u=auth(req);if(!u){json(res,401,{error:'Unauthorized'});return null}return u}
function scoreLead(b){const budget=Number(b.budget||0);const timeline=String(b.timeline||'').toLowerCase();if(budget&&timeline.includes('week'))return'HOT';if(budget)return'WARM';return'COLD'}
async function aiReply(message,lead){if(OPENAI_KEY){try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${OPENAI_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',messages:[{role:'system',content:'You are AutoRevenue AI, a concise used-car sales assistant. Answer accurately from the provided dealership context. Qualify budget, timing, trade-in and propose a test drive. Never invent availability.'},{role:'user',content:JSON.stringify({message,lead,inventory:db.inventory})}],temperature:.3})});const j=await r.json();if(r.ok&&j.choices?.[0]?.message?.content)return j.choices[0].message.content}catch{}}
  const m=String(message||'').toLowerCase();const car=lead?.vehicleId?db.inventory.find(x=>x.id===lead.vehicleId):null;if(m.includes('available')||m.includes('dispon'))return car?`Oui, la ${car.make} ${car.model} ${car.year} est actuellement ${car.status.toLowerCase()}. Souhaitez-vous réserver un essai ?`:'Je peux vérifier le véhicule souhaité. Quel modèle recherchez-vous ?';if(m.includes('prix')||m.includes('price'))return car?`Le prix affiché est de ${car.price.toLocaleString()} ${db.dealership.currency}. Je peux aussi vous proposer un essai.`:'Quel modèle vous intéresse ?';return'Bonjour ! Je peux vous aider à trouver le bon véhicule. Quel modèle recherchez-vous, quel est votre budget et quand souhaitez-vous acheter ?'}
async function sendWhatsApp(to,message){if(!WA_ACCESS||!WA_PHONE_ID)return{simulated:true,to,message};const r=await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`,{method:'POST',headers:{authorization:`Bearer ${WA_ACCESS}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:message}})});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'WhatsApp API error');return j}
async function processWA(payload){const value=payload?.entry?.[0]?.changes?.[0]?.value;const msg=value?.messages?.[0];if(!msg)return;const from=msg.from,textIn=msg.text?.body||'';let lead=db.leads.find(x=>x.phone?.replace(/\D/g,'').endsWith(from.replace(/\D/g,'')));if(!lead){lead={id:randomUUID(),name:value?.contacts?.[0]?.profile?.name||'WhatsApp Lead',phone:from,channel:'WhatsApp',score:'COLD',stage:'New',budget:0,timeline:'',lastMessage:textIn,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};db.leads.unshift(lead)}else{lead.lastMessage=textIn;lead.updatedAt=new Date().toISOString()}const reply=await aiReply(textIn,lead);db.messages.push({id:randomUUID(),leadId:lead.id,channel:'WhatsApp',direction:'in',text:textIn,createdAt:new Date().toISOString()},{id:randomUUID(),leadId:lead.id,channel:'WhatsApp',direction:'out',text:reply,createdAt:new Date().toISOString()});await sendWhatsApp(from,reply);await save()}
async function main(req,res){
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`),path=u.pathname,method=req.method;
  if(method==='OPTIONS')return json(res,204,{}, {'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'});
  if(path==='/api/health'&&method==='GET'){let database=false;if(pool){try{await pool.query('SELECT 1');database=true}catch{}}return json(res,200,{ok:true,version:'0.5.0',database,ai:!!OPENAI_KEY,whatsapp:!!WA_ACCESS,time:new Date().toISOString()})}
  if(path==='/api/auth/login'&&method==='POST'){const retry=allowRate(`login:${clientIp(req)}`,10,15*60*1000);if(retry)return json(res,429,{error:'Too many login attempts',retryAfter:retry},{'Retry-After':String(retry)});const b=await body(req),u=db.users.find(x=>x.email===String(b.email||'').trim().toLowerCase());if(!u)return json(res,401,{error:'Invalid credentials'});const v=verifyPassword(b.password||'',u.passwordHash);if(!v.ok)return json(res,401,{error:'Invalid credentials'});if(v.migrate){u.passwordHash=hashPassword(b.password||'');await save()}return json(res,200,{token:token(u),user:{id:u.id,email:u.email,name:u.name,role:u.role}})}
  if(path==='/api/whatsapp/webhook'&&method==='GET'){if(u.searchParams.get('hub.verify_token')!==WA_TOKEN)return text(res,403,'Forbidden');return text(res,200,u.searchParams.get('hub.challenge')||'')}
  if(path==='/api/whatsapp/webhook'&&method==='POST'){const retry=allowRate(`wa:${clientIp(req)}`,30,60*1000);if(retry)return json(res,429,{error:'Too many webhook requests',retryAfter:retry},{'Retry-After':String(retry)});await processWA(await body(req));return json(res,200,{received:true})}
  const user=requireAuth(req,res);if(!user)return;
  if(path==='/api/me'&&method==='GET')return json(res,200,{user:{id:user.id,email:user.email,name:user.name,role:user.role},dealership:db.dealership});
  if(path==='/api/dashboard'&&method==='GET'){const sold=db.leads.filter(x=>x.stage==='Sold');const hot=db.leads.filter(x=>x.score==='HOT').length;const appointments=db.appointments.filter(x=>x.status!=='cancelled').length;const value=sold.reduce((s,x)=>s+Number(x.salePrice||0),0);return json(res,200,{leads:db.leads.length,hotLeads:hot,appointments,revenue:value,conversion:db.leads.length?Math.round(sold.length/db.leads.length*100):0,inventory:db.inventory.filter(x=>x.status==='Available').length})}
  if(path==='/api/leads'&&method==='GET')return json(res,200,db.leads);
  if(path==='/api/leads'&&method==='POST'){const b=await body(req);const lead={id:randomUUID(),name:String(b.name||'Unknown'),phone:String(b.phone||''),channel:String(b.channel||'Website'),vehicleId:b.vehicleId||null,score:scoreLead(b),stage:'New',budget:Number(b.budget||0),timeline:String(b.timeline||''),lastMessage:String(b.lastMessage||''),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};db.leads.unshift(lead);await save();return json(res,201,lead)}
  if(path.startsWith('/api/leads/')&&method==='PATCH'){const id=path.split('/')[3],lead=db.leads.find(x=>x.id===id);if(!lead)return json(res,404,{error:'Lead not found'});Object.assign(lead,await body(req),{updatedAt:new Date().toISOString()});await save();return json(res,200,lead)}
  if(path==='/api/inventory'&&method==='GET')return json(res,200,db.inventory);
  if(path==='/api/inventory'&&method==='POST'){const b=await body(req);const item={id:randomUUID(),...b,year:Number(b.year||new Date().getFullYear()),mileage:Number(b.mileage||0),price:Number(b.price||0),status:b.status||'Available'};db.inventory.unshift(item);await save();return json(res,201,item)}
  if(path.startsWith('/api/inventory/')&&method==='PATCH'){const item=db.inventory.find(x=>x.id===path.split('/')[3]);if(!item)return json(res,404,{error:'Vehicle not found'});Object.assign(item,await body(req));await save();return json(res,200,item)}
  if(path==='/api/appointments'&&method==='GET')return json(res,200,db.appointments);
  if(path==='/api/appointments'&&method==='POST'){const b=await body(req);const a={id:randomUUID(),leadId:b.leadId||null,vehicleId:b.vehicleId||null,date:b.date,time:b.time,name:b.name||'',status:'scheduled',createdAt:new Date().toISOString()};db.appointments.push(a);await save();return json(res,201,a)}
  if(path==='/api/ai/reply'&&method==='POST'){const b=await body(req);return json(res,200,{reply:await aiReply(b.message,b.lead||null)})}
  if(path==='/api/whatsapp/send'&&method==='POST'){const b=await body(req);const result=await sendWhatsApp(b.to,b.message);db.messages.push({id:randomUUID(),channel:'WhatsApp',direction:'out',to:b.to,text:b.message,createdAt:new Date().toISOString()});await save();return json(res,200,result)}
  if(path==='/api/leaks'&&method==='GET'){const now=Date.now();const leaks=db.leads.filter(x=>x.score==='HOT'&&x.stage==='New').map(x=>({id:`hot-${x.id}`,type:'hot_lead_unworked',severity:'high',lead:x})).concat(db.leads.filter(x=>now-new Date(x.updatedAt).getTime()>48*3600000&&x.stage!=='Sold'&&x.stage!=='Lost').map(x=>({id:`stale-${x.id}`,type:'stale_lead',severity:'medium',lead:x})));return json(res,200,leaks)}
  if(path==='/api/leaks/fix-all'&&method==='POST'){let fixed=0;for(const x of db.leads)if(x.score==='HOT'&&x.stage==='New'){x.stage='Qualified';x.updatedAt=new Date().toISOString();fixed++}await save();return json(res,200,{fixed})}
  if(path==='/api/messages'&&method==='GET')return json(res,200,db.messages);
  if(path==='/api/billing/checkout'&&method==='POST')return json(res,200,{status:'demo',message:'Billing checkout is ready for Stripe integration.'});
  if(path==='/api/settings'&&method==='GET')return json(res,200,db.settings);
  if(path==='/api/settings'&&method==='POST'){db.settings={...db.settings,...await body(req)};await save();return json(res,200,db.settings)}
  if(path.startsWith('/api/'))return json(res,404,{error:'Not found'});
  const file=path==='/'?'index.html':path.slice(1);if(file.includes('..'))return text(res,400,'Bad request');const target=new URL(file,PUBLIC_DIR);if(!existsSync(target))return text(res,404,'Not found');const ext=file.split('.').pop();const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml'};return text(res,200,await readFile(target),types[ext]||'application/octet-stream',{'Cache-Control':file==='index.html'?'no-cache':'public, max-age=3600'});
}
await load();
const server=http.createServer(async(req,res)=>{try{await main(req,res)}catch(e){const status=e.status||500;json(res,status,{error:status===500?'Internal server error':e.message})}});
server.listen(PORT,'0.0.0.0',()=>console.log(`AutoRevenue AI listening on ${PORT}`));
async function shutdown(){try{await pool?.end()}finally{server.close(()=>process.exit(0))}}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
