import { STATE, saveStateToLocal, saveWords } from '../state.js';
import { showToast, formatDate, truncate } from '../utils.js';
import * as XLSX from 'xlsx';
import { searchWord, initAutocomplete, getSourceUrl, getSourceLabel } from '../api/dictionary.js';
import { saveImage, getImage, deleteImage } from '../services/imageStore.js';

// --- History ---
export function updateHistoryStats() {
    const count = STATE.words.length;
    const navCount = document.getElementById('navHistoryCount');
    if (navCount) navCount.textContent = count > 0 ? `(${count})` : '';

    const dataStr = localStorage.getItem('vocabWords') || '[]';
    const bytes = new Blob([dataStr]).size;
    let sizeStr;
    if (bytes < 1024) sizeStr = bytes + ' B';
    else if (bytes < 1024 * 1024) sizeStr = (bytes / 1024).toFixed(1) + ' KB';
    else sizeStr = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    const navMem = document.getElementById('navMemoryBadge');
    if (navMem) navMem.textContent = sizeStr;

    if (typeof populateFcRange === 'function') populateFcRange();
}

export function initHistory() {
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = document.getElementById('historyDateFrom');
    const dateTo = document.getElementById('historyDateTo');
    if (dateFrom && dateTo) {
        let oldestDate = today;
        if (STATE.words && STATE.words.length > 0) {
            const dates = STATE.words.map(w => new Date(w.dateAdded).getTime());
            const minTime = Math.min(...dates.filter(t => !isNaN(t)));
            if (minTime && isFinite(minTime)) {
                oldestDate = new Date(minTime).toISOString().split('T')[0];
            }
        }
        dateFrom.value = oldestDate;
        dateTo.value = today;
        dateFrom.addEventListener('change', renderHistory);
        dateTo.addEventListener('change', renderHistory);
    }

    const snoFrom = document.getElementById('historySnoFrom');
    const snoTo = document.getElementById('historySnoTo');
    if (snoFrom && snoTo) {
        snoFrom.addEventListener('input', renderHistory);
        snoTo.addEventListener('input', renderHistory);
    }

    document.getElementById('historySearch').addEventListener('input', renderHistory);
    document.getElementById('historyFilter').addEventListener('change', renderHistory);
    const masteryFilter = document.getElementById('historyMasteryFilter');
    if (masteryFilter) masteryFilter.addEventListener('change', renderHistory);
    document.getElementById('historyNoMeaningFilter').addEventListener('change', renderHistory);
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
    document.getElementById('importExcelFile').addEventListener('change', importExcel);
    const copyExcelBtn = document.getElementById('copyExcel');
    if (copyExcelBtn) copyExcelBtn.addEventListener('click', copyToExcel);

    initResizableColumns();

    // Edit Image Preview Logic
    const editImageInput = document.getElementById('editImageInput');
    if (editImageInput) {
        editImageInput.addEventListener('change', function(e) {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    const imgPreview = document.getElementById('editImagePreview');
                    if (imgPreview) {
                        imgPreview.src = evt.target.result;
                        imgPreview.style.display = 'block';
                    }
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    }

    document.getElementById('clearHistory').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all history?')) {
            STATE.words = [];
            saveWords();
            renderHistory();
            showToast('History cleared', 'success');
        }
    });

    // Default sort: latest first
    STATE.historySortCol = 'dateAdded';
    STATE.historySortDir = 'desc';

    // Column sorting
    document.querySelectorAll('#historyTable th[data-sort]').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (STATE.historySortCol === col) {
                STATE.historySortDir = STATE.historySortDir === 'asc' ? 'desc' : 'asc';
            } else {
                STATE.historySortCol = col;
                STATE.historySortDir = 'asc';
            }
            renderHistory();
        });
    });

    // Also add autocomplete to history search
    initAutocomplete(document.getElementById('historySearch'));

    // Expose functions to global scope for inline onclick handlers
    window.pronounceHistoryWord = pronounceHistoryWord;
    window.lookupHistoryWord = lookupHistoryWord;
    window.openEditModal = openEditModal;
    window.deleteWord = deleteWord;
    window.closeEditModal = closeEditModal;
    window.saveEditWord = saveEditWord;
    window.renderHistory = renderHistory;
}

function renderHistory() {
    const search = document.getElementById('historySearch').value.toLowerCase();
    const filter = document.getElementById('historyFilter').value;
    const masteryFilter = document.getElementById('historyMasteryFilter') ? document.getElementById('historyMasteryFilter').value : 'all';
    const dateFrom = document.getElementById('historyDateFrom')?.value;
    const dateTo = document.getElementById('historyDateTo')?.value;
    const tbody = document.getElementById('historyBody');
    const empty = document.getElementById('emptyHistory');
    const table = document.querySelector('.table-container');

    const noMeaningFilter = document.getElementById('historyNoMeaningFilter')?.checked;

    let filtered = STATE.words.filter(w => {
        const matchSearch = w.word.toLowerCase().includes(search) || (w.meaning || '').toLowerCase().includes(search);
        const matchFilter = filter === 'all' || w.partOfSpeech === filter;
        
        let matchMastery = true;
        const wMastery = w.mastery || 'new';
        if (masteryFilter === 'dont_know') matchMastery = (wMastery === 'new');
        else if (masteryFilter === 'somewhat') matchMastery = (wMastery === 'learning' || wMastery === 'familiar');
        else if (masteryFilter === 'well') matchMastery = (wMastery === 'mastered');
        
        let matchNoMeaning = true;
        if (noMeaningFilter) {
            matchNoMeaning = !w.meaning || w.meaning.trim() === '';
        }

        let matchDate = true;
        if (w.dateAdded) {
            const wordDate = w.dateAdded.split('T')[0];
            if (dateFrom && wordDate < dateFrom) matchDate = false;
            if (dateTo && wordDate > dateTo) matchDate = false;
        }

        return matchSearch && matchFilter && matchMastery && matchNoMeaning && matchDate;
    });

    // Sort
    const col = STATE.historySortCol || 'dateAdded';
    const dir = STATE.historySortDir || 'desc';
    filtered.sort((a, b) => {
        let va = a[col] || '', vb = b[col] || '';
        if (col === 'dateAdded') {
            va = new Date(va).getTime() || 0;
            vb = new Date(vb).getTime() || 0;
        } else {
            va = va.toString().toLowerCase();
            vb = vb.toString().toLowerCase();
        }
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    const snoFrom = parseInt(document.getElementById('historySnoFrom')?.value);
    const snoTo = parseInt(document.getElementById('historySnoTo')?.value);

    let sliced = filtered;
    let startIdx = 0;
    if (!isNaN(snoFrom) || !isNaN(snoTo)) {
        startIdx = !isNaN(snoFrom) ? Math.max(0, snoFrom - 1) : 0;
        const endIdx = !isNaN(snoTo) ? snoTo : filtered.length;
        sliced = filtered.slice(startIdx, endIdx);
    }

    // Save filtered to STATE for export
    STATE._currentFilteredHistory = sliced;
    STATE._historyStartIdx = startIdx;

    // Update sort indicators
    document.querySelectorAll('#historyTable th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === col) {
            th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    if (sliced.length === 0) {
        table.classList.add('hidden');
        empty.classList.remove('hidden');
        updateHistoryStats();
        return;
    }

    table.classList.remove('hidden');
    empty.classList.add('hidden');

    tbody.innerHTML = sliced.map((w, i) => `
        <tr>
            <td>${startIdx + i + 1}</td>
            <td><strong>${w.word}</strong></td>
            <td>
                <span>${w.phonetic || ''}</span>
                <button class="btn-icon btn-pronounce" onclick="pronounceHistoryWord('${w.word}', '${w.audio || ''}')" title="Listen">
                    <i class="fas fa-volume-up"></i>
                </button>
            </td>
            <td><span class="mastery-badge ${w.partOfSpeech}">${w.partOfSpeech}</span></td>
            <td>${(w.relatedTopics || []).join(', ') || '-'}</td>
            <td>${w.meaning}</td>
            <td><em>${w.aiMnemonic || '-'}</em></td>
            <td><em>${w.example || '-'}</em></td>
            <td>${(w.phrases || []).join(', ') || '-'}</td>
            <td>${(w.synonyms || []).join(', ') || '-'}</td>
            <td>${(w.antonyms || []).join(', ') || '-'}</td>
            <td>${w.sources && w.sources.length ? w.sources.map(s => `<a href="${getSourceUrl(s, w.word) || '#'}" target="_blank" class="source-link">${getSourceLabel(s)}</a>`).join(' ') : (w.source ? `<a href="${getSourceUrl(w.source, w.word) || '#'}" target="_blank" class="source-link">${getSourceLabel(w.source)}</a>` : '-')}</td>
            <td>${formatDate(w.dateAdded)}</td>
            <td>
                <button class="btn-icon" onclick="lookupHistoryWord('${w.word}')" title="Lookup">
                    <i class="fas fa-search"></i>
                </button>
                <button class="btn-icon" onclick="openEditModal(${w.id})" title="Edit" style="color:var(--primary)">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon" onclick="deleteWord(${w.id})" title="Delete" style="color:var(--danger)">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
    updateHistoryStats();
}

function pronounceHistoryWord(word, audioUrl) {
    if (audioUrl && audioUrl !== 'undefined' && audioUrl !== 'null' && audioUrl.length > 5) {
        const audio = new Audio(audioUrl);
        audio.play().catch(err => {
            console.warn('Audio play failed, falling back to synthesis:', err);
            fallbackSynthesis(word);
        });
    } else {
        fallbackSynthesis(word);
    }
}

function fallbackSynthesis(word) {
    if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(word);
        utter.lang = 'en-US';
        speechSynthesis.speak(utter);
    }
}

function lookupHistoryWord(word) {
    document.getElementById('wordInput').value = word;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('[data-section="lookup"]').classList.add('active');
    
    // Switch to lookup section via main.js global
    if (window.showSection) window.showSection('lookup');
    
    searchWord(word);
}

function deleteWord(id) {
    STATE.words = STATE.words.filter(w => w.id !== id);
    saveWords();
    renderHistory();
    showToast('Word removed', 'success');
}

function openEditModal(id) {
    const word = STATE.words.find(w => w.id === id);
    if (!word) return;
    STATE.editingWordId = id;
    document.getElementById('editWordTitle').textContent = word.word;
    document.getElementById('editPartOfSpeech').value = word.partOfSpeech || '';
    document.getElementById('editRelatedTopics').value = (word.relatedTopics || []).join(', ');
    document.getElementById('editMeaning').value = word.meaning || '';
    document.getElementById('editExample').value = word.example || '';
    document.getElementById('editPhrases').value = (word.phrases || []).join(', ');
    document.getElementById('editSynonyms').value = (word.synonyms || []).join(', ');
    document.getElementById('editAntonyms').value = (word.antonyms || []).join(', ');
    
    // Handle Image
    document.getElementById('editImageInput').value = '';
    const imgPreview = document.getElementById('editImagePreview');
    imgPreview.style.display = 'none';
    imgPreview.src = '';
    
    // Fetch from IndexedDB
    getImage(id).then(base64 => {
        if (base64) {
            imgPreview.src = base64;
            imgPreview.style.display = 'block';
        }
    }).catch(console.error);

    document.getElementById('editWordModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editWordModal').style.display = 'none';
    STATE.editingWordId = null;
}

function saveEditWord() {
    const word = STATE.words.find(w => w.id === STATE.editingWordId);
    if (!word) return;
    word.partOfSpeech = document.getElementById('editPartOfSpeech').value;
    word.relatedTopics = document.getElementById('editRelatedTopics').value.split(',').map(s => s.trim()).filter(Boolean);
    word.meaning = document.getElementById('editMeaning').value;
    word.example = document.getElementById('editExample').value;
    word.phrases = document.getElementById('editPhrases').value.split(',').map(s => s.trim()).filter(Boolean);
    word.synonyms = document.getElementById('editSynonyms').value.split(',').map(s => s.trim()).filter(Boolean);
    word.antonyms = document.getElementById('editAntonyms').value.split(',').map(s => s.trim()).filter(Boolean);
    
    // Handle new image upload
    const fileInput = document.getElementById('editImageInput');
    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            saveImage(word.id, e.target.result).then(() => {
                showToast('Image saved successfully', 'success');
                // Refresh current flashcard if visible
                if (window.renderHistory) renderHistory();
            });
        };
        reader.readAsDataURL(file);
    }

    saveWords();
    closeEditModal();
    renderHistory();
    showToast(`"${word.word}" updated!`, 'success');
}

function exportToExcel() {
    const list = STATE._currentFilteredHistory || STATE.words;
    if (list.length === 0) { showToast('No words to export', 'error'); return; }
    const data = list.map((w, i) => ({
        '#': (STATE._historyStartIdx || 0) + i + 1,
        'Word': w.word,
        'Phonetic': w.phonetic,
        'Part of Speech': w.partOfSpeech,
        'Related Topics': (w.relatedTopics || []).join(', '),
        'Meaning': w.meaning,
        'Example': w.example || '',
        'Phrases': (w.phrases || []).join(', '),
        'Synonyms': (w.synonyms || []).join(', '),
        'Antonyms': (w.antonyms || []).join(', '),
        'Source': w.source ? getSourceLabel(w.source) : '',
        'Date Added': formatDate(w.dateAdded)
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vocabulary');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `vocab_history_${dateStr}.xlsx`);
}

function copyToExcel() {
    const list = STATE._currentFilteredHistory || STATE.words;
    if (list.length === 0) { showToast('No words to copy', 'error'); return; }
    
    const headers = ['#', 'Word', 'Phonetic', 'Part of Speech', 'Related Topics', 'Meaning', 'Example', 'Phrases', 'Synonyms', 'Antonyms', 'Source', 'Date Added'];
    
    const rows = list.map((w, i) => {
        return [
            (STATE._historyStartIdx || 0) + i + 1,
            w.word,
            w.phonetic || '',
            w.partOfSpeech || '',
            (w.relatedTopics || []).join(', '),
            w.meaning || '',
            w.example || '',
            (w.phrases || []).join(', '),
            (w.synonyms || []).join(', '),
            (w.antonyms || []).join(', '),
            w.source ? getSourceLabel(w.source) : '',
            formatDate(w.dateAdded)
        ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join('\t');
    });

    const tsvData = [headers.join('\t'), ...rows].join('\n');
    
    navigator.clipboard.writeText(tsvData).then(() => {
        showToast('Copied to clipboard! You can paste in Excel.', 'success');
    }).catch(err => {
        console.error('Clipboard copy failed:', err);
        showToast('Failed to copy to clipboard', 'error');
    });
}

async function importExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        let importedCount = 0;
        let skippedCount = 0;
        
        // Assuming first column is Word, or try to find a header named "Word"
        let wordColIdx = 0;
        if (json.length > 0) {
            const headerRow = json[0].map(h => String(h || "").toLowerCase().trim());
            const foundIdx = headerRow.indexOf("word");
            if (foundIdx !== -1) {
                wordColIdx = foundIdx;
                json.shift(); // remove header
            }
        }
        
        for (const row of json) {
            if (!row || row.length === 0) continue;
            let word = String(row[wordColIdx] || "").trim();
            if (!word) continue;
            
            // Check if word already exists
            const exists = STATE.words.some(w => w.word.toLowerCase() === word.toLowerCase());
            if (!exists) {
                STATE.words.push({
                    id: Date.now() + Math.random(),
                    word: word,
                    meaning: "",
                    partOfSpeech: "",
                    example: "",
                    synonyms: [],
                    antonyms: [],
                    phrases: [],
                    relatedTopics: [],
                    dateAdded: new Date().toISOString(),
                    mastery: "learning"
                });
                importedCount++;
            } else {
                skippedCount++;
            }
        }
        
        if (importedCount > 0) {
            saveWords();
            renderHistory();
            showToast(`Imported ${importedCount} new words! (${skippedCount} skipped)`, "success");
        } else {
            showToast(`No new words found to import. (${skippedCount} skipped)`, "info");
        }
        
    } catch (err) {
        console.error("Excel import failed:", err);
        showToast("Failed to import Excel file", "error");
    }
    
    // Reset file input
    e.target.value = "";
}

function initResizableColumns() {
    const table = document.getElementById('historyTable');
    if (!table) return;
    const cols = table.querySelectorAll('th');
    
    // Load saved widths
    const savedWidths = JSON.parse(localStorage.getItem('fcTableWidths') || '{}');

    cols.forEach((col, index) => {
        // Apply saved width if exists
        if (savedWidths[index]) {
            col.style.width = savedWidths[index] + 'px';
        }

        // Don't add resizer to the last column (Actions) since it's sticky right
        if (index === cols.length - 1) return;

        // Create resizer div
        const resizer = document.createElement('div');
        resizer.classList.add('resizer');
        resizer.style.position = 'absolute';
        resizer.style.right = '0';
        resizer.style.top = '0';
        resizer.style.width = '5px';
        resizer.style.height = '100%';
        resizer.style.cursor = 'col-resize';
        resizer.style.userSelect = 'none';
        resizer.style.zIndex = '10';
        // Add a visible border on hover
        resizer.onmouseenter = () => resizer.style.background = 'var(--primary)';
        resizer.onmouseleave = () => resizer.style.background = 'transparent';
        
        col.style.position = 'relative'; 
        col.appendChild(resizer);

        let startX, startWidth;

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent sorting
            startX = e.pageX;
            startWidth = col.offsetWidth;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            
            // Add a class to body to prevent text selection during drag
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        function onMouseMove(e) {
            const newWidth = startWidth + (e.pageX - startX);
            // Minimum width of 30px
            if (newWidth > 30) {
                col.style.width = newWidth + 'px';
            }
        }

        function onMouseUp(e) {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Save all current widths
            const newWidths = {};
            table.querySelectorAll('th').forEach((th, i) => {
                newWidths[i] = th.offsetWidth;
            });
            localStorage.setItem('fcTableWidths', JSON.stringify(newWidths));
        }
    });
}
