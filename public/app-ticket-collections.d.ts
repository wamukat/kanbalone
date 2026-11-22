import type { FetchPage, TicketPage } from "./app-ticket-pages.js";
export type LoadOptions = {isCurrent: () => boolean; signal?: AbortSignal};
export function loadKanbanTicketCollections(api: FetchPage, lanes: Array<{id:number; isCompletionLane?:boolean}>, url:string, options:LoadOptions & {limits:Map<number,number>}): Promise<{
  tickets: TicketPage["tickets"];
  completionPages: Record<number, TicketPage["page"] & {url:string; tickets:TicketPage["tickets"]}>;
}>;
export function loadListTicketCollection(api: FetchPage, url:string, options:LoadOptions & {allReferences?:()=>boolean}): Promise<TicketPage & {referenceTickets:TicketPage["tickets"]}>;
