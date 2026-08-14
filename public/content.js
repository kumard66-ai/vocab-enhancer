// Listen for double click
document.addEventListener('dblclick', (e) => {
    const selection = window.getSelection().toString().trim();
    // basic check to ensure it's a single word or short phrase
    if (selection && selection.length > 0 && selection.length < 50) {
        chrome.runtime.sendMessage({ action: "lookupWord", word: selection });
    }
});
