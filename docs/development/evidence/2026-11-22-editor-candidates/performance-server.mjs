import {pathToFileURL} from 'node:url';
const {buildApp}=await import(pathToFileURL(process.cwd()+'/src/app.ts').href);
const variant=process.argv[2],done=Number(process.argv[3]);
const port={'before-0':3631,'after-0':3632,'before-9900':3635,'after-9900':3636}[`${variant}-${done}`];
const app=buildApp({dbFile:process.cwd()+`/coverage/editor-perf/${variant}-${done}.sqlite`,staticDir:process.cwd()+(variant==='before'?'/coverage/editor-perf/baseline/public':'/public')});await app.listen({host:'127.0.0.1',port});
