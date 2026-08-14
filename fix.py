
import sys

content = open('src/features/reader.js', 'r', encoding='utf-8').read()

start_idx = content.find('function popupSaveWord() {')
end_idx = content.find('function renderBulkResultsUI() {')

if start_idx == -1 or end_idx == -1:
    print('Failed to find markers')
    sys.exit(1)

new_block = '''function popupSaveWord() {
    if (!STATE.readerPopupWord) {
        showToast('No word data to save', 'error');
        return;
    }

    const existing = STATE.words.find(w => w.word.toLowerCase() === STATE.readerPopupWord.word.toLowerCase());
    if (existing) {
        showToast('Word already in history!', 'error');
        return;
    }

    const popupSource = document.getElementById('popupSourceSelect').value;
    const entry = {
        ...STATE.readerPopupWord,
        source: popupSource,
        sources: [popupSource],
        id: Date.now(),
        dateAdded: new Date().toISOString(),
        mastery: 'new',
        reviewCount: 0,
    };

    STATE.words.push(entry);
    saveWords();

    // Add to session sidebar
    STATE.readerSessionWords.push(entry);
    updateReaderSidebar();

    showToast(\x22\x22 saved!, 'success');
    hideReaderPopup();
}

function popupPronounce() {
    const word = document.getElementById('popupWord').textContent;
    if (window.playAudio) {
        window.playAudio(STATE.readerPopupWord?.audio, word);
    } else if (STATE.readerPopupWord?.audio) {
        new Audio(STATE.readerPopupWord.audio).play().catch(() => {});
    } else if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(word);
        utter.lang = 'en-US';
        speechSynthesis.speak(utter);
    }
}

function updateReaderSidebar() {
    const sidebar = document.getElementById('readerSidebar');
    const list = document.getElementById('readerSessionWords');

    if (STATE.readerSessionWords.length === 0) {
        sidebar.classList.add('hidden');
        return;
    }

    sidebar.classList.remove('hidden');
    list.innerHTML = STATE.readerSessionWords.map(w => 
        <div class=\x22session-word-item\x22>
            <span class=\x22word\x22></span>
            <span class=\x22meaning\x22></span>
        </div>
    ).join('');
}

function readerSaveAllSession() {
    let added = 0;
    STATE.readerSessionWords.forEach(w => {
        if (!STATE.words.find(existing => existing.word.toLowerCase() === w.word.toLowerCase())) {
            STATE.words.push(w);
            added++;
        }
    });
    saveWords();
    showToast(${added} words saved to history!, 'success');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

'''

new_content = content[:start_idx] + new_block + content[end_idx:]

with open('src/features/reader.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done')

