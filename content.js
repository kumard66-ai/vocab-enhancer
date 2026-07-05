// content.js

document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString().trim();
  
  // Only try to lookup if there's a reasonable single word or short phrase selected
  if (selectedText.length > 0 && selectedText.length < 50 && !selectedText.includes('\n')) {
    // We send a message to the extension. 
    // If the side panel is open, it will receive this and automatically look up the word.
    // If it's closed, this will just fail silently (which is expected).
    chrome.runtime.sendMessage({ 
      action: 'lookup_word', 
      word: selectedText 
    }).catch(() => {
      // Ignore errors (usually means side panel is not open to listen)
    });
  }
});
