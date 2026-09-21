"use strict";
// Run inside worker container with WORKER_MODULE and DISPATCHER_MODULE paths.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const {randomUUID}=require("node:crypto");
const worker=require(process.env.WORKER_MODULE || "/app/src/index.js");
const dispatcher=require(process.env.DISPATCHER_MODULE || "/app/dispatcher/index.js");
async function main(){
 const user=randomUUID(),tenant=randomUUID(),book=randomUUID(),revision=randomUUID(),job=randomUUID();
 const tx=worker.withAdminTx;
 const sql=(q,p)=>tx(c=>c.query(q,p));
 let checks=0;
 const check=(label,ok)=>{assert.ok(ok,label);checks++;console.log(`PASS ${label}`);};
 let output;
 try{
  await tx(async c=>{
   await c.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'unused')",[user,`${user}@pipeline.invalid`]);
   await c.query("INSERT INTO tenants(id,name) VALUES($1,'Pipeline test')",[tenant]);
   await c.query("INSERT INTO books(id,tenant_id,owner_id,title,permalink_slug,permalink_suffix) VALUES($1,$2,$3,'Test','pipeline','1234abcd')",[book,tenant,user]);
   await c.query("INSERT INTO revisions(id,tenant_id,book_id,revision_number,source_key,checksum,pipeline_version) VALUES($1,$2,$3,1,'test.pdf','test','v1')",[revision,tenant,book]);
   await c.query("INSERT INTO jobs(id,tenant_id,book_id,revision_id,idempotency_key,state,dispatch_generation,lease_expires_at) VALUES($1,$2,$3,$4,$5,'processing',1,now()+interval '60 seconds')",[job,tenant,book,revision,job]);
  });
  const claims=await Promise.all([worker.claimAttempt(job,1),worker.claimAttempt(job,1)]);
  check('Two concurrent consumers: exactly one owner',claims.filter(Boolean).length===1);
  const old=claims.find(Boolean);
  check('Heartbeat extends valid lease',await worker.heartbeat(old));
  await sql("UPDATE jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",[job]);
  check('Expired lease cannot renew',!await worker.heartbeat(old));
  await dispatcher.reconcileStuckJobs();
  const messages=[];
  await dispatcher.pollAndClaim({add:async(name,data,opts)=>messages.push({data,opts})});
  const message=messages.find(m=>m.data.jobId===job);
  check('Recovery has a new queue identity',message?.opts.jobId===`${job}-2`);
  check('Old generation cannot claim',!await worker.claimAttempt(job,1));
  const current=await worker.claimAttempt(job,2);
  check('New generation can claim',!!current);
  check('Old failure cannot mutate new attempt',!await worker.finalizeFailure(old,'late error'));
  output=`${tenant}/${book}/${revision}/attempts/${current.lease_token}`;
  await fs.mkdir(path.join(process.env.STORAGE_ROOT,output,'pages'),{recursive:true});
  await fs.writeFile(path.join(process.env.STORAGE_ROOT,output,'pages/page-001-reading.webp'),'fixture');
  const manifest={n_pages:1,pages:[{page:1,images:{reading:'pages/page-001-reading.webp'}}]};
  const outcomes=await Promise.all([worker.finalizeSuccess(current,output,manifest),worker.finalizeSuccess(current,output,manifest)]);
  check('Concurrent completion commits once',outcomes.filter(Boolean).length===1);
  check('Late failure cannot downgrade ready',!await worker.finalizeFailure(current,'late failure'));
  const state=await sql("SELECT state,(SELECT count(*) FROM assets WHERE revision_id=$1) AS count FROM revisions WHERE id=$1",[revision]);
  check('Ready revision and exactly two assets',state.rows[0].state==='ready' && Number(state.rows[0].count)===2);
  check('Completed job cannot claim again',!await worker.claimAttempt(job,2));
  // Durable retry, bounded exhaustion (no indefinite queued/failed drift).
  await sql("DELETE FROM assets WHERE revision_id=$1",[revision]);
  await sql("UPDATE revisions SET state='pending' WHERE id=$1",[revision]);
  await sql("UPDATE jobs SET state='processing',attempts=2,dispatch_generation=3,lease_token=NULL,lease_expires_at=now()+interval '60 seconds' WHERE id=$1",[job]);
  const last=await worker.claimAttempt(job,3);
  await worker.finalizeFailure(last,'transient',false);
  const failed=await sql("SELECT state FROM jobs WHERE id=$1",[job]);
  check('Attempt budget exhaustion becomes terminal',failed.rows[0].state==='failed');
  console.log(`PIPELINE JOBS: ${checks} PASS`);
 }finally{
  await sql("DELETE FROM jobs WHERE book_id=$1",[book]);
  await sql("DELETE FROM assets WHERE book_id=$1",[book]);
  await sql("DELETE FROM revisions WHERE book_id=$1",[book]);
  await sql("DELETE FROM books WHERE id=$1",[book]);
  await sql("DELETE FROM tenants WHERE id=$1",[tenant]);
  await sql("DELETE FROM users WHERE id=$1",[user]);
  const root=path.resolve(process.env.STORAGE_ROOT,tenant);
  assert.equal(path.dirname(root),path.resolve(process.env.STORAGE_ROOT));
  await fs.rm(root,{recursive:true,force:true});
  await worker.pool.end();await dispatcher.pool.end();
 }
}
main().catch(e=>{console.error(e);process.exit(1);});
