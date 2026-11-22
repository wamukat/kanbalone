import { buildApp } from '../../../../src/app.ts';
import path from 'node:path';
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Pass before or after');
const app = buildApp({
  dbFile: path.resolve(`coverage/create-keyboard/${phase}.sqlite`),
  staticDir: path.resolve(phase === 'before' ? 'coverage/create-keyboard/public-before' : 'public'),
});
await app.listen({ host: '127.0.0.1', port: phase === 'before' ? 3601 : 3602 });
