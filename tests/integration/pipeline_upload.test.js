"use strict";
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {Client}=require('pg');
const BASE=process.env.API_BASE_URL || 'http://127.0.0.1:3000';
async function main(){
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL || process.env.DATABASE_URL});await db.connect();
 const login=await fetch(BASE+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.SEED_ADMIN_EMAIL||'admin@misa.local',password:process.env.SEED_ADMIN_PASSWORD||'ChangeThisAdminPw123!'})}).then(r=>r.json());
 assert.ok(login.accessToken);
 const token=login.accessToken;
 const tenant=(await db.query("INSERT INTO tenants(name) VALUES('Upload pipeline test') RETURNING id")).rows[0].id;
 const headers={Authorization:`Bearer ${token}`,'x-tenant-id':tenant};
 let count=0;const check=(label,ok)=>{assert.ok(ok,label);count++;console.log('PASS '+label);};
 const json=async(url,body)=>fetch(BASE+url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
 const book=await json('/books',{title:'Upload admission test'});
 const pdf=await fs.readFile(path.join(__dirname,'../fixtures/pdf/sample_vi_text.pdf'));
 const upload=async()=>{const form=new FormData();form.append('file',new Blob([pdf]),'test.pdf');const r=await fetch(`${BASE}/books/${book.id}/upload`,{method:'POST',headers,body:form});return {status:r.status,data:await r.json()};};
 try{
  await db.query("UPDATE tenants SET quotas='{"+'"source_bytes":0'+"}' WHERE id=$1",[tenant]);
  check('Tenant source quota rejects before revision creation',(await upload()).status===409);
  await db.query("UPDATE tenants SET quotas='{}' WHERE id=$1",[tenant]);
  const uploads=await Promise.all([upload(),upload()]);
  check('Concurrent uploads accepted',uploads.every(r=>r.status===201));
  check('Revision numbers serialized',new Set(uploads.map(r=>r.data.revisionNumber)).size===2);
  const boundary='codex-pipeline-boundary';
  const start=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slow.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
  const end=Buffer.from(`\r\n--${boundary}--\r\n`);
  let request;
  const response=new Promise((resolve,reject)=>{
   request=http.request(`${BASE}/books/${book.id}/upload`,{method:'POST',headers:{...headers,'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':start.length+pdf.length+end.length}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});request.on('error',reject);request.write(start);request.write(pdf.subarray(0,10));
  });
  await new Promise(r=>setTimeout(r,700));
  const sessions=await db.query("SELECT count(*) FROM pg_stat_activity WHERE usename='app_user' AND state='idle in transaction'");
  check('Slow upload holds no idle DB transaction',Number(sessions.rows[0].count)===0);
  request.end(Buffer.concat([pdf.subarray(10),end]));
  check('Slow streamed upload completes',await response===201);
  const url=`${BASE}/books/${book.id}/upload`;
  const aborted=http.request(url,{method:'POST',headers:{...headers,'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':start.length+pdf.length+end.length}});
  aborted.on('error',()=>{});aborted.write(start);aborted.write(pdf.subarray(0,10));
  await new Promise(r=>setTimeout(r,200));aborted.destroy();await new Promise(r=>setTimeout(r,700));
  if(process.env.STORAGE_ROOT){
   const temp=await fs.readdir(path.join(process.env.STORAGE_ROOT,'.uploads'));
   check('Aborted upload leaves no temporary file directory',temp.length===0);
  }
  console.log(`PIPELINE UPLOAD: ${count} PASS`);
 }finally{
  // Delete only this test tenant. Files are cleaned after worker completion below.
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){const r=await db.query("SELECT count(*) FROM jobs WHERE tenant_id=$1 AND state IN ('queued','processing')",[tenant]);if(Number(r.rows[0].count)===0)break;await new Promise(r=>setTimeout(r,300));}
  await db.query('DELETE FROM jobs WHERE tenant_id=$1',[tenant]);await db.query('DELETE FROM assets WHERE tenant_id=$1',[tenant]);await db.query('DELETE FROM revisions WHERE tenant_id=$1',[tenant]);
  await db.query('DELETE FROM books WHERE tenant_id=$1',[tenant]);await db.query('DELETE FROM tenants WHERE id=$1',[tenant]);await db.end();
  if(process.env.STORAGE_ROOT){const root=path.resolve(process.env.STORAGE_ROOT,tenant);assert.equal(path.dirname(root),path.resolve(process.env.STORAGE_ROOT));await fs.rm(root,{recursive:true,force:true});}
 }
}
main().catch(e=>{console.error(e);process.exit(1);});
