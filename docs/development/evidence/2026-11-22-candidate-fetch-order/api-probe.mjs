import fs from 'node:fs';import crypto from 'node:crypto';
const samples=[];
for(const [bid,count] of [[1,1005],[2,10005]])for(let run=0;run<6;run++)for(const order of run%2?['id_asc','position_asc']:['position_asc','id_asc']){
const start=performance.now();let cursor=null,requests=0,bytes=0;const tickets=[];
do{const q=new URLSearchParams({archived:'all',limit:'200',order});if(cursor)q.set('cursor',cursor);const r=await fetch(`http://127.0.0.1:3641/api/boards/${bid}/tickets?${q}`);if(!r.ok)throw Error(r.status);const body=await r.text();bytes+=Buffer.byteLength(body);requests++;const result=JSON.parse(body);tickets.push(...result.tickets);cursor=result.page.nextCursor;}while(cursor);
const ms=performance.now()-start;const hash=crypto.createHash('sha256').update(JSON.stringify(tickets.sort((a,b)=>a.id-b.id))).digest('hex');samples.push({count,order,run,warmup:run===0,ms,requests,bytes,hash});console.log(count,order,run,ms.toFixed(1),requests,bytes);fs.writeFileSync('coverage/candidate-fetch/api-probe.json',JSON.stringify(samples,null,2));
}
