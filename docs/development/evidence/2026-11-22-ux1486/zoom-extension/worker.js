chrome.tabs.onUpdated.addListener(async (id, change, tab) => {
 if (change.status === 'complete' && tab.url?.startsWith('http://127.0.0.1:3552/')) await chrome.tabs.setZoom(id, 2);
});
