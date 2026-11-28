import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const [runtime,root]=process.argv.slice(2);process.chdir(runtime);
const {buildApp}=await import(pathToFileURL(runtime+'/src/app.ts'));
const app=buildApp({dbFile:root+'/scale.sqlite',staticDir:runtime+'/public',remoteCredentialProviders:[],remoteCredentialScopes:[]});
async function post(url,payload){const r=await app.inject({method:'POST',url,payload});if(r.statusCode!==201)throw Error(r.payload);return r.json()}
const {board,lanes}=await post('/api/boards',{name:'Synthetic card scale',laneNames:['Todo']});
const tags=[];for(let i=0;i<4;i++)tags.push((await post(`/api/boards/${board.id}/tags`,{name:'Verification metadata '+i,color:'#355a99'})).id);
for(let i=0;i<1000;i++)await post(`/api/boards/${board.id}/tickets`,{laneId:lanes[0].id,title:`Synthetic ticket ${i+1}`+(i%3===0?' with a deliberately longer title to exercise measured card heights and keyboard focus':''),priority:i%4+1,tagIds:i%3===0?tags:tags.slice(0,1)});
await app.close();for(const n of ['scale-before','scale-after'])fs.copyFileSync(root+'/scale.sqlite',root+'/'+n+'.sqlite');
console.log('1000 synthetic tickets');
