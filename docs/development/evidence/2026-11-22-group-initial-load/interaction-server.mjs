import path from 'node:path';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw new Error('Pass before or after');
const source=phase==='before'?'coverage/group-initial-load/before/src/app.ts':'src/app.ts';
const {buildApp}=await import(path.resolve(source));
const app=buildApp({dbFile:path.resolve(`coverage/group-initial-load/${phase}.sqlite`),staticDir:path.resolve(phase==='before'?'coverage/group-initial-load/before/public':'public')});
await app.listen({host:'127.0.0.1',port:phase==='before'?3612:3613});
