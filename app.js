// ===== VocabVault - Main Application =====

// --- State Management ---
const STATE = {
    words: JSON.parse(localStorage.getItem('vocabWords') || '[]'),
    streak: JSON.parse(localStorage.getItem('vocabStreak') || '{"count":0,"lastDate":""}'),
    theme: localStorage.getItem('vocabTheme') || 'light',
    currentFlashcards: [],
    currentFcIndex: 0,
    quizData: null,
};

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigation();
    initSearch();
    initHistory();
    initUpload();
    initFlashcards();
    initQuiz();
    initStats();
    loadWordOfTheDay();
    updateStreak();
});

// --- Theme ---
function initTheme() {
    document.documentElement.setAttribute('data-theme', STATE.theme);
    const btn = document.getElementById('themeToggle');
    updateThemeIcon();
    btn.addEventListener('click', () => {
        STATE.theme = STATE.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', STATE.theme);
        localStorage.setItem('vocabTheme', STATE.theme);
        updateThemeIcon();
    });
}

function updateThemeIcon() {
    const icon = document.querySelector('#themeToggle i');
    icon.className = STATE.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// --- Navigation ---
function initNavigation() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            showSection(section);
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'history') renderHistory();
    if (id === 'stats') renderStats();
}

// --- Word Lookup ---
function initSearch() {
    const input = document.getElementById('wordInput');
    const btn = document.getElementById('searchBtn');
    const openBtn = document.getElementById('openSourceBtn');

    btn.addEventListener('click', () => searchWord(input.value.trim()));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchWord(input.value.trim());
    });

    openBtn.addEventListener('click', openInSource);
    document.getElementById('saveWordBtn').addEventListener('click', saveCurrentWord);
    document.getElementById('pronounceBtn').addEventListener('click', pronounceWord);
}

async function searchWord(word) {
    if (!word) return;
    const resultDiv = document.getElementById('wordResult');
    resultDiv.classList.remove('hidden');
    document.getElementById('resultMeanings').innerHTML = '<p style="color:var(--text-muted)">Searching...</p>';

    try {
        const data = await fetchWordData(word);
        displayWordResult(data);
    } catch (err) {
        document.getElementById('resultMeanings').innerHTML =
            `<p style="color:var(--danger)">Word not found. Try a different spelling or source.</p>`;
        document.getElementById('resultWord').textContent = word;
        document.getElementById('resultPhonetic').textContent = '';
        document.getElementById('resultSynonyms').classList.add('hidden');
        document.getElementById('resultAntonyms').classList.add('hidden');
    }
}

async function fetchWordData(word) {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error('Not found');
    const data = await response.json();
    return data[0];
}

function displayWordResult(data) {
    document.getElementById('resultWord').textContent = data.word;
    document.getElementById('resultPhonetic').textContent = data.phonetic || (data.phonetics?.[0]?.text) || '';

    // Store audio URL
    const audioEntry = data.phonetics?.find(p => p.audio);
    document.getElementById('pronounceBtn').dataset.audio = audioEntry?.audio || '';

    // Meanings
    const meaningsDiv = document.getElementById('resultMeanings');
    let allSynonyms = [];
    let allAntonyms = [];
    let html = '';

    data.meanings.forEach(meaning => {
        html += `<div class="meaning-group">
            <h3>${meaning.partOfSpeech}</h3>`;
        meaning.definitions.slice(0, 3).forEach(def => {
            html += `<div class="definition-item">
                <p>${def.definition}</p>
                ${def.example ? `<p class="example">"${def.example}"</p>` : ''}
            </div>`;
        });
        html += `</div>`;
        allSynonyms.push(...(meaning.synonyms || []));
        allAntonyms.push(...(meaning.antonyms || []));
        meaning.definitions.forEach(d => {
            allSynonyms.push(...(d.synonyms || []));
            allAntonyms.push(...(d.antonyms || []));
        });
    });

    meaningsDiv.innerHTML = html;

    // Synonyms
    const synSection = document.getElementById('resultSynonyms');
    const synList = document.getElementById('synonymsList');
    allSynonyms = [...new Set(allSynonyms)].slice(0, 10);
    if (allSynonyms.length) {
        synSection.classList.remove('hidden');
        synList.innerHTML = allSynonyms.map(s => `<span class="tag" onclick="searchWord('${s}')">${s}</span>`).join('');
    } else {
        synSection.classList.add('hidden');
    }

    // Antonyms
    const antSection = document.getElementById('resultAntonyms');
    const antList = document.getElementById('antonymsList');
    allAntonyms = [...new Set(allAntonyms)].slice(0, 10);
    if (allAntonyms.length) {
        antSection.classList.remove('hidden');
        antList.innerHTML = allAntonyms.map(a => `<span class="tag" onclick="searchWord('${a}')">${a}</span>`).join('');
    } else {
        antSection.classList.add('hidden');
    }

    // Store current word data for saving
    STATE.currentWord = {
        word: data.word,
        phonetic: data.phonetic || data.phonetics?.[0]?.text || '',
        partOfSpeech: data.meanings[0]?.partOfSpeech || '',
        meaning: data.meanings[0]?.definitions[0]?.definition || '',
        example: data.meanings[0]?.definitions[0]?.example || '',
        synonyms: allSynonyms.slice(0, 5),
        antonyms: allAntonyms.slice(0, 5),
        audio: data.phonetics?.find(p => p.audio)?.audio || '',
        allMeanings: data.meanings,
    };
}

function pronounceWord() {
    const audioUrl = document.getElementById('pronounceBtn').dataset.audio;
    if (audioUrl) {
        new Audio(audioUrl).play();
    } else {
        const word = document.getElementById('resultWord').textContent;
        if ('speechSynthesis' in window) {
            const utter = new SpeechSynthesisUtterance(word);
            utter.lang = 'en-US';
            speechSynthesis.speak(utter);
        } else {
            showToast('Audio not available for this word', 'error');
        }
    }
}

function openInSource() {
    const word = document.getElementById('wordInput').value.trim();
    if (!word) return;
    const source = document.getElementById('sourceSelect').value;
    const urls = {
        free: `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
        vocabulary: `https://www.vocabulary.com/dictionary/${word}`,
        cambridge: `https://dictionary.cambridge.org/dictionary/english/${word}`,
        oxford: `https://www.oxfordlearnersdictionaries.com/definition/english/${word}`,
        merriam: `https://www.merriam-webster.com/dictionary/${word}`,
    };
    window.open(urls[source], '_blank');
}

function saveCurrentWord() {
    if (!STATE.currentWord) return;
    const existing = STATE.words.find(w => w.word.toLowerCase() === STATE.currentWord.word.toLowerCase());
    if (existing) {
        showToast('Word already in history!', 'error');
        return;
    }

    const entry = {
        ...STATE.currentWord,
        id: Date.now(),
        dateAdded: new Date().toISOString(),
        mastery: 'new',
        reviewCount: 0,
    };

    STATE.words.push(entry);
    saveWords();
    showToast(`"${entry.word}" saved to history!`, 'success');
}

// --- History ---
function initHistory() {
    document.getElementById('historySearch').addEventListener('input', renderHistory);
    document.getElementById('historyFilter').addEventListener('change', renderHistory);
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
    document.getElementById('exportCSV').addEventListener('click', exportToCSV);
    document.getElementById('clearHistory').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all history?')) {
            STATE.words = [];
            saveWords();
            renderHistory();
            showToast('History cleared', 'success');
        }
    });
}

function renderHistory() {
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

    if (filtered.length === 0) {
        table.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    table.classList.remove('hidden');
    empty.classList.add('hidden');

    tbody.innerHTML = filtered.map((w, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${w.word}</strong></td>
            <td><span class="mastery-badge ${w.partOfSpeech}">${w.partOfSpeech}</span></td>
            <td>${truncate(w.meaning, 60)}</td>
            <td><em>${truncate(w.example || '-', 50)}</em></td>
            <td>${formatDate(w.dateAdded)}</td>
            <td><span class="mastery-badge ${w.mastery}">${w.mastery}</span></td>
            <td>
                <button class="btn-icon" onclick="lookupHistoryWord('${w.word}')" title="Lookup">
                    <i class="fas fa-search"></i>
                </button>
                <button class="btn-icon" onclick="deleteWord(${w.id})" title="Delete" style="color:var(--danger)">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function lookupHistoryWord(word) {
    document.getElementById('wordInput').value = word;
    showSection('lookup');
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('[data-section="lookup"]').classList.add('active');
    searchWord(word);
}

function deleteWord(id) {
    STATE.words = STATE.words.filter(w => w.id !== id);
    saveWords();
    renderHistory();
    showToast('Word removed', 'success');
}

function exportToExcel() {
    if (STATE.words.length === 0) { showToast('No words to export', 'error'); return; }
    const data = STATE.words.map((w, i) => ({
        '#': i + 1,
        'Word': w.word,
        'Phonetic': w.phonetic,
        'Part of Speech': w.partOfSpeech,
        'Meaning': w.meaning,
        'Example': w.example || '',
        'Synonyms': (w.synonyms || []).join(', '),
        'Antonyms': (w.antonyms || []).join(', '),
        'Date Added': formatDate(w.dateAdded),
        'Mastery': w.mastery,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vocabulary');

    // Auto-width columns
    const colWidths = Object.keys(data[0]).map(key => ({
        wch: Math.max(key.length, ...data.map(row => String(row[key]).length)).toString().length + 2
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `VocabVault_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Excel file downloaded!', 'success');
}

function exportToCSV() {
    if (STATE.words.length === 0) { showToast('No words to export', 'error'); return; }
    const headers = ['#', 'Word', 'Phonetic', 'Part of Speech', 'Meaning', 'Example', 'Date Added', 'Mastery'];
    const rows = STATE.words.map((w, i) => [
        i + 1, w.word, w.phonetic, w.partOfSpeech,
        `"${w.meaning.replace(/"/g, '""')}"`,
        `"${(w.example || '').replace(/"/g, '""')}"`,
        formatDate(w.dateAdded), w.mastery
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csv, `VocabVault_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
    showToast('CSV file downloaded!', 'success');
}

// --- File Upload ---
function initUpload() {
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

// --- Flashcards ---
function initFlashcards() {
    document.getElementById('generateCards').addEventListener('click', generateFlashcards);
    document.getElementById('fcPrev').addEventListener('click', prevCard);
    document.getElementById('fcNext').addEventListener('click', nextCard);
    document.getElementById('flashcard').addEventListener('click', flipCard);

    document.querySelectorAll('.fc-rate').forEach(btn => {
        btn.addEventListener('click', (e) => rateCard(parseInt(btn.dataset.rating)));
    });
}

function generateFlashcards() {
    const from = parseInt(document.getElementById('fcFrom').value) || 1;
    const to = parseInt(document.getElementById('fcTo').value) || STATE.words.length;
    const shuffle = document.getElementById('shuffleCards').checked;

    if (STATE.words.length === 0) {
        showToast('No words in history! Add some words first.', 'error');
        return;
    }

    let cards = STATE.words.slice(from - 1, to);
    if (shuffle) cards = shuffleArray([...cards]);

    STATE.currentFlashcards = cards;
    STATE.currentFcIndex = 0;

    document.getElementById('flashcardArea').classList.remove('hidden');
    document.getElementById('fcEmpty').classList.add('hidden');
    document.getElementById('fcTotal').textContent = cards.length;

    showCard(0);
}

function showCard(index) {
    const card = STATE.currentFlashcards[index];
    if (!card) return;

    STATE.currentFcIndex = index;
    document.getElementById('fcWord').textContent = card.word;
    document.getElementById('fcPhonetic').textContent = card.phonetic || '';
    document.getElementById('fcPos').textContent = card.partOfSpeech;
    document.getElementById('fcMeaning').textContent = card.meaning;
    document.getElementById('fcExample').textContent = document.getElementById('showExample').checked ? (card.example || '') : '';
    document.getElementById('fcCurrent').textContent = index + 1;

    const progress = ((index + 1) / STATE.currentFlashcards.length) * 100;
    document.getElementById('fcProgressFill').style.width = progress + '%';

    // Reset flip
    document.getElementById('flashcard').classList.remove('flipped');
}

function flipCard() {
    document.getElementById('flashcard').classList.toggle('flipped');
}

function prevCard() {
    if (STATE.currentFcIndex > 0) showCard(STATE.currentFcIndex - 1);
}

function nextCard() {
    if (STATE.currentFcIndex < STATE.currentFlashcards.length - 1) {
        showCard(STATE.currentFcIndex + 1);
    } else {
        showToast('You\'ve reviewed all cards!', 'success');
    }
}

function rateCard(rating) {
    const card = STATE.currentFlashcards[STATE.currentFcIndex];
    const wordEntry = STATE.words.find(w => w.id === card.id);
    if (wordEntry) {
        wordEntry.reviewCount = (wordEntry.reviewCount || 0) + 1;
        if (rating === 3) wordEntry.mastery = wordEntry.reviewCount >= 3 ? 'mastered' : 'familiar';
        else if (rating === 2) wordEntry.mastery = 'learning';
        else wordEntry.mastery = 'new';
        saveWords();
    }
    nextCard();
}

// --- Quiz ---
function initQuiz() {
    document.getElementById('startQuiz').addEventListener('click', startQuiz);
    document.getElementById('retakeQuiz').addEventListener('click', () => {
        document.getElementById('quizResults').classList.add('hidden');
        document.getElementById('quizSetup').classList.remove('hidden');
    });
    document.getElementById('nextQuestion').addEventListener('click', showNextQuestion);
}

function startQuiz() {
    if (STATE.words.length < 4) {
        showToast('Need at least 4 words in history to start a quiz!', 'error');
        return;
    }

    const type = document.getElementById('quizType').value;
    const countStr = document.getElementById('quizCount').value;
    const difficulty = document.getElementById('quizDifficulty').value;
    const count = countStr === 'all' ? STATE.words.length : Math.min(parseInt(countStr), STATE.words.length);
    const optionsCount = difficulty === 'hard' ? 6 : 4;
    const timed = difficulty !== 'easy';

    const shuffled = shuffleArray([...STATE.words]);
    const questions = shuffled.slice(0, count).map(word => {
        const wrongOptions = shuffleArray(STATE.words.filter(w => w.id !== word.id)).slice(0, optionsCount - 1);
        let question, correctAnswer, options;

        if (type === 'meaning') {
            question = `What does "<strong>${word.word}</strong>" mean?`;
            correctAnswer = word.meaning;
            options = shuffleArray([
                { text: word.meaning, correct: true },
                ...wrongOptions.map(w => ({ text: w.meaning, correct: false }))
            ]);
        } else if (type === 'word') {
            question = `Which word means: "<em>${truncate(word.meaning, 80)}</em>"?`;
            correctAnswer = word.word;
            options = shuffleArray([
                { text: word.word, correct: true },
                ...wrongOptions.map(w => ({ text: w.word, correct: false }))
            ]);
        } else if (type === 'fill') {
            const example = word.example || `The word ${word.word} is used in everyday language.`;
            question = example.replace(new RegExp(word.word, 'gi'), '________');
            correctAnswer = word.word;
            options = shuffleArray([
                { text: word.word, correct: true },
                ...wrongOptions.map(w => ({ text: w.word, correct: false }))
            ]);
        } else {
            question = `Which word is a synonym/related to "<strong>${word.word}</strong>"?`;
            const synonymWord = word.synonyms?.[0] || word.meaning.split(' ').slice(0, 2).join(' ');
            correctAnswer = synonymWord;
            options = shuffleArray([
                { text: synonymWord, correct: true },
                ...wrongOptions.map(w => ({ text: w.word, correct: false }))
            ]);
        }

        return { word: word.word, question, correctAnswer, options, timed };
    });

    STATE.quizData = { questions, current: 0, score: 0, answers: [], timed, timePerQ: difficulty === 'hard' ? 10 : 15 };

    document.getElementById('quizSetup').classList.add('hidden');
    document.getElementById('quizArea').classList.remove('hidden');
    document.getElementById('quizResults').classList.add('hidden');
    document.getElementById('quizTotalQ').textContent = questions.length;
    document.getElementById('quizScore').textContent = '0';

    showQuestion(0);
}

function showQuestion(index) {
    const q = STATE.quizData.questions[index];
    STATE.quizData.current = index;

    document.getElementById('quizCurrentQ').textContent = index + 1;
    document.getElementById('quizQuestion').innerHTML = q.question;
    document.getElementById('nextQuestion').classList.add('hidden');

    const optionsGrid = document.getElementById('quizOptions');
    optionsGrid.innerHTML = q.options.map((opt, i) => `
        <div class="quiz-option" data-index="${i}" data-correct="${opt.correct}">
            ${truncate(opt.text, 60)}
        </div>
    `).join('');

    optionsGrid.querySelectorAll('.quiz-option').forEach(opt => {
        opt.addEventListener('click', () => selectAnswer(opt));
    });

    // Timer
    if (STATE.quizData.timed) {
        let timeLeft = STATE.quizData.timePerQ;
        document.getElementById('quizTimer').textContent = `${timeLeft}s`;
        STATE.quizData.timer = setInterval(() => {
            timeLeft--;
            document.getElementById('quizTimer').textContent = `${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(STATE.quizData.timer);
                autoSelectWrong();
            }
        }, 1000);
    }
}

function selectAnswer(optEl) {
    if (STATE.quizData.timer) clearInterval(STATE.quizData.timer);

    const allOpts = document.querySelectorAll('.quiz-option');
    allOpts.forEach(o => o.classList.add('disabled'));

    const isCorrect = optEl.dataset.correct === 'true';
    optEl.classList.add(isCorrect ? 'correct' : 'wrong');

    // Highlight correct answer
    allOpts.forEach(o => {
        if (o.dataset.correct === 'true') o.classList.add('correct');
    });

    if (isCorrect) {
        STATE.quizData.score++;
        document.getElementById('quizScore').textContent = STATE.quizData.score;
    }

    STATE.quizData.answers.push({
        word: STATE.quizData.questions[STATE.quizData.current].word,
        correct: isCorrect
    });

    if (STATE.quizData.current < STATE.quizData.questions.length - 1) {
        document.getElementById('nextQuestion').classList.remove('hidden');
    } else {
        setTimeout(showQuizResults, 1000);
    }
}

function autoSelectWrong() {
    const allOpts = document.querySelectorAll('.quiz-option');
    allOpts.forEach(o => {
        o.classList.add('disabled');
        if (o.dataset.correct === 'true') o.classList.add('correct');
    });

    STATE.quizData.answers.push({
        word: STATE.quizData.questions[STATE.quizData.current].word,
        correct: false
    });

    if (STATE.quizData.current < STATE.quizData.questions.length - 1) {
        document.getElementById('nextQuestion').classList.remove('hidden');
    } else {
        setTimeout(showQuizResults, 1000);
    }
}

function showNextQuestion() {
    showQuestion(STATE.quizData.current + 1);
}

function showQuizResults() {
    document.getElementById('quizArea').classList.add('hidden');
    document.getElementById('quizResults').classList.remove('hidden');

    const percent = Math.round((STATE.quizData.score / STATE.quizData.questions.length) * 100);
    document.getElementById('resultPercent').textContent = percent + '%';

    let message = '';
    if (percent >= 90) message = 'Excellent! You\'re a vocabulary master!';
    else if (percent >= 70) message = 'Great job! Keep practicing!';
    else if (percent >= 50) message = 'Good effort! Review the missed words.';
    else message = 'Keep studying! Practice makes perfect.';
    document.getElementById('resultMessage').textContent = message;

    const breakdown = document.getElementById('resultsBreakdown');
    breakdown.innerHTML = STATE.quizData.answers.map(a => `
        <div style="display:flex;align-items:center;gap:0.5rem;margin:0.25rem 0;">
            <i class="fas fa-${a.correct ? 'check' : 'times'}" style="color:${a.correct ? 'var(--success)' : 'var(--danger)'}"></i>
            <span>${a.word}</span>
        </div>
    `).join('');

    // Update mastery based on quiz results
    STATE.quizData.answers.forEach(a => {
        const word = STATE.words.find(w => w.word === a.word);
        if (word) {
            word.reviewCount = (word.reviewCount || 0) + 1;
            if (a.correct && word.reviewCount >= 3) word.mastery = 'mastered';
            else if (a.correct) word.mastery = 'familiar';
            else word.mastery = 'learning';
        }
    });
    saveWords();
}

// --- Stats ---
function initStats() {}

function renderStats() {
    // Summary stats
    document.getElementById('statTotal').textContent = STATE.words.length;

    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeek = STATE.words.filter(w => new Date(w.dateAdded) > weekAgo).length;
    document.getElementById('statWeek').textContent = thisWeek;

    const mastered = STATE.words.filter(w => w.mastery === 'mastered').length;
    document.getElementById('statMastered').textContent = mastered;
    document.getElementById('statStreak').textContent = STATE.streak.count;

    // Words over time chart
    renderWordsChart();
    renderPosChart();
    renderMasteryBars();
}

function renderWordsChart() {
    const canvas = document.getElementById('wordsChart');
    const ctx = canvas.getContext('2d');

    // Group by date
    const dateCounts = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dateCounts[d.toISOString().slice(0, 10)] = 0;
    }
    STATE.words.forEach(w => {
        const date = w.dateAdded.slice(0, 10);
        if (dateCounts.hasOwnProperty(date)) dateCounts[date]++;
    });

    if (window.wordsChartInstance) window.wordsChartInstance.destroy();
    window.wordsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(dateCounts).map(d => d.slice(5)),
            datasets: [{
                label: 'Words Added',
                data: Object.values(dateCounts),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: { ticks: { maxTicksLimit: 10 } }
            }
        }
    });
}

function renderPosChart() {
    const canvas = document.getElementById('posChart');
    const ctx = canvas.getContext('2d');

    const posCounts = {};
    STATE.words.forEach(w => {
        const pos = w.partOfSpeech || 'unknown';
        posCounts[pos] = (posCounts[pos] || 0) + 1;
    });

    if (window.posChartInstance) window.posChartInstance.destroy();
    window.posChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(posCounts),
            datasets: [{
                data: Object.values(posCounts),
                backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'],
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function renderMasteryBars() {
    const levels = { new: 0, learning: 0, familiar: 0, mastered: 0 };
    STATE.words.forEach(w => { levels[w.mastery || 'new']++; });
    const total = STATE.words.length || 1;

    const colors = { new: '#3b82f6', learning: '#f59e0b', familiar: '#10b981', mastered: '#6366f1' };
    const container = document.getElementById('masteryBars');
    container.innerHTML = Object.entries(levels).map(([level, count]) => `
        <div class="mastery-bar">
            <span class="label" style="text-transform:capitalize">${level}</span>
            <div class="bar">
                <div class="bar-fill" style="width:${(count/total)*100}%;background:${colors[level]}"></div>
            </div>
            <span class="count">${count}</span>
        </div>
    `).join('');
}

// --- Word of the Day ---
function loadWordOfTheDay() {
    const wotdWords = ['ephemeral', 'serendipity', 'ubiquitous', 'eloquent', 'resilient', 'pragmatic', 'meticulous', 'paradigm', 'conundrum', 'quintessential', 'juxtaposition', 'ameliorate', 'pernicious', 'surreptitious', 'magnanimous', 'perspicacious', 'obfuscate', 'sycophant', 'perfunctory', 'evanescent', 'ineffable', 'sagacious', 'mellifluous', 'insouciant', 'laconic', 'querulous', 'truculent', 'munificent', 'loquacious', 'capricious'];

    const dayIndex = Math.floor(Date.now() / 86400000) % wotdWords.length;
    const word = wotdWords[dayIndex];

    document.getElementById('wotdWord').textContent = word;
    document.getElementById('wotdMeaning').textContent = 'Click to discover its meaning...';

    document.getElementById('wotdLookup').addEventListener('click', () => {
        document.getElementById('wordInput').value = word;
        searchWord(word);
    });
}

// --- Streak ---
function updateStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (STATE.streak.lastDate === today) return;
    if (STATE.streak.lastDate === yesterday) {
        STATE.streak.count++;
    } else if (STATE.streak.lastDate !== today) {
        STATE.streak.count = 1;
    }
    STATE.streak.lastDate = today;
    localStorage.setItem('vocabStreak', JSON.stringify(STATE.streak));
}

// --- Utilities ---
function saveWords() {
    localStorage.setItem('vocabWords', JSON.stringify(STATE.words));
}

function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
}

function formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
