const fs = require('fs');
const content = fs.readFileSync('src/features/history.js', 'utf8');
const lines = content.split('\n');

const startIdx = lines.findIndex(l => l.startsWith('function renderHistory() {'));
const endIdx = lines.findIndex(l => l.startsWith('function lookupHistoryWord'));

if (startIdx !== -1 && endIdx !== -1) {
    const newFunc = `function renderHistory() {
    const search = document.getElementById('historySearch').value.toLowerCase();
    const filter = document.getElementById('historyFilter').value;
    const tbody = document.getElementById('historyBody');
    const empty = document.getElementById('emptyHistory');
    const table = document.querySelector('.table-container');

    let filtered = STATE.words.filter(w => {
        const matchSearch = w.word.toLowerCase().includes(search) || w.meaning.toLowerCase().includes(search);
        const matchFilter = filter === 'all' || w.partOfSpeech === filter;
        return matchSearch && matchFilter;
    });

    // Sort
    const col = STATE.historySortCol || 'dateAdded';
    const dir = STATE.historySortDir || 'desc';
    filtered.sort((a, b) => {
        let va = a[col] || '', vb = b[col] || '';
        if (col === 'dateAdded') {
            va = new Date(va).getTime() || 0;
            vb = new Date(vb).getTime() || 0;
        } else if (typeof va === 'string') {
            va = va.toLowerCase();
            vb = vb.toLowerCase();
        }
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Update sort indicators
    document.querySelectorAll('#historyTable th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === col) {
            th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    if (filtered.length === 0) {
        table.classList.add('hidden');
        empty.classList.remove('hidden');
        updateHistoryStats();
        return;
    }

    table.classList.remove('hidden');
    empty.classList.add('hidden');

    tbody.innerHTML = filtered.map((w, i) => \`
        <tr>
            <td>\${i + 1}</td>
            <td><strong>\${w.word}</strong></td>
            <td>
                <span class="phonetic-small">\${w.phonetic || ''}</span>
                <button class="btn-icon btn-pronounce" onclick="pronounceHistoryWord('\${w.word}', '\${w.audio || ''}')" title="Listen">
                    <i class="fas fa-volume-up"></i>
                </button>
            </td>
            <td><span class="mastery-badge \${w.partOfSpeech}">\${w.partOfSpeech}</span></td>
            <td class="td-tags">\${(w.relatedTopics || []).map(t => \\\`<span class="mini-tag topic-tag">\${t}</span>\\\`).join('') || '-'}</td>
            <td>\${w.meaning}</td>
            <td><em>\${w.aiMnemonic || '-'}</em></td>
            <td><em>\${w.example || '-'}</em></td>
            <td class="td-tags">\${(w.phrases || []).map(p => \\\`<span class="mini-tag phrase-tag">\${p}</span>\\\`).join('') || '-'}</td>
            <td class="td-tags">\${(w.synonyms || []).map(s => \\\`<span class="mini-tag syn-tag">\${s}</span>\\\`).join('') || '-'}</td>
            <td class="td-tags">\${(w.antonyms || []).map(a => \\\`<span class="mini-tag ant-tag">\${a}</span>\\\`).join('') || '-'}</td>
            <td>\${w.sources && w.sources.length ? w.sources.map(s => \\\`<a href="\${getSourceUrl(s, w.word) || '#'}" target="_blank" class="source-link">\${getSourceLabel(s)}</a>\\\`).join(' ') : (w.source ? \\\`<a href="\${getSourceUrl(w.source, w.word) || '#'}" target="_blank" class="source-link">\${getSourceLabel(w.source)}</a>\\\` : '-')}</td>
            <td>\${formatDate(w.dateAdded)}</td>
            <td><span class="mastery-badge \${w.mastery}">\${w.mastery}</span></td>
            <td>
                <button class="btn-icon" onclick="lookupHistoryWord('\${w.word}')" title="Lookup">
                    <i class="fas fa-search"></i>
                </button>
                <button class="btn-icon" onclick="openEditModal(\${w.id})" title="Edit" style="color:var(--primary)">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon" onclick="deleteWord(\${w.id})" title="Delete" style="color:var(--danger)">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    \`).join('');
    updateHistoryStats();
}

function pronounceHistoryWord(word, audioUrl) {
    if (audioUrl) {
        new Audio(audioUrl).play();
    } else if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(word);
        utter.lang = 'en-US';
        speechSynthesis.speak(utter);
    }
}
`;

    const newLines = [
        ...lines.slice(0, startIdx),
        newFunc,
        ...lines.slice(endIdx)
    ];

    fs.writeFileSync('src/features/history.js', newLines.join('\n'));
    console.log('Fixed renderHistory in history.js');
} else {
    console.log('Could not find renderHistory boundaries', startIdx, endIdx);
}
