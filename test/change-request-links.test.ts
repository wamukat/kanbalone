import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { createDbFile } from './app-test-helpers.js';
import { parseChangeRequestLink } from '../src/change-request-link.js';

test('MR/PR link URLs normalize identity without an external lookup',()=>{
  assert.equal(parseChangeRequestLink('https://github.com/%41cme/App/pull/42/?tab=files#diff').url,'https://github.com/acme/app/pull/42');
  assert.equal(parseChangeRequestLink('https://gitlab.example.com/team/sub/app/-/merge_requests/7').projectKey,'team/sub/app');
  assert.equal(parseChangeRequestLink('https://git.example.com/team/app/pull/7').provider,'github');
  for(const url of ['https://github.com/a/b/issues/1','http://github.com/a/b/pull/1','https://u:secret@github.com/a/b/pull/1','https://github.com/a/b/pull/0','https://github.com/a/b%2fc/pull/1','https://github.com/a/b/-/merge_requests/1','https://gitlab.com/a/b/pull/1','https://github.com/a/b/pull/9007199254740992'])assert.throws(()=>parseChangeRequestLink(url));
});

test('link create never overwrites, deduplicates simultaneous adds, and guarded unlink rejects replacement and ABA',async()=>{
  const app=buildApp({dbFile:createDbFile()});
  try {
    const {board,lanes}=(await app.inject({method:'POST',url:'/api/boards',payload:{name:'Links',laneNames:['Todo']}})).json();
    const ticket=(await app.inject({method:'POST',url:`/api/boards/${board.id}/tickets`,payload:{laneId:lanes[0].id,title:'Keep title',bodyMarkdown:'Keep body'}})).json();
    const root=`/api/tickets/${ticket.id}`;
    const add=(url:string)=>app.inject({method:'POST',url:root+'/change-request-links',payload:{url}});
    const read=async()=>(await app.inject({method:'GET',url:root})).json();
    const replies=await Promise.all([add('https://github.com/Acme/App/pull/7'),add('https://github.com/acme/app/pull/7/?x=1')]);
    assert.deepEqual(replies.map(x=>x.statusCode).sort(),[200,409]);
    const original=(await read()).externalReferences[0];assert.equal(original.revision,0);
    assert.equal((await add('https://gitlab.com/team/app/-/merge_requests/8')).statusCode,200);
    assert.equal((await read()).externalReferences.length,2);
    const unlink=(id:number,revision:number)=>app.inject({method:'DELETE',url:`${root}/change-request-links/${id}`,payload:{expectedRevision:revision}});
    const put=(url:string)=>app.inject({method:'PUT',url:`${root}/external-references/${original.kind}`,payload:{...parseChangeRequestLink(url)}});
    await put('https://github.com/acme/app/pull/9');await put(original.url);
    assert.equal((await unlink(original.id,original.revision)).statusCode,409);
    const current=(await read()).externalReferences.find((x:{id:number})=>x.id===original.id);assert.equal(current.revision,2);
    assert.equal((await unlink(current.id,current.revision)).statusCode,200);
    assert.equal((await read()).externalReferences.length,1);
    await put(original.url);
    assert.equal((await unlink(current.id,current.revision)).statusCode,409);
    const saved=await read();assert.equal(saved.title,ticket.title);assert.equal(saved.bodyMarkdown,ticket.bodyMarkdown);assert.equal(saved.laneId,ticket.laneId);assert.equal(saved.externalReferences.length,2);
    assert.equal((await add('https://github.com/acme/app/issues/4')).statusCode,400);
    assert.equal((await app.inject({method:'DELETE',url:`${root}/change-request-links/${saved.externalReferences[0].id}`,payload:{}})).statusCode,400);
    const other=(await app.inject({method:'POST',url:`/api/boards/${board.id}/tickets`,payload:{laneId:lanes[0].id,title:'Other'}})).json();
    assert.equal((await app.inject({method:'DELETE',url:`/api/tickets/${other.id}/change-request-links/${saved.externalReferences[0].id}`,payload:{expectedRevision:0}})).statusCode,409);
  } finally {await app.close();}
});
