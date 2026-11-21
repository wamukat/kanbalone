import { pathToFileURL } from 'node:url';
const [root, dbFile, port] = process.argv.slice(2);
const { buildApp } = await import(pathToFileURL(`${root}/src/app.ts`).href);
const app = buildApp({dbFile,staticDir:`${root}/public`,remoteCredentialProviders:['github']});
app.addHook('onRequest',async(request,reply)=>{
 if(request.url.endsWith('/remote-import/preview')) return reply.send({provider:'github',instanceUrl:'https://github.com',resourceType:'issue',projectKey:'example/project',issueKey:'9',url:'https://github.com/example/project/issues/9',remoteUpdatedAt:null,displayRef:'example/project#9',state:'open',title:'Previously imported issue',duplicate:true,existingTicketId:5,existingTicketRef:'#5'});
});
await app.listen({host:'127.0.0.1',port:Number(port)});
console.log(`Fixture server ${port}`);
