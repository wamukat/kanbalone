import {buildApp} from '../../../../src/app.ts';import path from 'node:path';
const app=buildApp({dbFile:path.resolve('coverage/relation-next/benchmark.sqlite'),staticDir:path.resolve('public')});await app.listen({host:'127.0.0.1',port:3640});
