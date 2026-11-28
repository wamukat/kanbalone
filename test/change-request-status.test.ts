import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import { GithubIssueAdapter } from "../src/remote/github-adapter.js";
import { GitlabIssueAdapter } from "../src/remote/gitlab-adapter.js";
import type { ChangeRequestSnapshot, RemoteIssueAdapter } from "../src/remote/adapters.js";
import type { TicketExternalReferenceView } from "../src/types.js";
import { createDbFile } from "./app-test-helpers.js";

async function fixture(fetchChangeRequest: NonNullable<RemoteIssueAdapter['fetchChangeRequest']>) {
  const dbFile=createDbFile();
  const unused=async()=>{throw new Error('unexpected issue operation');};
  const adapter={provider:'github',fetchIssue:unused,refreshIssue:unused,postComment:unused,fetchChangeRequest};
  const app=buildApp({dbFile,remoteAdapters:{github:adapter,gitlab:{...adapter,provider:'gitlab'}}});
  const db=new KanbanDb(dbFile);
  const {board,lanes}=(await app.inject({method:'POST',url:'/api/boards',payload:{name:'PR status',laneNames:['Todo']}})).json();
  const ticket=(await app.inject({method:'POST',url:`/api/boards/${board.id}/tickets`,payload:{laneId:lanes[0].id,title:'Local title',bodyMarkdown:'Local body'}})).json();
  const root=`/api/tickets/${ticket.id}/external-references/pr`;
  const reference={provider:'github',resourceType:'pull_request',instanceUrl:'https://github.com',projectKey:'acme/app',issueKey:'7',displayRef:'acme/app!7',url:'https://github.com/acme/app/pull/7'};
  const put=async(patch={})=>app.inject({method:'PUT',url:root,payload:{...reference,...patch}});
  await put();
  return {app,db,board,ticket,root,put,refresh:()=>app.inject({method:'POST',url:root+'/refresh'}),read:async()=>(await app.inject({method:'GET',url:`/api/tickets/${ticket.id}`})).json(),close:async()=>{db.close();await app.close();}};
}

test('explicit refresh caches state without importing or rewriting ticket data; errors retain previous success',async()=>{
  let result:ChangeRequestSnapshot|Error={state:'open',isDraft:true};let calls=0;
  const f=await fixture(async()=>{calls++;if(result instanceof Error)throw result;return result;});
  try {
    assert.equal((await f.read()).externalReferences[0].changeRequestStatus,null);assert.equal(calls,0);
    assert.equal((await f.refresh()).statusCode,200);
    let stored=await f.read();assert.equal(stored.externalReferences[0].changeRequestStatus.state,'open');assert.equal(stored.externalReferences[0].changeRequestStatus.isDraft,true);
    const fetched=stored.externalReferences[0].changeRequestStatus.fetchedAt;
    assert.equal(stored.title,'Local title');assert.equal(stored.bodyMarkdown,'Local body');assert.equal(stored.remote,null);
    result=new Error('GitHub request failed: 429 SECRET upstream body');
    assert.equal((await f.refresh()).statusCode,502);stored=await f.read();
    const status=stored.externalReferences[0].changeRequestStatus;
    assert.equal(status.state,'open');assert.equal(status.fetchedAt,fetched);assert.equal(status.error,'remote provider rate limit was reached');assert.ok(!JSON.stringify(stored).includes('SECRET'));
    result={state:'merged',isDraft:false};assert.equal((await f.refresh()).statusCode,200);
    const list=(await f.app.inject({method:'GET',url:`/api/boards/${f.board.id}/tickets?limit=1`})).json();
    assert.equal(list.tickets[0].externalReferences[0].changeRequestStatus.state,'merged');
    assert.equal(list.tickets[0].externalReferences[0].changeRequestStatus.error,null);assert.equal(calls,3);
    await f.put({resourceType:'issue'});assert.equal((await f.refresh()).statusCode,400);assert.equal(calls,3);
  } finally {await f.close();}
});

test('replacing, ABA editing and removing a reference reject delayed refresh responses',async()=>{
  let release!:(value:ChangeRequestSnapshot)=>void;let started!:()=>void;
  const f=await fixture(()=>new Promise(resolve=>{release=resolve;started();}));
  try {
    for(const action of ['replace','aba','delete']) {
      await f.put();const began=new Promise<void>(resolve=>{started=resolve;});const pending=f.refresh();await began;
      if(action==='delete') await f.app.inject({method:'DELETE',url:f.root});
      else {await f.put({issueKey:'8',url:'https://github.com/acme/app/pull/8'});if(action==='aba')await f.put();}
      release({state:'merged',isDraft:false});assert.equal((await pending).statusCode,409);
      const refs=(await f.read()).externalReferences;
      if(action==='delete')assert.deepEqual(refs,[]);else assert.equal(refs[0].changeRequestStatus,null);
    }
  } finally {await f.close();}
});

test('newest refresh wins and status writes invalidate ticket pagination revision',async()=>{
  const releases:Array<(value:ChangeRequestSnapshot)=>void>=[];let notify=()=>{};
  const f=await fixture(()=>new Promise(resolve=>{releases.push(resolve);notify();}));
  try {
    const revision=()=>f.db.sqlite.prepare('SELECT revision FROM ticket_list_revisions WHERE board_id=?').get(f.board.id) as {revision:number};
    const initial=revision().revision;
    let began=new Promise<void>(resolve=>{notify=resolve;});const first=f.refresh();await began;
    began=new Promise<void>(resolve=>{notify=resolve;});const second=f.refresh();await began;
    releases[1]({state:'closed',isDraft:false});assert.equal((await second).statusCode,200);
    releases[0]({state:'open',isDraft:true});assert.equal((await first).statusCode,409);
    assert.equal((await f.read()).externalReferences[0].changeRequestStatus.state,'closed');assert.ok(revision().revision>initial);
  } finally {await f.close();}
});

test('GitHub and GitLab adapters use GET status endpoints, scoped credentials and reject redirects',async()=>{
  let body:unknown={state:'open',merged:false,draft:true};let redirect=false;const seen:Array<{url:string;auth:string|undefined}>=[];
  const server=createServer((req,res)=>{seen.push({url:req.url!,auth:String(req.headers.authorization??req.headers['private-token'])});
    if(redirect){res.writeHead(302,{location:'/unexpected'});res.end();return;}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(body));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const credential={getCredential:({instanceUrl}:{instanceUrl:string})=>{assert.equal(instanceUrl,origin);return {type:'token' as const,token:'fixture-token'};}};
  const ref={instanceUrl:origin,projectKey:'team/app',issueKey:'7'} as TicketExternalReferenceView;
  try {
    const gh=new GithubIssueAdapter(credential);const gl=new GitlabIssueAdapter(credential);
    assert.deepEqual(await gh.fetchChangeRequest(ref),{state:'open',isDraft:true});assert.equal(seen[0].url,'/api/v3/repos/team/app/pulls/7');assert.equal(seen[0].auth,'Bearer fixture-token');
    body={state:'closed',merged:true};assert.deepEqual(await gh.fetchChangeRequest(ref),{state:'merged',isDraft:false});
    body={state:'opened',draft:true};assert.deepEqual(await gl.fetchChangeRequest(ref),{state:'open',isDraft:true});assert.equal(seen.at(-1)?.url,'/api/v4/projects/team%2Fapp/merge_requests/7');assert.equal(seen.at(-1)?.auth,'fixture-token');
    body={state:'merged'};assert.deepEqual(await gl.fetchChangeRequest(ref),{state:'merged',isDraft:false});
    body={state:'closed'};assert.deepEqual(await gl.fetchChangeRequest(ref),{state:'closed',isDraft:false});
    body={state:'unknown'};await assert.rejects(()=>gl.fetchChangeRequest(ref),/Invalid merge request response/);
    redirect=true;const before=seen.length;await assert.rejects(()=>gl.fetchChangeRequest(ref));assert.equal(seen.length,before+1);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
