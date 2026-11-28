import { t } from './app-i18n.js';

export function createChangeRequestLinks(ctx, applyReferences) {
  const { state, elements } = ctx;
  let dialogPending = false;
  async function open(reference = null) {
    const ticket = state.dialogTicket;
    if (!ticket || state.dialogMode !== 'view' || dialogPending || elements.uxDialog.open) return;
    const isCurrent = ctx.captureDialogScope();
    const origin = document.activeElement;
    let saved = null;
    dialogPending = true;
    try {
      const onSubmit = async () => {
        if (!isCurrent()) throw new Error(t('This ticket changed. Close and reopen the dialog.'));
        try {
          saved = await ctx.sendJson(reference
            ? `/api/tickets/${ticket.id}/change-request-links/${reference.id}`
            : `/api/tickets/${ticket.id}/change-request-links`, {
            method: reference ? 'DELETE' : 'POST',
            body: reference ? { expectedRevision: reference.revision }
              : { url: elements.uxFields.querySelector('[data-change-request-url]').value.trim() },
          });
        } catch (error) { throw new Error(t(error.message)); }
      };
      let result;
      if (reference) {
        result = ctx.openConfirmDialog({title:t('Unlink MR/PR'),message:t('Remove only the link from this ticket. The external MR/PR will not be deleted.'),
          details:[reference.displayRef,reference.url],submitLabel:t('Unlink'),submitIcon:'x',detailsLabel:t('Link to unlink:'),onSubmit});
      } else {
        result = ctx.openFormDialog({title:t('Link MR/PR'),submitLabel:t('Link'),onSubmit,
          fields:`<label>${t('MR/PR URL')}<input type="url" data-change-request-url required maxlength="4096" autocomplete="off" placeholder="https://github.com/owner/repo/pull/123" aria-describedby="change-request-link-help change-request-link-preview"></label>
            <p id="change-request-link-help" class="muted">${t('Link a GitHub PR or GitLab MR. This does not import an Issue or fetch its status.')}</p>
            <p id="change-request-link-preview" class="muted change-request-link-preview" aria-live="polite"></p>`});
        const input=elements.uxFields.querySelector('[data-change-request-url]');
        input.addEventListener('input',()=>{
          elements.uxError.hidden=true;
          let preview='';
          try { const url=new URL(input.value); if(url.protocol==='https:'&&!url.username&&!url.password)preview=url.host+url.pathname; } catch {}
          elements.uxFields.querySelector('#change-request-link-preview').textContent=preview;
        });
      }
      await result;
      if (saved) {
        if (isCurrent()) applyReferences(saved);
        try { await ctx.refreshBoardDetail(); }
        catch { if(isCurrent())ctx.showToast(t('Link saved, but the view could not refresh. Reload to continue.'),'error'); }
      }
    } finally {
      dialogPending=false;
      if(isCurrent()) {
        const target=origin instanceof HTMLElement && origin.isConnected ? origin : elements.linkChangeRequestButton;
        if(document.activeElement===document.body || document.activeElement===elements.editorDialog) target?.focus({preventScroll:true});
      }
    }
  }
  return { add:()=>open(), remove:id=>{
    const reference=state.dialogTicket?.externalReferences?.find(item=>item.id===id);
    return reference ? open(reference) : Promise.resolve();
  } };
}
