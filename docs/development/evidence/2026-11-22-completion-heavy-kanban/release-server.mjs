import Database from 'better-sqlite3';
import {buildApp} from './release/src/app.ts';
import fs from 'node:fs';
const dbFile=process.cwd()+'/coverage/completion-heavy/release-9900.sqlite';
if(!fs.existsSync(dbFile)){const db=new Database('coverage/completion-heavy/done-9900.sqlite',{readonly:true});await db.backup(dbFile);db.close();}
const app=buildApp({dbFile,staticDir:process.cwd()+'/coverage/completion-heavy/release/public'});
await app.listen({host:'127.0.0.1',port:3621});console.log('v1.0.0 fixture 3621');
