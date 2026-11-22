// Run from the checkout root with Node 26 --import tsx.
// BASELINE=1 uses the unmodified public copy; both instances use only the disposable fixture.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {buildApp}=await import(pathToFileURL(path.resolve('src/app.ts')).href);
const baseline=process.env.BASELINE==='1';
const app=buildApp({dbFile:path.resolve('coverage/performance-1512/benchmark.sqlite'),staticDir:path.resolve(baseline?'coverage/performance-1512/public-before':'public')});
await app.listen({host:'127.0.0.1',port:baseline?3595:3594});
