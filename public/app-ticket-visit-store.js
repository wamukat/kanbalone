const databaseName = "kanbalone-previous-visit";
const storeName = "tickets";
const recordVersion = 1;

export function createTicketVisitStore() {
  let opening;
  function open() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "ticketId" });
        request.onerror = request.onblocked = () => reject(request.error ?? new Error("Storage unavailable"));
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            opening = undefined;
          };
          resolve(request.result);
        };
      }).catch(error => {
        opening = undefined;
        throw error;
      });
    }
    return opening;
  }

  return {
    async read(ticketId) {
      const db = await open();
      return transact(db, "readonly", (store, done) => {
        const request = store.get(ticketId);
        request.onsuccess = () => done(request.result);
      });
    },
    async save(ticketId, baseline, visit, allowRollback = false) {
      const db = await open();
      return transact(db, "readwrite", (store, done) => {
        const request = store.get(ticketId);
        request.onsuccess = () => {
          const stored = request.result;
          const sameObservation = stored?.visitId === baseline?.visitId && stored?.series === baseline?.series;
          if (stored?.series === visit.series) {
            // Each clock is monotonic within a series. Never let a slow tab
            // replace a newer endpoint, even if it enqueues its write last.
            if (compareVisitOrder(stored, visit) > 0 && !(allowRollback && sameObservation)) return done(false);
          } else if (stored && !sameObservation) {
            // The series changed while this tab loaded. Leave the other
            // tab's observation intact, especially when its server differs.
            return done(false);
          }
          store.put({ ...visit, ticketId, recordVersion });
          done(true);
        };
      });
    },
  };
}

function transact(db, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Storage unavailable"));
    run(tx.objectStore(storeName), value => { result = value; });
  });
}

export function compareVisitOrder(a, b) {
  return a.revision - b.revision || a.activityThrough - b.activityThrough;
}

export function isTicketVisit(value, ticketId) {
  const state = value?.state;
  const isRef = reference => Number.isSafeInteger(reference?.id) && typeof reference?.label === "string";
  return value?.recordVersion === recordVersion && value.ticketId === ticketId &&
    typeof value.series === "string" && Number.isSafeInteger(value.revision) &&
    Number.isSafeInteger(value.activityThrough) && Math.abs(value.seenAt) <= 8.64e15 &&
    typeof value.visitId === "string" && typeof value.stateFingerprint === "string" &&
    typeof state?.bodyMarkdown === "string" && typeof state.title === "string" &&
    isRef(state.board) && isRef(state.lane) && [state.group, state.parent].every(item => item === null || isRef(item)) &&
    [state.tags, state.children, state.blockers, state.blockedBy, state.related].every(items => Array.isArray(items) && items.every(isRef)) &&
    Array.isArray(state.comments) && state.comments.every(item => Number.isSafeInteger(item?.id) && typeof item?.bodyMarkdown === "string") &&
    Array.isArray(state.tasks) && state.tasks.every(item => Number.isSafeInteger(item?.number) && typeof item?.bodyMarkdown === "string");
}
