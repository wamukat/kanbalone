import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const [runtime,dbFile,mode,port]=process.argv.slice(2);
process.chdir(runtime);
const {buildApp}=await import(pathToFileURL(path.join(runtime,'src/app.ts')));
const app=buildApp({dbFile,staticDir:path.join(runtime,'public'),remoteCredentialProviders:[],remoteCredentialScopes:[]});
if(mode==='seed'){
 const send=async(method,url,payload)=>{const r=await app.inject({method,url,payload});if(r.statusCode>=300)throw Error(`${method} ${url} ${r.statusCode} ${r.payload}`);return r.json();};
 const post=(u,p)=>send('POST',u,p);
 const {board,lanes}=await post('/api/boards',{name:'Release desk',laneNames:['Todo','In progress']});
 const done=await post(`/api/boards/${board.id}/lanes`,{name:'Done',isCompletionLane:true});
 const tags=[];for(const [name,color] of [['Release','#147d6b'],['Docs','#7140a5'],['Keyboard navigation','#355a99'],['Cross-browser accessibility','#a14649']])tags.push(await post(`/api/boards/${board.id}/tags`,{name,color}));
 const defs=[['リリース前の動作確認と修正内容の最終チェック',lanes[0].id,4,0,4,1],['リリースノートを公開する',lanes[0].id,4,1,3,1],['セットアップ手順を整理する',lanes[0].id,1,1,0,0],['リリース準備を進める',lanes[1].id,3,0,3,2],['利用手順をレビューする',lanes[1].id,2,1,2,0],['更新内容を検証する',done.id,2,0,2,2]];
 const tickets=[];
 for(const [title,laneId,priority,tagIndex,total,completed]of defs){const t=await post(`/api/boards/${board.id}/tickets`,{title,laneId,priority,tagIds:[tags[tagIndex].id]});tickets.push(t);for(let i=0;i<total;i++)await post(`/api/tickets/${t.id}/tasks`,{bodyMarkdown:`Verification step ${i+1}`,done:i<completed});}
 await send('PATCH',`/api/tickets/${tickets[0].id}`,{blockerIds:[tickets[1].id,tickets[3].id]});
 for(const i of [4,5])await send('PATCH',`/api/tickets/${tickets[i].id}`,{parentTicketId:tickets[3].id});
 await send('PATCH',`/api/tickets/${tickets[4].id}`,{blockerIds:[tickets[2].id]});
 const seedDb=new DatabaseSync(dbFile);seedDb.prepare("UPDATE sqlite_sequence SET seq=123456788 WHERE name='tickets'").run();seedDb.close();
 const long=await post(`/api/boards/${board.id}/tickets`,{title:'Narrow card and long ticket reference: verify keyboard focus, metadata wrapping, and lower-edge tooltip visibility',laneId:lanes[1].id,priority:4,tagIds:tags.map(t=>t.id),blockerIds:[tickets[1].id]});
 await post(`/api/tickets/${long.id}/tasks`,{bodyMarkdown:'Long ID independent task',done:false});
 await app.close();
 console.log(JSON.stringify({boardId:board.id,lanes:[...lanes,done],tags,ticketIds:tickets.map(t=>t.id),longId:long.id},null,2));
}else {await app.listen({host:'127.0.0.1',port:Number(port)});console.log(`Listening ${port}`);}
