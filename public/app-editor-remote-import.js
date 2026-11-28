import { t } from "./app-i18n.js";
const DEFAULT_REMOTE_PROVIDER_ORDER = ["github", "gitlab", "redmine"];

export function createEditorRemoteImportModule(ctx, options = {}) {
  const { state, elements } = ctx;
  let pendingPreviewRequestId = null;

  function syncSheet() {
    const open = state.editorRemoteImportOpen && state.dialogMode === "edit" && !state.editingTicketId;
    elements.editorDialog.classList.toggle("remote-import-open", open);
    elements.editorRemoteImportSheet.hidden = false;
    elements.editorRemoteImportSheet.inert = !open;
    elements.editorRemoteImportSheet.setAttribute("aria-hidden", String(!open));
    elements.editorForm.toggleAttribute("inert", open);
    elements.editorForm.setAttribute("aria-hidden", String(open));
    elements.remoteImportCreateButton.setAttribute("aria-pressed", String(open));
    if (!open) {
      state.editorRemoteImportPreviewRequestId = (state.editorRemoteImportPreviewRequestId ?? 0) + 1;
      elements.editorRemoteImportError.hidden = true;
      elements.editorRemoteImportError.textContent = "";
      clearPreview();
    }
  }

  function clearPreview() {
    state.editorRemoteImportPreview = null;
    elements.editorRemoteImportPreview.hidden = true;
    elements.editorRemoteImportPreview.innerHTML = "";
    syncActions();
  }

  function syncActions() {
    const hasPreview = Boolean(state.editorRemoteImportPreview);
    const hasDuplicate = Boolean(state.editorRemoteImportPreview?.duplicate);
    const hasProvider = hasEnabledProvider();
    const pending = pendingPreviewRequestId !== null && pendingPreviewRequestId === state.editorRemoteImportPreviewRequestId;
    elements.editorRemoteImportPreviewButton.disabled = !hasProvider || pending;
    elements.editorRemoteImportPreviewButton.textContent = t(pending ? "Loading..." : "Preview");
    elements.editorRemoteImportPreviewButton.setAttribute("aria-busy", String(pending));
    elements.editorRemoteImportSubmitButton.disabled = !hasProvider || !hasPreview || hasDuplicate || pending;
  }

  function syncProviderSwitch() {
    const provider = elements.editorRemoteProvider.value || "github";
    for (const option of elements.editorRemoteProviderOptions) {
      const optionProvider = option.dataset.remoteProviderOption || "";
      const availability = state.remoteProviderAvailability?.[optionProvider];
      const enabled = availability?.hasCredential ?? false;
      const selected = option.dataset.remoteProviderOption === provider;
      option.hidden = !enabled;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-checked", String(selected));
      option.tabIndex = enabled && selected ? 0 : -1;
      option.disabled = !enabled;
      option.setAttribute("aria-disabled", String(!enabled));
      option.classList.toggle("disabled", !enabled);
      option.title = optionProviderLabel(optionProvider);
    }
    syncProviderHelp();
  }

  function setProvider(provider) {
    if (!isProviderEnabled(provider)) {
      return;
    }
    if (elements.editorRemoteProvider.value !== provider) {
      state.editorRemoteImportPreviewRequestId = (state.editorRemoteImportPreviewRequestId ?? 0) + 1;
      clearPreview();
    }
    elements.editorRemoteProvider.value = provider;
    elements.editorRemoteUrl.placeholder = remoteUrlPlaceholder(provider);
    syncProviderSwitch();
  }

  function populateLaneOptions(defaultLaneId = null) {
    if (!state.boardDetail) {
      elements.editorRemoteLane.innerHTML = "";
      return;
    }
    const selectedLaneId = Number.isInteger(defaultLaneId) ? defaultLaneId : Number(elements.ticketLane.value || state.boardDetail.lanes[0]?.id);
    elements.editorRemoteLane.innerHTML = state.boardDetail.lanes
      .map((lane) => `<option value="${lane.id}" ${selectedLaneId === lane.id ? "selected" : ""}>${ctx.escapeHtml(lane.name)}</option>`)
      .join("");
  }

  function openSheet() {
    if (!hasEnabledProvider()) {
      return;
    }
    populateLaneOptions();
    setProvider(firstEnabledProvider());
    elements.editorRemoteUrl.value = "";
    elements.editorRemoteBacklinkComment.checked = false;
    elements.editorRemoteBacklinkUrl.value = "";
    syncBacklinkOptions();
    clearPreview();
    elements.editorRemoteImportError.hidden = true;
    elements.editorRemoteImportError.textContent = "";
    state.editorRemoteImportOpen = true;
    syncSheet();
    queueMicrotask(() => elements.editorRemoteUrl.focus());
  }

  function remoteUrlPlaceholder(provider) {
    switch (provider) {
      case "gitlab":
        return "https://gitlab.example.com/group/project/-/issues/123";
      case "redmine":
        return "https://redmine.example.com/issues/123";
      case "github":
      default:
        return "https://github.com/owner/repo/issues/123";
    }
  }

  function handleProviderClick(event) {
    const option = event.target.closest("[data-remote-provider-option]");
    if (!(option instanceof HTMLElement)) {
      return;
    }
    if (option.disabled) {
      return;
    }
    setProvider(option.dataset.remoteProviderOption || "github");
    option.focus({ preventScroll: true });
  }

  function closeSheet() {
    if (elements.editorRemoteImportCancelButton.disabled || elements.editorRemoteImportCloseButton.disabled) {
      return;
    }
    state.editorRemoteImportOpen = false;
    syncSheet();
    queueMicrotask(() => elements.remoteImportCreateButton.focus({ preventScroll: true }));
  }

  function getInput() {
    return {
      provider: elements.editorRemoteProvider.value.trim(),
      laneId: Number(elements.editorRemoteLane.value),
      url: elements.editorRemoteUrl.value.trim(),
      postBacklinkComment: elements.editorRemoteBacklinkComment.checked,
      backlinkUrl: elements.editorRemoteBacklinkUrl.value.trim() || undefined,
    };
  }

  function inputKey(input) {
    return `${input.provider}\n${input.laneId}\n${input.url}`;
  }

  function validateInput(input) {
    if (!input.provider || !Number.isInteger(input.laneId) || !input.url) {
      return t("Provider, lane, and issue URL are required");
    }
    if (!isProviderEnabled(input.provider)) {
      return t("{provider} requires a configured credential", { provider: optionProviderLabel(input.provider) });
    }
    return "";
  }

  function renderPreview(preview, input) {
    const stateLabel = preview.state || t("Unknown state");
    const existingRef = preview.existingTicketRef || `#${preview.existingTicketId}`;
    const duplicateText = preview.duplicate
      ? Number.isSafeInteger(preview.existingTicketId) && preview.existingTicketId > 0
        ? t("Already imported as {link}", { link: `<a href="/tickets/${preview.existingTicketId}" target="_blank" rel="noopener" title="${t("Open imported ticket in a new tab")}" aria-label="${ctx.escapeHtml(t("Open {ref} in a new tab", { ref: existingRef }))}">${ctx.escapeHtml(existingRef)}</a>` })
        : t("Already imported")
      : t("Ready to import");
    state.editorRemoteImportPreview = {
      ...preview,
      key: inputKey(input),
    };
    elements.editorRemoteImportPreview.hidden = false;
    elements.editorRemoteImportPreview.innerHTML = `
      <div class="editor-remote-import-preview-head">
        <span class="editor-remote-import-preview-ref">${ctx.escapeHtml(preview.displayRef)}</span>
        <span class="editor-remote-import-preview-state">${ctx.escapeHtml(stateLabel)}</span>
      </div>
      <div class="editor-remote-import-preview-title">${ctx.escapeHtml(preview.title)}</div>
      <div class="editor-remote-import-preview-meta${preview.duplicate ? " duplicate" : ""}">${duplicateText}</div>
    `;
    syncActions();
  }

  async function preview() {
    if (pendingPreviewRequestId !== null && pendingPreviewRequestId === state.editorRemoteImportPreviewRequestId) return;
    if (!state.activeBoardId) {
      return;
    }
    const input = getInput();
    const currentInputKey = inputKey(input);
    const validationError = validateInput(input);
    if (validationError) {
      elements.editorRemoteImportError.hidden = false;
      elements.editorRemoteImportError.textContent = validationError;
      return;
    }
    state.editorRemoteImportPreviewRequestId = (state.editorRemoteImportPreviewRequestId ?? 0) + 1;
    const requestId = state.editorRemoteImportPreviewRequestId;
    pendingPreviewRequestId = requestId;
    elements.editorRemoteImportError.hidden = true;
    elements.editorRemoteImportError.textContent = "";
    syncActions();
    try {
      const remotePreview = await ctx.sendJson(`/api/boards/${state.activeBoardId}/remote-import/preview`, {
        method: "POST",
        body: input,
      });
      if (requestId === state.editorRemoteImportPreviewRequestId && currentInputKey === inputKey(getInput())) {
        renderPreview(remotePreview, input);
      }
    } catch (error) {
      if (requestId === state.editorRemoteImportPreviewRequestId) {
        clearPreview();
        elements.editorRemoteImportError.hidden = false;
        elements.editorRemoteImportError.textContent = error.message;
      }
    } finally {
      if (pendingPreviewRequestId === requestId) pendingPreviewRequestId = null;
      syncActions();
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!state.activeBoardId) {
      return;
    }
    const input = getInput();
    const validationError = validateInput(input);
    if (validationError) {
      elements.editorRemoteImportError.hidden = false;
      elements.editorRemoteImportError.textContent = validationError;
      return;
    }
    if (!state.editorRemoteImportPreview || state.editorRemoteImportPreview.key !== inputKey(input)) {
      elements.editorRemoteImportError.hidden = false;
      elements.editorRemoteImportError.textContent = t("Preview the remote issue before importing");
      return;
    }
    if (state.editorRemoteImportPreview.duplicate) {
      elements.editorRemoteImportError.hidden = false;
      elements.editorRemoteImportError.textContent = t("This remote issue is already imported");
      return;
    }
    elements.editorRemoteImportSubmitButton.disabled = true;
    elements.editorRemoteImportPreviewButton.disabled = true;
    elements.editorRemoteImportCancelButton.disabled = true;
    elements.editorRemoteImportCloseButton.disabled = true;
    try {
      const ticket = await ctx.sendJson(`/api/boards/${state.activeBoardId}/remote-import`, {
        method: "POST",
        body: input,
      });
      state.editorRemoteImportOpen = false;
      clearPreview();
      syncSheet();
      await ctx.refreshBoardDetail();
      await options.openImportedTicket?.(ticket.id);
      ctx.showToast(t("Remote issue imported"));
    } catch (error) {
      elements.editorRemoteImportError.hidden = false;
      elements.editorRemoteImportError.textContent = error.message;
    } finally {
      syncActions();
      elements.editorRemoteImportCancelButton.disabled = false;
      elements.editorRemoteImportCloseButton.disabled = false;
    }
  }

  function handleInputChange() {
    state.editorRemoteImportPreviewRequestId = (state.editorRemoteImportPreviewRequestId ?? 0) + 1;
    clearPreview();
  }

  function handleBacklinkToggle() {
    syncBacklinkOptions();
  }

  function syncBacklinkOptions() {
    const enabled = elements.editorRemoteBacklinkComment.checked;
    elements.editorRemoteBacklinkUrlRow.hidden = !enabled;
    elements.editorRemoteBacklinkUrl.disabled = !enabled;
    if (!enabled) {
      elements.editorRemoteBacklinkUrl.value = "";
    }
  }

  function setProviderAvailability(remoteProviders) {
    state.remoteProviderAvailability = Object.fromEntries(
      (remoteProviders ?? []).map((provider) => [provider.id, provider]),
    );
    const nextProvider = isProviderEnabled(elements.editorRemoteProvider.value)
      ? elements.editorRemoteProvider.value
      : firstEnabledProvider();
    elements.editorRemoteProvider.value = nextProvider;
    elements.editorRemoteUrl.placeholder = remoteUrlPlaceholder(nextProvider);
    syncProviderSwitch();
    elements.remoteImportCreateButton.hidden =
      state.dialogMode !== "edit" || Boolean(state.editingTicketId) || !hasEnabledProvider();
  }

  function resetProvider() {
    setProvider(firstEnabledProvider());
    syncSheet();
  }

  function firstEnabledProvider() {
    return DEFAULT_REMOTE_PROVIDER_ORDER.find((provider) => isProviderEnabled(provider)) ?? DEFAULT_REMOTE_PROVIDER_ORDER[0];
  }

  function isProviderEnabled(provider) {
    return Boolean(state.remoteProviderAvailability?.[provider]?.hasCredential);
  }

  function hasEnabledProvider() {
    return DEFAULT_REMOTE_PROVIDER_ORDER.some((provider) => isProviderEnabled(provider));
  }

  function syncProviderHelp() {
    syncActions();
    elements.editorRemoteProviderHelp.hidden = true;
    elements.editorRemoteProviderHelp.textContent = "";
  }

  function optionProviderLabel(provider) {
    switch (provider) {
      case "gitlab":
        return "GitLab";
      case "redmine":
        return "Redmine";
      case "github":
      default:
        return "GitHub";
    }
  }

  return {
    closeSheet,
    handleBacklinkToggle,
    handleInputChange,
    handleProviderClick,
    hasEnabledProvider,
    openSheet,
    populateLaneOptions,
    preview,
    resetProvider,
    setProviderAvailability,
    submit,
    syncProviderSwitch,
    syncSheet,
  };
}
