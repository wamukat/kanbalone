import path from 'node:path';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw new Error('Pass before or after');
const prefix=phase==='before'?'coverage/editor-candidates/baseline/':'';
const {buildApp}=await import(path.resolve(prefix+'src/app.ts'));
const app=buildApp({dbFile:path.resolve(`coverage/editor-candidates/${phase}.sqlite`),staticDir:path.resolve(prefix+'public')});
await app.listen({host:'127.0.0.1',port:phase==='before'?3624:3625});
