chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "lookup-vocab",
    title: "Lookup in VocabVault",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "lookup-vocab") {
    chrome.runtime.sendMessage({ action: "lookupWord", word: info.selectionText.trim() });
  }
});
