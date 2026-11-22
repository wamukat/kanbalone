import path from 'node:path';import {pathToFileURL} from 'node:url';
const {buildApp}=await import(pathToFileURL(path.resolve('src/app.ts')).href);
const app=buildApp({dbFile:path.resolve('coverage/render-followup/benchmark.sqlite'),staticDir:path.resolve('public')});await app.listen({host:'127.0.0.1',port:3628});
