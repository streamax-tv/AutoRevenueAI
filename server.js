import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, 'data.json');
const PORT = Number(process.env.PORT || 3001);

const initial = {
  dealership: { id:'atlas-cars', name:'Atlas Cars', city:'Casablanca', currency:'EUR' },
  leads: [
    {id:'L-1001',name:'Youssef El Amrani',vehicle:'Mercedes CLA 220d',score:'HOT',stage:'Qualified',source:'WhatsApp',lastContact:'8 min ago'},
    {id:'L-1002',name:'Sarah Benali',vehicle:'BMW 320d M Sport',score:'HOT',stage:'Appointment',source:'Instagram',lastContact:'21 min ago'},
    {id:'L-1003',name:'Mehdi Alaoui',vehicle:'Mercedes GLC 300',score:'WARM',stage:'New',source:'Website',lastContact:'42 min ago'},
    {id:'L-1004',name:'Nadia Idrissi',vehicle:'Audi Q5 S line',score:'COLD',stage:'New',source:'Facebook',lastContact:'1h ago'}
  ],
  inventory: [
    {id:'V-001',make:'Mercedes-Benz',model:'GLC 300',year:2023,km:32400,fuel:'Hybrid',price:56900,status:'Available'},
    {id:'V-002',make:'BMW',model:'320d M Sport',year:2022,km:48120,fuel:'Diesel',price:38900,status:'Available'},
    {id:'V-003',make:'Audi',model:'Q5 S line',year:2023,km:27850,fuel:'Diesel',price:47900,status:'Reserved'},
    {id:'V-004',make:'Mercedes',model:'CLA 220d',year:2023,km:41770,fuel:'Diesel',price:34900,status:'Available'}
  ],
  appointments: [
    {id:'A-001',when:'Today, 10:30',name:'Sarah Benali',vehicle:'BMW 320d M Sport',status:'Confirmed'},
    {id:'A-002',when:'Today, 14:00',name:'Omar Tazi',vehicle:'Mercedes GLC 300',status:'Confirmed'},
    {id:'A-003',when:'Tomorrow, 11:15',name:'Imane Chraibi',vehicle:'Mercedes CLA 220d',status:'Confirmed'},
    {id:'A-004',when:'Tomorrow, 16:30',name:'Rachid Fassi',vehicle:'Audi Q5 S line',status:'Confirmed'}
  ],
  metrics: {newLeads:148,qualified:64,appointments:31,revenue:186400,revenueLeaks:42800}
};

function ensureData(){ if(!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(initial,null,2)); }
function read(){ ensureData(); return JSON.parse(fs.readFileSync(dataFile,'utf8')); }
function write(d){ fs.writeFileSync(dataFile, JSON.stringify(d,null,2)); }
function json(res,status,payload){ res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}); res.end(JSON.stringify(payload)); }
function body(req){ return new Promise((resolve,reject)=>{let s=''; req.on('data',c=>s+=c); req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}})}); }

const server=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS') return json(res,204,{});
  const url=new URL(req.url,`http://${req.headers.host}`);
  try {
    const db=read();
    if(req.method==='GET' && url.pathname==='/api/health') return json(res,200,{ok:true,service:'AutoRevenue AI API'});
    if(req.method==='GET' && url.pathname==='/api/dashboard') return json(res,200,{dealership:db.dealership,metrics:db.metrics,leads:db.leads.slice(0,8),inventory:db.inventory,appointments:db.appointments});
    if(req.method==='GET' && url.pathname==='/api/leads') return json(res,200,db.leads);
    if(req.method==='POST' && url.pathname==='/api/leads') { const x=await body(req); const lead={id:`L-${Date.now()}`,stage:'New',score:'COLD',lastContact:'just now',...x}; db.leads.unshift(lead); db.metrics.newLeads++; write(db); return json(res,201,lead); }
    if(req.method==='POST' && url.pathname==='/api/leads/qualify') { const x=await body(req); const lead=db.leads.find(l=>l.id===x.id); if(!lead) return json(res,404,{error:'Lead not found'}); lead.score=x.score||'WARM'; lead.stage='Qualified'; write(db); return json(res,200,lead); }
    if(req.method==='GET' && url.pathname==='/api/inventory') return json(res,200,db.inventory);
    if(req.method==='POST' && url.pathname==='/api/inventory') { const x=await body(req); const v={id:`V-${Date.now()}`,status:'Available',...x}; db.inventory.push(v); write(db); return json(res,201,v); }
    if(req.method==='GET' && url.pathname==='/api/appointments') return json(res,200,db.appointments);
    if(req.method==='POST' && url.pathname==='/api/appointments') { const x=await body(req); const a={id:`A-${Date.now()}`,status:'Pending',...x}; db.appointments.push(a); write(db); return json(res,201,a); }
    if(req.method==='POST' && url.pathname==='/api/leaks/fix') return json(res,200,{ok:true,actions:['Re-contact 3 hot leads','Send 2 appointment confirmations','Reactivate 2 stale prospects'],message:'Automation actions queued'});
    return json(res,404,{error:'Route not found'});
  } catch(e) { console.error(e); return json(res,500,{error:'Internal server error'}); }
});

ensureData();
server.listen(PORT,()=>console.log(`AutoRevenue AI API running on http://localhost:${PORT}`));
