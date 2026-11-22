import { buildApp } from '../../../../src/app.ts';
import path from 'node:path';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw new Error('Pass before or after');
const app=buildApp({dbFile:path.resolve(`coverage/editor-heading-contrast/${phase}.sqlite`),staticDir:path.resolve(phase==='before'?'coverage/editor-heading-contrast/before/public':'public')});
await app.listen({host:'127.0.0.1',port:phase==='before'?3610:3611});
