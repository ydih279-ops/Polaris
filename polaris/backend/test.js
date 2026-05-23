// Integration test: real Express app + routes, with pg's Pool stubbed by an
// in-memory store. Proves auth, JWT, upload parsing, ownership checks & stats.
const Module = require("module");
const origReq = Module.prototype.require;

// in-memory tables
const db = { users: [], datasets: [], data_points: [], seq: { users:0, datasets:0, data_points:0 } };

function fakeQuery(text, params=[]) {
  const t = text.replace(/\s+/g," ").trim();
  // INSERT users
  if (/^INSERT INTO users/.test(t)) {
    if (db.users.find(u=>u.email===params[0])) { const e=new Error("dup"); e.code="23505"; throw e; }
    const row={id:++db.seq.users,email:params[0],password_hash:params[1],created_at:new Date()};
    db.users.push(row); return {rows:[{id:row.id,email:row.email}]};
  }
  if (/^SELECT id, email, password_hash FROM users WHERE email/.test(t)) {
    const u=db.users.find(u=>u.email===params[0]); return {rows:u?[u]:[]};
  }
  if (/^SELECT id, email, created_at FROM users WHERE id/.test(t)) {
    const u=db.users.find(u=>u.id===params[0]); return {rows:u?[{id:u.id,email:u.email,created_at:u.created_at}]:[]};
  }
  if (/^INSERT INTO datasets/.test(t)) {
    const row={id:++db.seq.datasets,user_id:params[0],name:params[1],created_at:new Date()};
    db.datasets.push(row); return {rows:[row]};
  }
  if (/^SELECT user_id FROM datasets WHERE id/.test(t)) {
    const d=db.datasets.find(d=>d.id==params[0]); return {rows:d?[{user_id:d.user_id}]:[]};
  }
  if (/^SELECT d.id, d.name, d.created_at/.test(t)) {
    const out=db.datasets.filter(d=>d.user_id===params[0]).map(d=>({id:d.id,name:d.name,created_at:d.created_at,point_count:db.data_points.filter(p=>p.dataset_id===d.id).length}));
    return {rows:out};
  }
  if (/^INSERT INTO data_points/.test(t)) {
    for(let i=0;i<params.length;i+=4){db.data_points.push({id:++db.seq.data_points,dataset_id:params[i],date:params[i+1],metric_name:params[i+2],metric_value:params[i+3]});}
    return {rows:[]};
  }
  if (/^SELECT date, metric_name, metric_value FROM data_points WHERE dataset_id/.test(t)) {
    const out=db.data_points.filter(p=>p.dataset_id==params[0]).map(p=>({date:p.date,metric_name:p.metric_name,metric_value:p.metric_value}));
    return {rows:out};
  }
  if (/^BEGIN|^COMMIT|^ROLLBACK/.test(t)) return {rows:[]};
  if (/^DELETE FROM datasets/.test(t)) { db.datasets=db.datasets.filter(d=>d.id!=params[0]); return {rows:[]}; }
  throw new Error("unhandled query: "+t.slice(0,60));
}
const fakePool = { query:(t,p)=>Promise.resolve(fakeQuery(t,p)), connect:()=>Promise.resolve({query:(t,p)=>Promise.resolve(fakeQuery(t,p)),release(){}}), on(){}, end(){return Promise.resolve();} };

// stub modules
Module.prototype.require = function(id){
  if (id==="pg") return { Pool: function(){ return fakePool; } };
  if (id==="dotenv") return { config(){} };
  return origReq.apply(this,arguments);
};
process.env.JWT_SECRET="test-secret";
process.env.PORT="5099";

const app = origReq.call(module, "/home/claude/polaris/backend/server.js");

// give server a tick to boot, then run requests
setTimeout(run, 400);
async function run(){
  const base="http://localhost:5099";
  const j=async(r)=>({s:r.status,b:await r.json().catch(()=>({}))});
  let pass=0,fail=0;
  const ok=(c,m)=>{c?(pass++,console.log("  ✓",m)):(fail++,console.log("  ✗",m));};

  // health
  let r=await j(await fetch(base+"/api/health")); ok(r.b.status==="ok","health endpoint");

  // signup
  r=await j(await fetch(base+"/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"a@b.com",password:"secret1"})}));
  ok(r.s===200&&r.b.token,"signup returns token");
  const tok=r.b.token;

  // duplicate signup blocked
  r=await j(await fetch(base+"/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"a@b.com",password:"secret1"})}));
  ok(r.s===409,"duplicate email rejected (409)");

  // bad password
  r=await j(await fetch(base+"/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"c@d.com",password:"x"})}));
  ok(r.s===400,"short password rejected (400)");

  // login wrong pass
  r=await j(await fetch(base+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"a@b.com",password:"wrong"})}));
  ok(r.s===401,"wrong password rejected (401)");

  // login correct
  r=await j(await fetch(base+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"a@b.com",password:"secret1"})}));
  ok(r.s===200&&r.b.token,"login returns token");

  // protected route without token
  r=await j(await fetch(base+"/dashboard/datasets"));
  ok(r.s===401,"protected route blocks no-token (401)");

  // me
  r=await j(await fetch(base+"/auth/me",{headers:{Authorization:"Bearer "+tok}}));
  ok(r.s===200&&r.b.email==="a@b.com","/auth/me returns user");

  // upload CSV
  const csv="date,metric_name,metric_value\n2024-01-01,active_users,100\n2024-01-02,active_users,150\n2024-01-01,revenue,1000\n2024-01-02,revenue,1200\n";
  const fd=new FormData(); fd.append("file",new Blob([csv],{type:"text/csv"}),"test.csv");
  r=await j(await fetch(base+"/upload",{method:"POST",headers:{Authorization:"Bearer "+tok},body:fd}));
  ok(r.s===200&&r.b.rows_inserted===4,"CSV upload inserts 4 rows");
  const dsid=r.b.dataset.id;

  // datasets list
  r=await j(await fetch(base+"/dashboard/datasets",{headers:{Authorization:"Bearer "+tok}}));
  ok(r.s===200&&r.b.length===1&&r.b[0].point_count===4,"dataset list shows point_count=4");

  // chart data pivot
  r=await j(await fetch(base+"/dashboard/data/"+dsid,{headers:{Authorization:"Bearer "+tok}}));
  ok(r.b.active_users&&r.b.active_users.length===2&&r.b.revenue.length===2,"chart data pivoted by metric");

  // stats math: active_users 100->150 = +50%
  r=await j(await fetch(base+"/dashboard/stats/"+dsid,{headers:{Authorization:"Bearer "+tok}}));
  const au=r.b.find(x=>x.metric_name==="active_users");
  ok(au&&au.latest===150&&au.change_pct===50,"stats compute latest=150, +50%");

  // ownership: second user can't read first user's dataset
  await fetch(base+"/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"e@f.com",password:"secret2"})});
  const r2=await (await fetch(base+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"e@f.com",password:"secret2"})})).json();
  r=await j(await fetch(base+"/dashboard/data/"+dsid,{headers:{Authorization:"Bearer "+r2.token}}));
  ok(r.s===403,"cross-user access blocked (403)");

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
}
