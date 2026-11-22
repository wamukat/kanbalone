import path from 'node:path';import {buildApp} from '../../../../src/app.ts';
const app=buildApp({dbFile:path.resolve('coverage/group-next/benchmark.sqlite'),staticDir:path.resolve('public')});await app.listen({host:'127.0.0.1',port:3632});
