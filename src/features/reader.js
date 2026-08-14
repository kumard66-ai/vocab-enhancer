
import { STATE, saveStateToLocal, saveWords } from '../state.js';
import { showToast, truncate } from '../utils.js';
import { searchWord } from '../api/dictionary.js';
import { saveToCloud } from '../services/firebase.js';

// --- File Upload ---
export function initUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) processFile(fileInput.files[0]);
    });

    document.getElementById('extractManualBtn').addEventListener('click', extractFromManualText);
    document.getElementById('lookupAllBtn').addEventListener('click', lookupAllExtracted);
    document.getElementById('saveAllBtn').addEventListener('click', saveAllExtracted);
    document.getElementById('bulkLookupBtn').addEventListener('click', bulkLookupWords);
    document.getElementById('bulkExportCSV').addEventListener('click', exportBulkResultsCSV);
    document.getElementById('bulkClearResults').addEventListener('click', clearBulkResults);
}

async function processFile(file) {
    const progress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    progress.classList.remove('hidden');
    progressFill.style.width = '20%';
    progressText.textContent = `Processing ${file.name}...`;

    try {
        let text = '';
        let highlightedWords = [];

        if (file.name.endsWith('.txt')) {
            text = await file.text();
            highlightedWords = extractHighlightedFromText(text);
        } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
            text = await file.text();
            highlightedWords = extractFromHTML(text);
        } else if (file.name.endsWith('.docx')) {
            progressText.textContent = 'Extracting from DOCX...';
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer });
            highlightedWords = extractFromHTML(result.value);
        } else if (file.name.endsWith('.pdf')) {
            progressText.textContent = 'Extracting from PDF...';
            highlightedWords = await extractFromPDF(file);
        } else {
            text = await file.text();
            highlightedWords = extractHighlightedFromText(text);
        }

        progressFill.style.width = '100%';
        progressText.textContent = `Found ${highlightedWords.length} highlighted words!`;

        if (highlightedWords.length === 0) {
            progressText.textContent = 'No highlighted/bold words found. Extracting uncommon words...';
            const allText = text || 'No extractable text';
            highlightedWords = extractUncommonWords(allText);
            progressText.textContent = `Found ${highlightedWords.length} potential vocabulary words.`;
        }

        displayExtractedWords(highlightedWords);

        setTimeout(() => progress.classList.add('hidden'), 2000);
    } catch (err) {
        progressText.textContent = `Error: ${err.message}`;
        progressFill.style.width = '0%';
    }
}

function extractHighlightedFromText(text) {
    const words = new Set();
    // **bold** or *italic* in markdown
    const boldMatches = text.match(/\*\*(.+?)\*\*/g) || [];
    boldMatches.forEach(m => words.add(m.replace(/\*\*/g, '').toLowerCase()));

    // ALL CAPS words (3+ letters, not common acronyms)
    const capsMatches = text.match(/\b[A-Z]{3,}\b/g) || [];
    const commonAcronyms = new Set(['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'DID', 'GET', 'HIM', 'LET', 'SAY', 'SHE', 'TOO', 'USE']);
    capsMatches.forEach(m => { if (!commonAcronyms.has(m)) words.add(m.toLowerCase()); });

    // Words between [brackets] or {braces}
    const bracketMatches = text.match(/[\[{](.+?)[\]}]/g) || [];
    bracketMatches.forEach(m => words.add(m.replace(/[\[\]{}]/g, '').toLowerCase()));

    return [...words].filter(w => w.length > 2);
}

function extractFromHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const words = new Set();

    // Bold, strong, mark, highlighted elements
    const selectors = 'b, strong, mark, em, .highlight, [style*="background"], [style*="font-weight: bold"], [style*="font-weight:bold"]';
    doc.querySelectorAll(selectors).forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 2 && text.length < 30 && !text.includes(' ')) {
            words.add(text.toLowerCase());
        } else if (text.includes(' ')) {
            text.split(/\s+/).forEach(w => {
                if (w.length > 2) words.add(w.toLowerCase().replace(/[^a-z]/g, ''));
            });
        }
    });

    return [...words].filter(w => w.length > 2);
}

async function extractFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let allText = '';

    for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        allText += pageText + ' ';
    }

    // PDFs lose formatting, so extract uncommon words
    return extractUncommonWords(allText);
}

function extractUncommonWords(text) {
    const commonWords = new Set(['the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what','so','up','out','if','about','who','get','which','go','me','when','make','can','like','time','no','just','him','know','take','people','into','year','your','good','some','could','them','see','other','than','then','now','look','only','come','its','over','think','also','back','after','use','two','how','our','work','first','well','way','even','new','want','because','any','these','give','day','most','us']);

    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const wordFreq = {};
    words.forEach(w => {
        if (!commonWords.has(w)) wordFreq[w] = (wordFreq[w] || 0) + 1;
    });

    // Return words that appear 1-3 times (likely vocabulary words, not common terms)
    return Object.entries(wordFreq)
        .filter(([_, count]) => count >= 1 && count <= 3)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 30)
        .map(([word]) => word);
}

function extractFromManualText() {
    const text = document.getElementById('manualText').value;
    if (!text.trim()) return;

    let words = extractHighlightedFromText(text);

    // Also extract from <mark> tags in the raw text
    const markMatches = text.match(/<mark>(.+?)<\/mark>/gi) || [];
    markMatches.forEach(m => {
        const w = m.replace(/<\/?mark>/gi, '').trim().toLowerCase();
        if (w.length > 2) words.push(w);
    });

    if (words.length === 0) {
        words = extractUncommonWords(text);
    }

    words = [...new Set(words)];
    displayExtractedWords(words);
}

function displayExtractedWords(words) {
    const container = document.getElementById('extractedWords');
    const list = document.getElementById('extractedList');
    const count = document.getElementById('extractedCount');

    container.classList.remove('hidden');
    count.textContent = words.length;
    STATE.extractedWords = words;

    list.innerHTML = words.map(w => `
        <span class="extracted-word" data-word="${w}">
            ${w}
            <i class="fas fa-times remove-word" onclick="removeExtractedWord(event, '${w}')"></i>
        </span>
    `).join('');

    // Click to look up
    list.querySelectorAll('.extracted-word').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-word')) return;
            const word = el.dataset.word;
            document.getElementById('wordInput').value = word;
            showSection('lookup');
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            document.querySelector('[data-section="lookup"]').classList.add('active');
            searchWord(word);
        });
    });
}

function removeExtractedWord(event, word) {
    event.stopPropagation();
    STATE.extractedWords = STATE.extractedWords.filter(w => w !== word);
    displayExtractedWords(STATE.extractedWords);
}

async function lookupAllExtracted() {
    if (!STATE.extractedWords?.length) return;
    showToast('Looking up all words... This may take a moment.', 'success');

    for (const word of STATE.extractedWords) {
        try {
            const data = await fetchWordData(word);
            const entry = {
                id: Date.now() + Math.random(),
                word: data.word,
                phonetic: data.phonetic || data.phonetics?.[0]?.text || '',
                partOfSpeech: data.meanings[0]?.partOfSpeech || '',
                meaning: data.meanings[0]?.definitions[0]?.definition || '',
                example: data.meanings[0]?.definitions[0]?.example || '',
                synonyms: [],
                antonyms: [],
                dateAdded: new Date().toISOString(),
                mastery: 'new',
                reviewCount: 0,
            };

            if (!STATE.words.find(w => w.word.toLowerCase() === entry.word.toLowerCase())) {
                STATE.words.push(entry);
            }
            await new Promise(r => setTimeout(r, 300)); // Rate limit
        } catch (e) {
            // Skip words not found
        }
    }

    saveWords();
    showToast(`Added words to history!`, 'success');
}

async function saveAllExtracted() {
    await lookupAllExtracted();
}

async function bulkLookupWords() {
    const text = document.getElementById('bulkWordList').value.trim();
    if (!text) { showToast('Please enter some words', 'error'); return; }

    const words = text.split(/[\n,]+/).map(w => w.trim()).filter(Boolean);
    if (!words.length) { showToast('No valid words found', 'error'); return; }

    const source = document.getElementById('bulkSourceSelect').value;
    const progressDiv = document.getElementById('bulkProgress');
    const progressFill = document.getElementById('bulkProgressFill');
    const progressText = document.getElementById('bulkProgressText');

    progressDiv.classList.remove('hidden');
    
    // Clear and show results container
    const resultsContainer = document.getElementById('bulkResultsContainer');
    const resultsList = document.getElementById('bulkResultsList');
    resultsContainer.classList.remove('hidden');
    resultsList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:1rem;">Starting lookup...</p>';
    
    STATE.lastBulkResults = [];
    let added = 0, failed = 0;

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const pct = Math.round(((i + 1) / words.length) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = `Looking up "${word}" (${i + 1}/${words.length})...`;

        try {
            let data = null;

            if (source !== 'free') {
                try {
                    data = await scrapeFromSource(source, word);
                } catch (e) {}
            }

            if (!data) {
                try {
                    data = await fetchWordDataFromAPI(word);
                    data._source = 'free';
                } catch (e) {}
            }

            if (data) {
                // Rich data extraction:
                let partsOfSpeechList = [];
                let meaningsList = [];
                let examplesList = [];
                let synonymsList = [];
                let antonymsList = [];

                if (data.meanings && data.meanings.length) {
                    data.meanings.forEach(m => {
                        const pos = m.partOfSpeech || '';
                        if (pos && !partsOfSpeechList.includes(pos)) {
                            partsOfSpeechList.push(pos);
                        }
                        if (m.definitions && m.definitions.length) {
                            m.definitions.forEach(d => {
                                meaningsList.push({ pos: pos, definition: d.definition, example: d.example || '' });
                                if (d.example) examplesList.push(d.example);
                                if (d.synonyms) synonymsList.push(...d.synonyms);
                                if (d.antonyms) antonymsList.push(...d.antonyms);
                            });
                        }
                        if (m.synonyms) synonymsList.push(...m.synonyms);
                        if (m.antonyms) antonymsList.push(...m.antonyms);
                    });
                }

                // Dedup synonyms and antonyms
                synonymsList = [...new Set(synonymsList)].filter(Boolean);
                antonymsList = [...new Set(antonymsList)].filter(Boolean);

                const entry = {
                    id: Date.now() + Math.random(),
                    word: data.word || word,
                    phonetic: data.phonetic || data.phonetics?.[0]?.text || '',
                    partOfSpeech: partsOfSpeechList.join(', ') || data.meanings?.[0]?.partOfSpeech || '',
                    meaning: meaningsList.map(m => (m.pos ? `(${m.pos}) ` : '') + m.definition).join(' • '),
                    example: examplesList.join(' • '),
                    synonyms: synonymsList,
                    antonyms: antonymsList,
                    phrases: [],
                    audio: data.phonetics?.find(p => p.audio)?.audio || '',
                    source: data._source || source,
                    sources: [data._source || source],
                    dateAdded: new Date().toISOString(),
                    mastery: 'new',
                    reviewCount: 0,
                    meaningsArray: meaningsList
                };

                if (!STATE.words.find(w => w.word.toLowerCase() === entry.word.toLowerCase())) {
                    STATE.words.push(entry);
                    added++;
                }
                
                STATE.lastBulkResults.push(entry);
            } else {
                failed++;
                STATE.lastBulkResults.push({
                    word: word,
                    failed: true
                });
            }

            // Dynamically render results so far
            renderBulkResultsUI();
            
            await new Promise(r => setTimeout(r, 350));
        } catch (e) {
            failed++;
            STATE.lastBulkResults.push({
                word: word,
                failed: true
            });
            renderBulkResultsUI();
        }
    }

    saveWords();
    renderHistory();
    progressText.textContent = `Done! Added ${added} words.${failed ? ` ${failed} not found.` : ''}`;
    progressFill.style.width = '100%';
    showToast(`Added ${added} words from ${getSourceLabel(source)}${failed ? `, ${failed} not found` : ''}`, 'success');
}

// --- PDF Dictionary ---
export function initPdfDictionary() {
    const fileInput = document.getElementById('pdfDictInput');
    fileInput.addEventListener('change', async () => {
        if (fileInput.files.length) {
            await indexPdfDictionary(fileInput.files[0]);
            fileInput.value = '';
        }
    });
    loadPdfDictSources();
    updatePdfRemoveBtn();
}

export function updatePdfRemoveBtn() {
    const btn = document.getElementById('removePdfBtn');
    const isPdf = document.getElementById('sourceSelect').value.startsWith('pdf_');
    if (isPdf) {
        btn.style.display = 'inline-flex';
        btn.classList.remove('hidden');
    } else {
        btn.style.display = 'none';
        btn.classList.add('hidden');
    }
}

function loadPdfDictSources() {
    const dicts = JSON.parse(localStorage.getItem('vocabPdfDicts') || '[]');
    const select = document.getElementById('sourceSelect');
    dicts.forEach(d => {
        if (!select.querySelector(`[value="${d.id}"]`)) {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = `📖 ${d.name}`;
            select.insertBefore(opt, select.querySelector('[value="custom"]'));
        }
    });
}

async function indexPdfDictionary(file) {
    showToast('Indexing PDF dictionary... This may take a moment.', 'success');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const name = file.name.replace('.pdf', '');
        const id = 'pdf_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();

        // Extract full text page by page, preserving structure
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i % 20 === 0) showToast(`Reading page ${i}/${totalPages}...`, 'success');
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();

            // Group text items by Y position (lines)
            const lines = [];
            let currentLine = '';
            let lastY = null;
            content.items.forEach(item => {
                const y = Math.round(item.transform[5]);
                if (lastY !== null && Math.abs(y - lastY) > 3) {
                    if (currentLine.trim()) lines.push(currentLine.trim());
                    currentLine = '';
                }
                currentLine += item.str;
                lastY = y;
            });
            if (currentLine.trim()) lines.push(currentLine.trim());
            pages.push(lines);
        }

        // Build dictionary entries: detect headwords and their content
        const entries = {};
        let currentWord = null;
        let currentContent = [];

        function saveCurrentEntry() {
            if (currentWord && currentContent.length > 0) {
                const key = currentWord.toLowerCase();
                if (!entries[key]) {
                    entries[key] = { word: currentWord, content: currentContent.join('\n') };
                } else {
                    entries[key].content += '\n\n' + currentContent.join('\n');
                }
            }
        }

        pages.forEach(lines => {
            lines.forEach(line => {
                // Detect headwords: lines that start with a bold/capitalized word
                // Common dictionary patterns: word alone on line, or word followed by pronunciation
                const headwordMatch = line.match(/^([a-zA-Z][-a-zA-Z']*)\s*(?:[/(\[]|$)/);
                const isShortLine = line.length < 40;
                const startsWithCap = /^[A-Z]/.test(line);
                const isAllWord = /^[a-zA-Z][-a-zA-Z']*$/.test(line.trim());

                // Headword detection: standalone word, or word followed by phonetic/POS
                if (isAllWord && line.trim().length >= 3 && line.trim().length <= 30) {
                    saveCurrentEntry();
                    currentWord = line.trim();
                    currentContent = [];
                } else if (headwordMatch && isShortLine && headwordMatch[1].length >= 3) {
                    saveCurrentEntry();
                    currentWord = headwordMatch[1];
                    currentContent = [line];
                } else if (currentWord) {
                    currentContent.push(line);
                }
            });
        });
        saveCurrentEntry();

        // Store in IndexedDB
        await savePdfDictToIDB(id, entries);

        // Save metadata
        const dicts = JSON.parse(localStorage.getItem('vocabPdfDicts') || '[]');
        dicts.push({ id, name, pages: totalPages, wordCount: Object.keys(entries).length, dateAdded: new Date().toISOString() });
        localStorage.setItem('vocabPdfDicts', JSON.stringify(dicts));

        // Add to dropdown
        const select = document.getElementById('sourceSelect');
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `📖 ${name}`;
        select.insertBefore(opt, select.querySelector('[value="custom"]'));
        select.value = id;
        updatePdfRemoveBtn();

        showToast(`"${name}" indexed! ${Object.keys(entries).length} entries from ${totalPages} pages.`, 'success');
    } catch (err) {
        showToast('Error indexing PDF: ' + err.message, 'error');
    }
}

function openPdfDictDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('VocabVaultPdfDicts', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('dicts')) {
                db.createObjectStore('dicts');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function savePdfDictToIDB(id, entries) {
    const db = await openPdfDictDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('dicts', 'readwrite');
        tx.objectStore('dicts').put(entries, id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function getPdfDictFromIDB(id) {
    const db = await openPdfDictDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('dicts', 'readonly');
        const req = tx.objectStore('dicts').get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function removePdfDictionary(id) {
    // Remove from IndexedDB
    try {
        const db = await openPdfDictDB();
        const tx = db.transaction('dicts', 'readwrite');
        tx.objectStore('dicts').delete(id);
    } catch (e) {}

    // Remove from localStorage
    const dicts = JSON.parse(localStorage.getItem('vocabPdfDicts') || '[]');
    const updated = dicts.filter(d => d.id !== id);
    localStorage.setItem('vocabPdfDicts', JSON.stringify(updated));

    // Remove from dropdown and reset
    const select = document.getElementById('sourceSelect');
    const opt = select.querySelector(`[value="${id}"]`);
    if (opt) opt.remove();
    select.value = 'free';
    updatePdfRemoveBtn();

    showToast('PDF dictionary removed', 'success');
}

export async function searchPdfDict(source, word) {
    const entries = await getPdfDictFromIDB(source);
    if (!entries) throw new Error('PDF dictionary not found');

    const key = word.toLowerCase();
    let entry = entries[key];

    // Try exact match first, then partial matches
    if (!entry) {
        // Try without trailing s/ed/ing
        const stems = [key.replace(/s$/, ''), key.replace(/ed$/, ''), key.replace(/ing$/, ''), key.replace(/ly$/, '')];
        for (const stem of stems) {
            if (entries[stem]) { entry = entries[stem]; break; }
        }
    }

    if (!entry || !entry.content) throw new Error('Word not found in PDF dictionary');

    // Parse the content into structured display
    const lines = entry.content.split('\n').filter(l => l.trim());
    const meanings = [];
    let currentDefs = [];

    lines.forEach(line => {
        // Detect numbered definitions or new sections
        const numberedMatch = line.match(/^\s*(\d+)[.)]\s*(.*)/);
        const posMatch = line.match(/^\s*(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection)[.,;\s]/i);

        if (posMatch) {
            if (currentDefs.length) {
                meanings.push({ partOfSpeech: '', definitions: currentDefs });
                currentDefs = [];
            }
            meanings.push({ partOfSpeech: posMatch[1], definitions: [{ definition: line, example: '' }] });
        } else if (numberedMatch) {
            currentDefs.push({ definition: numberedMatch[2] || line, example: '' });
        } else {
            currentDefs.push({ definition: line, example: '' });
        }
    });

    if (currentDefs.length) {
        meanings.push({ partOfSpeech: meanings.length ? '' : `"${entry.word}"`, definitions: currentDefs });
    }

    if (meanings.length === 0) {
        meanings.push({ partOfSpeech: `"${entry.word}"`, definitions: [{ definition: entry.content, example: '' }] });
    }

    return buildStandardResult(entry.word, '', '', meanings, [], [], []);
}

// --- Reader Module ---
export function initReader() {
    STATE.readerZoom = 100;
    STATE.readerSessionWords = [];

    // Tab switching
    document.querySelectorAll('.reader-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.reader-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.readerTab;
            document.getElementById('readerFilePanel').classList.toggle('hidden', tabName !== 'file');
            document.getElementById('readerUrlPanel').classList.toggle('hidden', tabName !== 'url');
            document.getElementById('readerPastePanel').classList.toggle('hidden', tabName !== 'paste');
        });
    });

    // File open
    const dropZone = document.getElementById('readerDropZone');
    const fileInput = document.getElementById('readerFileInput');
    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName === 'LABEL' || e.target.closest('label')) return;
        fileInput.click();
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) openReaderFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) openReaderFile(fileInput.files[0]);
        fileInput.value = '';
    });

    // URL load
    document.getElementById('readerLoadUrl').addEventListener('click', loadReaderUrl);
    document.getElementById('readerUrlInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadReaderUrl();
    });

    // Paste text
    document.getElementById('readerLoadPaste').addEventListener('click', loadReaderPaste);

    // Zoom
    document.getElementById('readerZoomIn').addEventListener('click', () => readerZoom(10));
    document.getElementById('readerZoomOut').addEventListener('click', () => readerZoom(-10));

    // Fullscreen
    document.getElementById('readerFullscreen').addEventListener('click', () => {
        const content = document.getElementById('readerContent');
        if (content.requestFullscreen) content.requestFullscreen();
    });

    // Close
    document.getElementById('readerClose').addEventListener('click', closeReader);

    // Popup buttons
    document.getElementById('popupClose').addEventListener('click', hideReaderPopup);
    document.getElementById('popupLookupFull').addEventListener('click', popupFullLookup);
    document.getElementById('popupSave').addEventListener('click', popupSaveWord);
    document.getElementById('popupPronounce').addEventListener('click', popupPronounce);
    document.getElementById('popupRelookup').addEventListener('click', () => {
        if (STATE._popupCurrentWord) performPopupLookup(STATE._popupCurrentWord);
    });
    document.getElementById('popupSourceSelect').addEventListener('change', () => {
        if (STATE._popupCurrentWord) performPopupLookup(STATE._popupCurrentWord);
    });

    // Floating lookup box for PDF mode
    document.getElementById('readerLookupBtn').addEventListener('click', readerLookupFromBox);
    document.getElementById('readerLookupInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') readerLookupFromBox();
    });

    // Extract text panel
    document.getElementById('readerExtractText').addEventListener('click', extractPdfTextPanel);
    document.getElementById('readerTextPanelClose').addEventListener('click', () => {
        document.getElementById('readerTextPanel').classList.add('hidden');
        document.querySelector('.reader-split-view').classList.remove('has-text-panel');
    });
    document.getElementById('textPanelPageSelect').addEventListener('change', (e) => {
        const pageEl = document.getElementById('pdf-text-page-' + e.target.value);
        const scrollContainer = document.getElementById('readerTextContent');
        if (pageEl && scrollContainer) {
            scrollContainer.scrollTop = pageEl.offsetTop - scrollContainer.offsetTop;
        }
    });

    // Double-click and text selection on text panel for lookup
    document.getElementById('readerTextContent').addEventListener('dblclick', handleReaderDblClick);
    document.getElementById('readerTextContent').addEventListener('mouseup', handleReaderSelection);

    // Save all from sidebar
    document.getElementById('readerSaveAll').addEventListener('click', readerSaveAllSession);

    // Double-click and text selection to lookup word in reader
    document.getElementById('readerBody').addEventListener('dblclick', handleReaderDblClick);
    document.getElementById('readerBody').addEventListener('mouseup', handleReaderSelection);

    // Close popup when clicking outside
    document.addEventListener('mousedown', (e) => {
        const popup = document.getElementById('readerPopup');
        if (!popup.classList.contains('hidden') && !popup.contains(e.target)) {
            hideReaderPopup();
        }
    });

    // Make popup draggable
    const dragHandle = document.getElementById('popupDragHandle');
    const popup = document.getElementById('readerPopup');
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;

    dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragOffsetX = e.clientX - popup.offsetLeft;
        dragOffsetY = e.clientY - popup.offsetTop;
        popup.style.animation = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        popup.style.left = (e.clientX - dragOffsetX) + 'px';
        popup.style.top = (e.clientY - dragOffsetY) + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

async function openReaderFile(file) {
    const readerBody = document.getElementById('readerBody');
    const readerContent = document.getElementById('readerContent');
    const iframeContainer = document.getElementById('readerIframe');

    iframeContainer.classList.add('hidden');
    readerBody.classList.remove('hidden');

    try {
        if (file.name.endsWith('.pdf')) {
            const PDF_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
            if (file.size <= PDF_SIZE_LIMIT) {
                // Small PDF: render as text in reader body (double-click works)
                await renderPdfEmbedded(file, readerBody);
                document.getElementById('readerLookupBox').classList.add('hidden');
                document.getElementById('readerExtractText').classList.add('hidden');
            } else {
                // Large PDF: use native browser viewer
                const blobUrl = URL.createObjectURL(file);
                readerBody.classList.add('hidden');
                iframeContainer.classList.remove('hidden');
                const iframe = document.getElementById('readerFrame');
                iframe.src = blobUrl;
                document.getElementById('readerLookupBox').classList.remove('hidden');
                // Show extract text button and store file reference
                document.getElementById('readerExtractText').classList.remove('hidden');
                STATE.readerPdfFile = file;
            }
        } else {
            let html = '';
            if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
                const text = await file.text();
                html = text.split('\n').map(line => `<p>${escapeHtml(line) || '&nbsp;'}</p>`).join('');
            } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
                html = await file.text();
            } else if (file.name.endsWith('.docx')) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer });
                html = result.value;
            } else {
                const text = await file.text();
                html = `<pre>${escapeHtml(text)}</pre>`;
            }
            readerBody.innerHTML = html;
            document.getElementById('readerLookupBox').classList.add('hidden');
        }

        document.getElementById('readerDocTitle').innerHTML = `<i class="fas fa-file"></i> ${file.name}`;
        readerContent.classList.remove('hidden');
        hideReaderInputPanels();
        STATE.readerSessionWords = [];
        updateReaderSidebar();
    } catch (err) {
        showToast('Error opening file: ' + err.message, 'error');
    }
}

async function extractPdfTextPanel() {
    const file = STATE.readerPdfFile;
    if (!file) return;
    const textPanel = document.getElementById('readerTextPanel');
    const textContent = document.getElementById('readerTextContent');
    const pageSelect = document.getElementById('textPanelPageSelect');
    const splitView = document.querySelector('.reader-split-view');

    textContent.innerHTML = '<p style="color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Extracting text...</p>';
    pageSelect.innerHTML = '';
    textPanel.classList.remove('hidden');
    splitView.classList.add('has-text-panel');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let html = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            let pageHtml = '';
            let lastY = null;

            content.items.forEach(item => {
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                    pageHtml += '<br>';
                }
                pageHtml += escapeHtml(item.str) + ' ';
                lastY = item.transform[5];
            });

            html += `<div class="pdf-page-text" id="pdf-text-page-${i}"><strong style="color:var(--text-muted);font-size:0.75rem">— Page ${i} —</strong><br>${pageHtml}</div>`;
            if (i < pdf.numPages) html += '<hr class="pdf-page-divider">';

            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Page ${i}`;
            pageSelect.appendChild(opt);
        }

        textContent.innerHTML = html;
    } catch (err) {
        textContent.innerHTML = `<p style="color:var(--danger)">Failed to extract text: ${err.message}</p>`;
    }
}

async function renderPdfEmbedded(file, container) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let html = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let pageHtml = '';
        let lastY = null;

        content.items.forEach(item => {
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                pageHtml += '<br>';
            }
            pageHtml += escapeHtml(item.str) + ' ';
            lastY = item.transform[5];
        });

        html += `<div class="pdf-page-text">${pageHtml}</div>`;
        if (i < pdf.numPages) html += '<hr class="pdf-page-divider">';
    }

    container.innerHTML = html;
}

async function loadReaderUrl() {
    const url = document.getElementById('readerUrlInput').value.trim();
    if (!url) return;

    // Validate URL
    let validUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        validUrl = 'https://' + url;
    }

    const readerContent = document.getElementById('readerContent');
    const readerBody = document.getElementById('readerBody');
    const iframeContainer = document.getElementById('readerIframe');

    iframeContainer.classList.add('hidden');
    readerBody.classList.remove('hidden');
    readerBody.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:3rem"><i class="fas fa-spinner fa-spin"></i> Loading page content...</p>';
    readerContent.classList.remove('hidden');
    hideReaderInputPanels();
    document.getElementById('readerDocTitle').innerHTML = `<i class="fas fa-globe"></i> ${validUrl}`;
    STATE.readerSessionWords = [];
    updateReaderSidebar();

    const html = await fetchUrlContent(validUrl);
    if (html) {
        readerBody.innerHTML = html;
    } else {
        readerBody.innerHTML = `
            <div style="text-align:center;padding:3rem;color:var(--text-secondary)">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem;color:var(--warning);margin-bottom:1rem"></i>
                <h3>Could not load this page</h3>
                <p>The website may be blocking external access.</p>
                <p style="margin-top:1rem"><strong>Try these alternatives:</strong></p>
                <ul style="list-style:none;margin-top:0.75rem">
                    <li>Wikipedia articles, blog posts, news articles work best</li>
                    <li>Or copy the text and use "Paste Text" tab instead</li>
                </ul>
                <a href="${validUrl}" target="_blank" class="btn btn-primary" style="margin-top:1.5rem">
                    <i class="fas fa-external-link-alt"></i> Open in new tab & copy text
                </a>
            </div>`;
    }
}

async function fetchUrlContent(url) {
    // Try multiple CORS proxies with longer timeout for full page loads
    const proxies = [
        (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    ];

    for (const proxyFn of proxies) {
        try {
            const proxyUrl = proxyFn(url);
            const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) continue;

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/pdf') || contentType.includes('image/')) continue;

            const rawHtml = await response.text();
            if (rawHtml.length < 100) continue;

            const cleanHtml = extractReadableContent(rawHtml, url);
            if (cleanHtml) return cleanHtml;
        } catch (e) {
            continue;
        }
    }

    return null;
}

function extractReadableContent(rawHtml, sourceUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Remove scripts, styles, nav, footer, ads, etc
    const removeSelectors = 'script, style, nav, footer, header, aside, .sidebar, .ad, .ads, .advertisement, .nav, .menu, .footer, .header, iframe, noscript, svg, [role="navigation"], [role="banner"], [role="complementary"]';
    doc.querySelectorAll(removeSelectors).forEach(el => el.remove());

    // Try to find main content area
    const contentSelectors = ['article', '[role="main"]', 'main', '.post-content', '.article-content', '.entry-content', '.content', '#content', '#main', '.post', '.article'];
    let contentEl = null;

    for (const sel of contentSelectors) {
        contentEl = doc.querySelector(sel);
        if (contentEl && contentEl.textContent.trim().length > 200) break;
        contentEl = null;
    }

    // Fallback to body
    if (!contentEl) contentEl = doc.body;
    if (!contentEl) return null;

    // Extract clean text with structure
    let html = '';
    const title = doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || '';
    if (title) html += `<h1>${escapeHtml(title)}</h1>`;

    const leafTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'FIGCAPTION', 'TD', 'TH', 'DT', 'DD', 'CAPTION', 'SUMMARY', 'LABEL']);
    const containerTags = new Set(['DIV', 'SECTION', 'ARTICLE', 'SPAN', 'MAIN', 'FIGURE', 'DETAILS', 'HGROUP', 'ADDRESS', 'FOOTER', 'HEADER', 'NAV', 'ASIDE', 'FORM', 'FIELDSET', 'DIALOG', 'TEMPLATE', 'SLOT']);

    function walkNodes(el) {
        let result = '';
        for (const child of el.children) {
            const tag = child.tagName;
            const text = child.textContent.trim();
            if (!text) continue;

            if (tag === 'IMG') {
                const alt = child.getAttribute('alt');
                if (alt) result += `<p><em>[Image: ${escapeHtml(alt)}]</em></p>`;
            } else if (leafTags.has(tag)) {
                result += `<${tag.toLowerCase()}>${text}</${tag.toLowerCase()}>`;
            } else if (tag === 'UL' || tag === 'OL') {
                result += `<${tag.toLowerCase()}>`;
                child.querySelectorAll('li').forEach(li => {
                    const liText = li.textContent.trim();
                    if (liText) result += `<li>${liText}</li>`;
                });
                result += `</${tag.toLowerCase()}>`;
            } else if (tag === 'TABLE') {
                result += '<table>';
                child.querySelectorAll('tr').forEach(tr => {
                    result += '<tr>';
                    tr.querySelectorAll('td, th').forEach(cell => {
                        const cellTag = cell.tagName.toLowerCase();
                        result += `<${cellTag}>${cell.textContent.trim()}</${cellTag}>`;
                    });
                    result += '</tr>';
                });
                result += '</table>';
            } else if (containerTags.has(tag)) {
                result += walkNodes(child);
            } else {
                // For any unknown wrapper element, recurse into it
                if (child.children.length > 0) {
                    result += walkNodes(child);
                } else if (text.length > 1) {
                    result += `<p>${text}</p>`;
                }
            }
        }
        return result;
    }

    html += walkNodes(contentEl);

    // Check if we got meaningful content
    const textOnly = html.replace(/<[^>]*>/g, '').trim();
    if (textOnly.length < 50) return null;

    return html;
}

function loadReaderPaste() {
    const text = document.getElementById('readerPasteText').value.trim();
    if (!text) return;

    const readerBody = document.getElementById('readerBody');
    const readerContent = document.getElementById('readerContent');
    const iframeContainer = document.getElementById('readerIframe');

    iframeContainer.classList.add('hidden');
    readerBody.classList.remove('hidden');

    readerBody.innerHTML = text.split('\n').map(line => `<p>${escapeHtml(line) || '&nbsp;'}</p>`).join('');
    document.getElementById('readerDocTitle').innerHTML = `<i class="fas fa-paste"></i> Pasted Text`;
    readerContent.classList.remove('hidden');
    hideReaderInputPanels();
    STATE.readerSessionWords = [];
    updateReaderSidebar();
}

function closeReader() {
    document.getElementById('readerContent').classList.add('hidden');
    document.getElementById('readerSidebar').classList.add('hidden');
    document.getElementById('readerFilePanel').classList.remove('hidden');
    document.getElementById('readerLookupBox').classList.add('hidden');
    document.getElementById('readerExtractText').classList.add('hidden');
    document.getElementById('readerTextPanel').classList.add('hidden');
    document.querySelector('.reader-split-view').classList.remove('has-text-panel');
    const iframe = document.getElementById('readerFrame');
    if (iframe.src && iframe.src.startsWith('blob:')) {
        URL.revokeObjectURL(iframe.src);
        iframe.src = '';
    }
    document.getElementById('readerIframe').classList.add('hidden');
    document.getElementById('readerBody').classList.remove('hidden');
    STATE.readerPdfFile = null;
    hideReaderPopup();
}

function hideReaderInputPanels() {
    document.getElementById('readerFilePanel').classList.add('hidden');
    document.getElementById('readerUrlPanel').classList.add('hidden');
    document.getElementById('readerPastePanel').classList.add('hidden');
}

function readerZoom(delta) {
    STATE.readerZoom = Math.max(60, Math.min(200, STATE.readerZoom + delta));
    document.getElementById('readerZoomLevel').textContent = STATE.readerZoom + '%';
    document.getElementById('readerBody').style.fontSize = (STATE.readerZoom / 100) + 'rem';
}

// --- Reader Selection & Popup ---
function handleReaderDblClick(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText || selectedText.includes(' ') || selectedText.length < 2 || selectedText.length > 30) {
        return;
    }

    const word = selectedText.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (word.length < 2) return;

    showReaderPopup(word, e.clientX, e.clientY);
}

function handleReaderSelection(e) {
    // Skip if it was a double-click (handled by dblclick)
    if (e.detail >= 2) return;

    setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (!selectedText || selectedText.includes(' ') || selectedText.length < 2 || selectedText.length > 30) {
            return;
        }

        const word = selectedText.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
        if (word.length < 2) return;

        showReaderPopup(word, e.clientX, e.clientY);
    }, 200);
}

async function showReaderPopup(word, x, y) {
    const popup = document.getElementById('readerPopup');
    const loading = document.getElementById('popupLoading');
    const result = document.getElementById('popupResult');

    // Position popup
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    let left = x + 10;
    let top = y + 10;
    if (left + 450 > viewW) left = x - 440;
    if (top + 350 > viewH) top = y - 360;
    popup.style.left = Math.max(10, left) + 'px';
    popup.style.top = Math.max(10, top) + 'px';

    document.getElementById('popupWord').textContent = word;
    loading.classList.remove('hidden');
    result.classList.add('hidden');
    popup.classList.remove('hidden');

    STATE.readerPopupWord = null;
    STATE._popupCurrentWord = word;

    await performPopupLookup(word);
}

async function performPopupLookup(word) {
    const loading = document.getElementById('popupLoading');
    const result = document.getElementById('popupResult');
    const source = document.getElementById('popupSourceSelect').value;

    loading.classList.remove('hidden');
    result.classList.add('hidden');

    let data = null;

    try {
        if (source !== 'free') {
            try {
                data = await scrapeFromSource(source, word);
            } catch (e) {}
        }
        if (!data) {
            data = await fetchWordDataFromAPI(word);
        }

        const phonetic = data.phonetic || data.phonetics?.[0]?.text || '';
        const audio = data.phonetics?.find(p => p.audio)?.audio || '';
        const pos = data.meanings[0]?.partOfSpeech || '';

        const allSyns = [];
        const allAnts = [];
        const allPhrases = [];
        data.meanings.forEach(m => {
            m.definitions.forEach(d => {
                (d.synonyms || []).forEach(s => { if (!allSyns.includes(s)) allSyns.push(s); });
                (d.antonyms || []).forEach(a => { if (!allAnts.includes(a)) allAnts.push(a); });
            });
            (m.synonyms || []).forEach(s => { if (!allSyns.includes(s)) allSyns.push(s); });
            (m.antonyms || []).forEach(a => { if (!allAnts.includes(a)) allAnts.push(a); });
        });
        if (data._phrases) allPhrases.push(...data._phrases);

        const relatedTopics = data._relatedTopics || [];

        STATE.readerPopupWord = {
            word: data.word || word,
            phonetic,
            partOfSpeech: pos,
            meaning: data.meanings[0]?.definitions[0]?.definition || '',
            example: data.meanings[0]?.definitions[0]?.example || '',
            synonyms: allSyns,
            antonyms: allAnts,
            phrases: allPhrases,
            relatedTopics,
            audio,
        };

        document.getElementById('popupPos').textContent = pos;
        document.getElementById('popupPhonetic').textContent = phonetic;

        // Render meanings
        let meaningsHtml = '';
        data.meanings.forEach(m => {
            m.definitions.slice(0, 3).forEach(d => {
                meaningsHtml += `<div class="popup-def"><span class="popup-def-pos">${m.partOfSpeech}</span> ${d.definition}`;
                if (d.example) meaningsHtml += `<div class="popup-def-example">"${d.example}"</div>`;
                meaningsHtml += `</div>`;
            });
        });
        document.getElementById('popupMeanings').innerHTML = meaningsHtml;

        // Synonyms
        const synSection = document.getElementById('popupSynSection');
        if (allSyns.length) {
            synSection.classList.remove('hidden');
            document.getElementById('popupSynonyms').innerHTML = allSyns.slice(0, 8).map(s => `<span class="mini-tag syn-tag">${s}</span>`).join('');
        } else synSection.classList.add('hidden');

        // Antonyms
        const antSection = document.getElementById('popupAntSection');
        if (allAnts.length) {
            antSection.classList.remove('hidden');
            document.getElementById('popupAntonyms').innerHTML = allAnts.slice(0, 8).map(a => `<span class="mini-tag ant-tag">${a}</span>`).join('');
        } else antSection.classList.add('hidden');

        // Phrases
        const phraseSection = document.getElementById('popupPhraseSection');
        if (allPhrases.length) {
            phraseSection.classList.remove('hidden');
            document.getElementById('popupPhrases').innerHTML = allPhrases.slice(0, 6).map(p => `<span class="mini-tag phrase-tag">${p}</span>`).join('');
        } else phraseSection.classList.add('hidden');

        // Related Topics
        const topicSection = document.getElementById('popupTopicSection');
        if (relatedTopics.length) {
            topicSection.classList.remove('hidden');
            document.getElementById('popupTopics').innerHTML = relatedTopics.map(t => `<span class="mini-tag topic-tag">${t}</span>`).join('');
        } else topicSection.classList.add('hidden');

        loading.classList.add('hidden');
        result.classList.remove('hidden');
    } catch (err) {
        loading.classList.add('hidden');
        result.classList.remove('hidden');
        document.getElementById('popupPos').textContent = '';
        document.getElementById('popupPhonetic').textContent = '';
        document.getElementById('popupMeanings').innerHTML = '<div class="popup-def" style="color:var(--danger)">Word not found in dictionary.</div>';
        document.getElementById('popupSynSection').classList.add('hidden');
        document.getElementById('popupAntSection').classList.add('hidden');
        document.getElementById('popupPhraseSection').classList.add('hidden');
        document.getElementById('popupTopicSection').classList.add('hidden');
    }
}

function hideReaderPopup() {
    document.getElementById('readerPopup').classList.add('hidden');
}

function readerLookupFromBox() {
    const input = document.getElementById('readerLookupInput');
    const word = input.value.trim().toLowerCase().replace(/[^a-z'-]/g, '');
    if (!word || word.length < 2) return;
    const box = document.getElementById('readerLookupBox');
    const rect = box.getBoundingClientRect();
    showReaderPopup(word, rect.left, rect.bottom + 5);
}

function popupFullLookup() {
    const word = document.getElementById('popupWord').textContent;
    hideReaderPopup();
    document.getElementById('wordInput').value = word;
    showSection('lookup');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('[data-section="lookup"]').classList.add('active');
    searchWord(word);
}

function popupSaveWord() {
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

    showToast(`"${entry.word}" saved!`, 'success');
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
    list.innerHTML = STATE.readerSessionWords.map(w => `
        <div class="session-word-item">
            <span class="word">${w.word}</span>
            <span class="meaning">${w.meaning ? w.meaning.substring(0, 25) + '...' : ''}</span>
        </div>
    `).join('');
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
    showToast(`${added} words saved to history!`, 'success');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderBulkResultsUI() {
    const listDiv = document.getElementById('bulkResultsList');
    listDiv.innerHTML = '';
    
    if (!STATE.lastBulkResults || STATE.lastBulkResults.length === 0) {
        listDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No results to display.</p>';
        return;
    }

    STATE.lastBulkResults.forEach(entry => {
        const card = document.createElement('div');
        card.className = `bulk-result-card ${entry.failed ? 'failed-card' : 'success-card'}`;
        
        if (entry.failed) {
            card.innerHTML = `
                <div class="bulk-card-header">
                    <div class="bulk-card-title">
                        <h5 style="margin:0;font-size:1.2rem;font-weight:600;color:var(--text);text-transform:capitalize;">${entry.word}</h5>
                    </div>
                    <span class="badge" style="background:var(--danger-light);color:var(--danger);font-size:0.75rem;padding:0.2rem 0.5rem;border-radius:var(--radius-sm);font-weight:600;">Not Found</span>
                </div>
                <div class="bulk-card-body" style="margin-top:0.5rem;">
                    <p class="bulk-card-meaning" style="color:var(--danger);margin:0;">Could not retrieve definition for this word from any selected source.</p>
                </div>
                <div class="bulk-card-footer" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border);font-size:0.8rem;">
                    <div class="bulk-card-links" style="display:flex;gap:0.75rem;">
                        <a href="https://www.vocabulary.com/dictionary/${encodeURIComponent(entry.word)}" target="_blank" class="bulk-card-link" style="color:var(--primary);text-decoration:none;display:flex;align-items:center;gap:0.25rem;font-weight:500;"><i class="fas fa-external-link-alt"></i> Vocabulary.com</a>
                        <a href="https://www.ldoceonline.com/dictionary/${encodeURIComponent(entry.word)}" target="_blank" class="bulk-card-link" style="color:var(--primary);text-decoration:none;display:flex;align-items:center;gap:0.25rem;font-weight:500;"><i class="fas fa-external-link-alt"></i> Longman</a>
                    </div>
                </div>
            `;
        } else {
            // Group meanings by POS for clean presentation
            let meaningsHtml = '';
            if (entry.meaningsArray && entry.meaningsArray.length) {
                // Group by pos
                const grouped = {};
                entry.meaningsArray.forEach(m => {
                    const posLabel = m.pos || 'general';
                    if (!grouped[posLabel]) grouped[posLabel] = [];
                    grouped[posLabel].push(m);
                });

                Object.keys(grouped).forEach(pos => {
                    meaningsHtml += `
                        <div class="bulk-card-meaning-group" style="margin-bottom:0.75rem;">
                            ${pos !== 'general' ? `<span class="bulk-card-pos" style="display:inline-block;padding:0.15rem 0.4rem;font-size:0.75rem;font-weight:600;background:rgba(99,102,241,0.15);color:var(--primary);border-radius:var(--radius-sm);margin-right:0.5rem;text-transform:uppercase;">${pos}</span>` : ''}
                            <ol style="margin: 0.25rem 0 0.5rem 1.25rem; padding: 0; font-size: 0.95rem; color:var(--text);">
                                ${grouped[pos].map(m => `
                                    <li style="margin-bottom: 0.35rem; line-height: 1.4;">
                                        <span class="bulk-card-meaning">${m.definition}</span>
                                        ${m.example ? `<div class="bulk-card-example" style="font-size:0.85rem;font-style:italic;color:var(--text-secondary);margin-top:0.25rem;padding-left:1rem;border-left:2px solid var(--border);">${m.example}</div>` : ''}
                                    </li>
                                `).join('')}
                            </ol>
                        </div>
                    `;
                });
            } else {
                meaningsHtml = `
                    <div class="bulk-card-meaning-group" style="margin-bottom:0.75rem;">
                        ${entry.partOfSpeech ? `<span class="bulk-card-pos" style="display:inline-block;padding:0.15rem 0.4rem;font-size:0.75rem;font-weight:600;background:rgba(99,102,241,0.15);color:var(--primary);border-radius:var(--radius-sm);margin-right:0.5rem;text-transform:uppercase;">${entry.partOfSpeech}</span>` : ''}
                        <span class="bulk-card-meaning" style="font-size:0.95rem;color:var(--text);line-height:1.4;">${entry.meaning}</span>
                        ${entry.example ? `<div class="bulk-card-example" style="font-size:0.85rem;font-style:italic;color:var(--text-secondary);margin-top:0.25rem;padding-left:1rem;border-left:2px solid var(--border);">${entry.example}</div>` : ''}
                    </div>
                `;
            }

            const audioUrl = entry.audio || '';
            const escapedWord = entry.word.replace(/'/g, "\\'");
            const playBtn = `
                <button class="btn-icon" onclick="window.playBulkAudio('${audioUrl}', '${escapedWord}')" title="Listen to pronunciation" style="background:none;border:none;color:var(--primary);cursor:pointer;padding:0.2rem;font-size:0.95rem;display:flex;align-items:center;justify-content:center;transition:var(--transition);">
                    <i class="fas fa-volume-up"></i>
                </button>
            `;

            card.innerHTML = `
                <div class="bulk-card-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
                    <div class="bulk-card-title" style="display:flex;align-items:center;gap:0.5rem;">
                        <h5 style="margin:0;font-size:1.2rem;font-weight:600;color:var(--text);text-transform:capitalize;">${entry.word}</h5>
                        ${entry.phonetic ? `<span class="phonetic" style="font-family:'Inter',sans-serif;color:var(--text-muted);font-size:0.9rem;">/${entry.phonetic}/</span>` : ''}
                        ${playBtn}
                    </div>
                    <span class="badge" style="background:var(--success-light);color:var(--success);font-size:0.75rem;padding:0.2rem 0.5rem;border-radius:var(--radius-sm);font-weight:600;">Found</span>
                </div>
                <div class="bulk-card-body" style="margin-bottom:0.75rem;">
                    ${meaningsHtml}
                    ${entry.synonyms && entry.synonyms.length ? `
                        <div style="margin-top: 0.5rem; font-size: 0.85rem; color:var(--text-secondary);">
                            <strong>Synonyms:</strong> ${entry.synonyms.slice(0, 5).join(', ')}
                        </div>
                    ` : ''}
                </div>
                <div class="bulk-card-footer" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border);font-size:0.8rem;">
                    <div class="bulk-card-links" style="display:flex;gap:0.75rem;">
                        <a href="https://www.vocabulary.com/dictionary/${encodeURIComponent(entry.word)}" target="_blank" class="bulk-card-link" style="color:var(--primary);text-decoration:none;display:flex;align-items:center;gap:0.25rem;font-weight:500;"><i class="fas fa-external-link-alt"></i> Vocabulary.com</a>
                        <a href="https://www.ldoceonline.com/dictionary/${encodeURIComponent(entry.word)}" target="_blank" class="bulk-card-link" style="color:var(--primary);text-decoration:none;display:flex;align-items:center;gap:0.25rem;font-weight:500;"><i class="fas fa-external-link-alt"></i> Longman</a>
                    </div>
                    <div class="bulk-card-source" style="color:var(--text-muted);">Source: <strong>${getSourceLabel(entry.source)}</strong></div>
                </div>
            `;
        }
        listDiv.appendChild(card);
    });
}

function exportBulkResultsCSV() {
    if (!STATE.lastBulkResults || STATE.lastBulkResults.length === 0) {
        showToast('No results to export!', 'error');
        return;
    }
    const headers = ['Word', 'Phonetic', 'Part of Speech', 'Meaning', 'Examples', 'Synonyms', 'Antonyms', 'Source', 'Status'];
    const rows = STATE.lastBulkResults.map(entry => [
        `"${(entry.word || '').replace(/"/g, '""')}"`,
        `"${(entry.phonetic || '').replace(/"/g, '""')}"`,
        `"${(entry.partOfSpeech || '').replace(/"/g, '""')}"`,
        `"${(entry.meaning || '').replace(/"/g, '""')}"`,
        `"${(entry.example || '').replace(/"/g, '""')}"`,
        `"${(entry.synonyms || []).join(', ').replace(/"/g, '""')}"`,
        `"${(entry.antonyms || []).join(', ').replace(/"/g, '""')}"`,
        `"${(entry.source || '').replace(/"/g, '""')}"`,
        `"${entry.failed ? 'Failed' : 'Success'}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csv, `VocabVault_BulkLookup_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    showToast('Bulk results CSV downloaded!', 'success');
}

function clearBulkResults() {
    STATE.lastBulkResults = [];
    document.getElementById('bulkResultsContainer').classList.add('hidden');
    document.getElementById('bulkResultsList').innerHTML = '';
    document.getElementById('bulkWordList').value = '';
    showToast('Bulk lookup results cleared!', 'success');
}

// Global player function for bulk cards
window.playBulkAudio = function(url, word) {
    if (url) {
        new Audio(url).play().catch(() => {
            // fallback to TTS if audio url is invalid/fails to load
            ttsPronounce(word);
        });
    } else {
        ttsPronounce(word);
    }
};

function ttsPronounce(word) {
    if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(word);
        utter.lang = 'en-US';
        speechSynthesis.speak(utter);
    } else {
        showToast('Audio not available for this word', 'error');
    }
}
