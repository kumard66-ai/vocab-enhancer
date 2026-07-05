// background.js

// Allow users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lookup-vocab',
    title: 'Look up "%s" in Vocab Enhancer',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lookup-vocab' && info.selectionText) {
    const word = info.selectionText.trim();
    // Save to storage so side panel can read it when it opens
    chrome.storage.local.set({ pendingLookupWord: word }, () => {
      // Open the side panel
      chrome.sidePanel.open({ windowId: tab.windowId });
    });
  }
});
