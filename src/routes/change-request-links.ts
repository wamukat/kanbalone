import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { RegisterTicketRoutesContext } from './ticket-route-context.js';
import { parseChangeRequestLink } from '../change-request-link.js';

const fail = (message: string, statusCode: number): never => { throw Object.assign(new Error(message), { statusCode }); };
export function registerChangeRequestLinkRoutes(app: FastifyInstance, ctx: RegisterTicketRoutesContext) {
  const { db, schemas, serializeTicket, publishBoardEvent, getIdParam } = ctx;
  const responses = { 200: schemas.ticketSchema, 400: schemas.errorSchema, 404: schemas.errorSchema, 409: schemas.errorSchema };
  app.post('/api/tickets/:ticketId/change-request-links', { schema: {
    params: {type:'object', required:['ticketId'], properties:{ticketId:{type:'integer',minimum:1}}},
    body: {type:'object', additionalProperties:false, required:['url'], properties:{url:{type:'string',minLength:1,maxLength:4096}}},
    response: responses,
  } }, async (request) => {
    const ticketId = getIdParam(request.params, 'ticketId');
    const link = parseChangeRequestLink((request.body as {url:string}).url);
    const updated = db.sqlite.transaction(() => {
      const ticket = db.getTicket(ticketId) ?? fail('ticket not found',404);
      const duplicate = ticket.externalReferences.some(ref => {
        try { return parseChangeRequestLink(ref.url).url === link.url; } catch { return false; }
      });
      if (duplicate) fail('This MR/PR is already linked to this ticket.',409);
      const kind = `${link.provider === 'github' ? 'pr' : 'mr'}-${randomUUID()}`;
      return db.upsertTicketExternalReference({ticketId,kind,...link}, {
        boardId:ticket.boardId,ticketId,action:'external_reference_set',message:'External reference set',details:{kind,provider:link.provider,displayRef:link.displayRef},
      });
    }).immediate();
    publishBoardEvent(updated.boardId);
    return serializeTicket(updated);
  });
  app.delete('/api/tickets/:ticketId/change-request-links/:referenceId', { schema: {
    params: {type:'object',required:['ticketId','referenceId'],properties:{ticketId:{type:'integer',minimum:1},referenceId:{type:'integer',minimum:1}}},
    body: {type:'object',additionalProperties:false,required:['expectedRevision'],properties:{expectedRevision:{type:'integer',minimum:0}}},
    response: responses,
  } }, async (request) => {
    const ticketId=getIdParam(request.params,'ticketId'), referenceId=getIdParam(request.params,'referenceId');
    const expected=(request.body as {expectedRevision:number}).expectedRevision;
    const updated=db.sqlite.transaction(()=>{
      const ticket=db.getTicket(ticketId) ?? fail('ticket not found',404);
      const ref=ticket.externalReferences.find(ref=>ref.id===referenceId) ?? fail('This link changed. Cancel and reopen the confirmation.',409);
      if (ref.revision !== expected) fail('This link changed. Cancel and reopen the confirmation.',409);
      if (!(ref.provider==='github' && ref.resourceType==='pull_request' || ref.provider==='gitlab' && ref.resourceType==='merge_request')) fail('unsupported change request reference',400);
      return db.deleteTicketExternalReference(ticketId,ref.kind,{boardId:ticket.boardId,action:'external_reference_removed',message:'External reference removed',details:{kind:ref.kind}});
    }).immediate();
    publishBoardEvent(updated.boardId);
    return serializeTicket(updated);
  });
}
