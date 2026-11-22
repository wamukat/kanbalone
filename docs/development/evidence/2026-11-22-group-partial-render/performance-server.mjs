import path from 'node:path';import {pathToFileURL} from 'node:url';
const {buildApp}=await import(pathToFileURL(path.resolve('src/app.ts')).href);
const before=process.env.BASELINE==='1';const app=buildApp({dbFile:path.resolve('coverage/group-partial-render/performance/benchmark.sqlite'),staticDir:path.resolve(before?'coverage/group-partial-render/before/public':'public')});await app.listen({host:'127.0.0.1',port:before?3605:3606});
