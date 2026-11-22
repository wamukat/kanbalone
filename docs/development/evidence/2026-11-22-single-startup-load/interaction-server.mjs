import path from 'node:path';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw new Error('Pass before or after');
const {buildApp}=await import(path.resolve(phase==='before'?'coverage/single-startup-load/before/src/app.ts':'src/app.ts'));
const app=buildApp({dbFile:path.resolve(`coverage/single-startup-load/${phase}.sqlite`),staticDir:path.resolve(phase==='before'?'coverage/single-startup-load/before/public':'public')});
await app.listen({host:'127.0.0.1',port:phase==='before'?3619:3620});
