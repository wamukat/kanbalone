import { buildApp } from '../../../../src/app.ts';
import path from 'node:path';
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Pass before or after');
const app = buildApp({ dbFile: path.resolve(`coverage/group-partial-render/${phase}.sqlite`),
  staticDir: path.resolve(phase === 'before' ? 'coverage/group-partial-render/before/public' : 'public') });
await app.listen({ host: '127.0.0.1', port: phase === 'before' ? 3603 : 3604 });
