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
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    initTheme();
    initNavigation();
    initAuth();
    initSearch();
    initHistory();
    initReader();
    initUpload();
    initFlashcards();
    initQuiz();
    initStats();
    initPdfDictionary();
    loadWordOfTheDay();
    updateStreak();
    updateHistoryStats();
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

// --- Auth & Cloud Sync ---
function initAuth() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    loginBtn.addEventListener('click', signInWithGoogle);
    logoutBtn.addEventListener('click', signOut);

    // Listen to auth state
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(handleAuthChange);
    }
}

async function signInWithGoogle() {
    try {
        await auth.signInWithPopup(googleProvider);
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            showToast('Sign-in failed: ' + err.message, 'error');
        }
    }
}

async function signOut() {
    try {
        await auth.signOut();
        showToast('Signed out. Using local storage only.', 'success');
    } catch (err) {
        showToast('Sign-out failed', 'error');
    }
}

function handleAuthChange(user) {
    const loginBtn = document.getElementById('loginBtn');
    const profile = document.getElementById('userProfile');

    if (user) {
        loginBtn.classList.add('hidden');
        profile.classList.remove('hidden');
        document.getElementById('userAvatar').src = user.photoURL || '';
        document.getElementById('userName').textContent = user.displayName?.split(' ')[0] || 'User';
        STATE.userId = user.uid;
        loadFromCloud();
    } else {
        loginBtn.classList.remove('hidden');
        profile.classList.add('hidden');
        STATE.userId = null;
    }
}

async function loadFromCloud() {
    if (!STATE.userId) return;
    setSyncStatus('syncing');

    try {
        const doc = await db.collection('users').doc(STATE.userId).get();
        if (doc.exists) {
            const cloudData = doc.data();
            const cloudWords = cloudData.words || [];
            const cloudStreak = cloudData.streak || STATE.streak;

            // Merge: cloud + local, deduplicate by word
            const merged = mergeWordLists(STATE.words, cloudWords);
            STATE.words = merged;
            STATE.streak = cloudStreak;
            localStorage.setItem('vocabWords', JSON.stringify(STATE.words));
            localStorage.setItem('vocabStreak', JSON.stringify(STATE.streak));

            showToast(`Synced ${STATE.words.length} words from cloud`, 'success');
        } else {
            // First time: push local data to cloud
            await saveToCloud();
            showToast('Local data uploaded to cloud', 'success');
        }
        setSyncStatus('synced');
    } catch (err) {
        setSyncStatus('offline');
        console.error('Cloud sync error:', err.code, err.message);
        if (err.code === 'permission-denied') {
            showToast('Firestore rules need updating. Check console for details.', 'error');
        } else {
            showToast('Cloud sync failed: ' + (err.code || err.message), 'error');
        }
    }
}

async function saveToCloud() {
    if (!STATE.userId) return;
    setSyncStatus('syncing');

    try {
        await db.collection('users').doc(STATE.userId).set({
            words: STATE.words,
            streak: STATE.streak,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        setSyncStatus('synced');
    } catch (err) {
        setSyncStatus('offline');
    }
}

function mergeWordLists(local, cloud) {
    const map = new Map();
    // Cloud first (older baseline)
    cloud.forEach(w => map.set(w.word.toLowerCase(), w));
    // Local overwrites with newer data
    local.forEach(w => {
        const key = w.word.toLowerCase();
        const existing = map.get(key);
        if (!existing || new Date(w.dateAdded) > new Date(existing.dateAdded)) {
            map.set(key, w);
        }
    });
    return [...map.values()].sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
}

function setSyncStatus(status) {
    const el = document.getElementById('syncStatus');
    el.className = 'sync-status ' + (status === 'syncing' ? 'syncing' : status === 'offline' ? 'offline' : '');
    el.title = status === 'synced' ? 'Synced to cloud' : status === 'syncing' ? 'Syncing...' : 'Offline';
    const icon = el.querySelector('i');
    icon.className = status === 'synced' ? 'fas fa-cloud' : status === 'syncing' ? 'fas fa-sync fa-spin' : 'fas fa-cloud-slash';
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
    const sourceSelect = document.getElementById('sourceSelect');

    btn.addEventListener('click', () => searchWord(input.value.trim()));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchWord(input.value.trim());
    });

    // Re-search automatically when source changes
    sourceSelect.addEventListener('change', () => {
        if (sourceSelect.value === 'custom') { updatePdfRemoveBtn(); return; }
        if (sourceSelect.value === 'uploadpdf') {
            document.getElementById('pdfDictInput').click();
            sourceSelect.value = 'free';
            updatePdfRemoveBtn();
            return;
        }
        updatePdfRemoveBtn();
        const word = input.value.trim();
        if (word) searchWord(word);
    });

    document.getElementById('removePdfBtn').addEventListener('click', () => {
        const id = sourceSelect.value;
        if (!id.startsWith('pdf_')) return;
        const dicts = JSON.parse(localStorage.getItem('vocabPdfDicts') || '[]');
        const dict = dicts.find(d => d.id === id);
        if (!confirm(`Remove "${dict?.name || 'this PDF'}" dictionary?`)) return;
        removePdfDictionary(id);
    });

    openBtn.addEventListener('click', openInSource);
    document.getElementById('saveWordBtn').addEventListener('click', saveCurrentWord);
    document.getElementById('pronounceBtn').addEventListener('click', pronounceWord);
    initCustomSources();
    initAutocomplete(input);
}

function initAutocomplete(input) {
    let acBox = document.createElement('div');
    acBox.className = 'autocomplete-list';
    input.parentElement.style.position = 'relative';
    input.parentElement.appendChild(acBox);

    let activeIdx = -1;
    let debounceTimer = null;

    input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        acBox.innerHTML = '';
        activeIdx = -1;
        if (!val || val.length < 2) { acBox.classList.remove('visible'); return; }

        // Show saved words immediately
        const savedMatches = STATE.words
            .filter(w => w.word.toLowerCase().startsWith(val))
            .slice(0, 4)
            .map(w => ({ word: w.word, saved: true }));

        renderAcItems(acBox, savedMatches, input);

        // Debounced fetch from Datamuse API for word suggestions
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(val)}&max=10`, { signal: AbortSignal.timeout(3000) });
                if (!res.ok) return;
                const data = await res.json();
                const suggestions = data
                    .map(d => d.word)
                    .filter(w => /^[a-zA-Z'-]+$/.test(w))
                    .filter(w => !savedMatches.find(s => s.word.toLowerCase() === w.toLowerCase()))
                    .slice(0, 6)
                    .map(w => ({ word: w, saved: false }));

                const combined = [...savedMatches, ...suggestions];
                if (input.value.trim().toLowerCase() === val) {
                    renderAcItems(acBox, combined, input);
                }
            } catch (e) {}
        }, 250);
    });

    input.addEventListener('keydown', (e) => {
        const items = acBox.querySelectorAll('.autocomplete-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
            items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
        } else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault();
            input.value = items[activeIdx].dataset.word;
            acBox.classList.remove('visible');
            searchWord(input.value.trim());
        } else if (e.key === 'Escape') {
            acBox.classList.remove('visible');
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => acBox.classList.remove('visible'), 150);
    });
}

function renderAcItems(acBox, items, input) {
    acBox.innerHTML = '';
    if (items.length === 0) { acBox.classList.remove('visible'); return; }
    acBox.classList.add('visible');
    items.forEach(({ word, saved }) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.dataset.word = word;
        item.innerHTML = saved
            ? `<i class="fas fa-bookmark" style="color:var(--success);margin-right:0.4rem;font-size:0.7rem"></i>${word}`
            : word;
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = word;
            acBox.classList.remove('visible');
            searchWord(word);
        });
        acBox.appendChild(item);
    });
}

async function searchWord(word) {
    if (!word) return;
    const resultDiv = document.getElementById('wordResult');
    resultDiv.classList.remove('hidden');
    document.getElementById('resultMeanings').innerHTML = '<p style="color:var(--text-muted)">Searching...</p>';

    const source = document.getElementById('sourceSelect').value;
    let data = null;
    let usedSource = source;

    // Try selected source first (scrape/PDF), then fall back to Free Dictionary API
    if (source.startsWith('pdf_')) {
        try {
            data = await searchPdfDict(source, word);
            data._source = source;
        } catch (e) {
            // PDF search failed, will try API fallback
        }
    } else if (source !== 'free') {
        try {
            data = await scrapeFromSource(source, word);
            data._source = source;
        } catch (e) {
            // Scrape failed, will try API fallback
        }
    }

    // Fallback to Free Dictionary API
    if (!data) {
        try {
            data = await fetchWordDataFromAPI(word);
            data._source = 'free';
            usedSource = 'free';
        } catch (e) {
            // Both failed
        }
    }

    if (data) {
        displayWordResult(data);
        // Show which source was used
        const sourceUrl = getSourceUrl(source, word);
        const sourceLabel = getSourceLabel(source);
        const usedLabel = getSourceLabel(data._source);
        let refHtml = `<div class="source-reference"><i class="fas fa-info-circle"></i> Data from: <strong>${usedLabel}</strong>`;
        if (data._source !== source && source !== 'free') {
            refHtml += ` (${getSourceLabel(source)} scrape failed) `;
        }
        if (sourceUrl && source !== 'free') {
            refHtml += ` | <a href="${sourceUrl}" target="_blank"><i class="fas fa-external-link-alt"></i> Open ${sourceLabel}</a>`;
        }
        refHtml += `</div>`;
        document.getElementById('resultMeanings').insertAdjacentHTML('beforeend', refHtml);
    } else {
        const sourceUrl = getSourceUrl(source, word);
        const sourceLabel = getSourceLabel(source);
        document.getElementById('resultMeanings').innerHTML =
            `<p style="color:var(--danger)">Word not found from any source.</p>
            ${sourceUrl ? `<p style="margin-top:0.75rem">
                <a href="${sourceUrl}" target="_blank" class="btn btn-primary btn-sm">
                    <i class="fas fa-external-link-alt"></i> Try on ${sourceLabel} directly
                </a>
            </p>` : ''}`;
        document.getElementById('resultWord').textContent = word;
        document.getElementById('resultPhonetic').textContent = '';
        document.getElementById('resultSynonyms').classList.add('hidden');
        document.getElementById('resultAntonyms').classList.add('hidden');
    }
}

async function fetchWordDataFromAPI(word) {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error('Not found');
    const data = await response.json();
    return data[0];
}

// Keep old name as alias for other code that calls it
async function fetchWordData(word) {
    return await fetchWordDataFromAPI(word);
}

// --- Source Scraping ---
async function scrapeFromSource(source, word) {
    const url = getSourceUrl(source, word);
    if (!url) throw new Error('No URL');

    const proxies = [
        (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    ];

    let html = null;
    for (const proxyFn of proxies) {
        try {
            const res = await fetch(proxyFn(url), { signal: AbortSignal.timeout(12000) });
            if (!res.ok) continue;
            const text = await res.text();
            if (text.length > 500) { html = text; break; }
        } catch (e) { continue; }
    }

    if (!html) throw new Error('Fetch failed');

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Parse based on source
    switch (source) {
        case 'cambridge': return parseCambridge(doc, word);
        case 'oxford': return parseOxford(doc, word);
        case 'longman': return parseLongman(doc, word);
        case 'merriam': return parseMerriam(doc, word);
        case 'vocabulary': return parseVocabulary(doc, word);
        default: throw new Error('No parser for source');
    }
}

function parseCambridge(doc, word) {
    const entry = doc.querySelector('.entry-body__el') || doc.querySelector('.pr.dictionary') || doc.querySelector('.di-body');
    if (!entry) throw new Error('No entry found');

    // Extract UK and US pronunciation separately
    const ukPron = doc.querySelector('.uk.dpron-i .ipa')?.textContent || '';
    const usPron = doc.querySelector('.us.dpron-i .ipa')?.textContent || '';
    const phonetic = ukPron || doc.querySelector('.ipa')?.textContent || '';

    const ukAudioSrc = doc.querySelector('.uk.dpron-i source[type="audio/mpeg"]')?.getAttribute('src') || '';
    const usAudioSrc = doc.querySelector('.us.dpron-i source[type="audio/mpeg"]')?.getAttribute('src') || '';
    const baseUrl = 'https://dictionary.cambridge.org';
    const ukAudio = ukAudioSrc ? (ukAudioSrc.startsWith('http') ? ukAudioSrc : baseUrl + ukAudioSrc) : '';
    const usAudio = usAudioSrc ? (usAudioSrc.startsWith('http') ? usAudioSrc : baseUrl + usAudioSrc) : '';
    const audio = ukAudio || usAudio;

    const meanings = [];
    // Try .def-block first, fall back to .ddef_d (newer Cambridge layout)
    let blocks = doc.querySelectorAll('.def-block, .ddef_block');
    if (blocks.length === 0) blocks = doc.querySelectorAll('.sense-body [class*="def"]');

    blocks.forEach(block => {
        const pos = block.closest('.entry-body__el')?.querySelector('.pos, .dpos')?.textContent ||
                    block.closest('.pr')?.querySelector('.pos, .dpos')?.textContent || '';
        const definition = (block.querySelector('.def, .ddef_d')?.textContent?.trim() || '').replace(/:\s*$/, '');
        const examples = [];
        block.querySelectorAll('.eg, .deg, .examp').forEach(ex => {
            const t = ex.textContent?.trim();
            if (t) examples.push(t);
        });
        if (definition) {
            meanings.push({ partOfSpeech: pos, definitions: [{ definition, example: examples.join(' • ') }] });
        }
    });

    // Phrases/Idioms
    const phrases = [];
    doc.querySelectorAll('.phrase-title, .idiom-title, .dphrase-title, .phrase-di').forEach(el => {
        const phrase = el.textContent?.trim();
        if (phrase) phrases.push(phrase);
    });

    // Synonyms/Antonyms
    const synonyms = [];
    const antonyms = [];
    doc.querySelectorAll('.synonyms .item, .thes .item, .dsynonyms a').forEach(el => {
        synonyms.push(el.textContent?.trim());
    });
    doc.querySelectorAll('.opposites .item, .dantonyms a').forEach(el => {
        antonyms.push(el.textContent?.trim());
    });

    if (meanings.length === 0) throw new Error('No meanings');
    const result = buildStandardResult(word, phonetic, audio, meanings, synonyms, antonyms, phrases);
    if (ukPron || usPron) {
        result._pronunciation = {
            uk: { ipa: ukPron, audio: ukAudio },
            us: { ipa: usPron, audio: usAudio },
        };
    }
    return result;
}

function parseOxford(doc, word) {
    const phonetic = doc.querySelector('.phon')?.textContent || '';
    const audio = doc.querySelector('audio source')?.getAttribute('src') || '';

    const meanings = [];
    const senses = doc.querySelectorAll('.sense');
    senses.forEach(sense => {
        const pos = sense.closest('.entry')?.querySelector('.pos')?.textContent || '';
        const definition = sense.querySelector('.def')?.textContent?.trim() || '';
        const examples = [];
        sense.querySelectorAll('.x, .unx, .EXAMPLE').forEach(ex => {
            const t = ex.textContent?.trim();
            if (t) examples.push(t);
        });
        if (definition) {
            meanings.push({ partOfSpeech: pos, definitions: [{ definition, example: examples.join(' • ') }] });
        }
    });

    // Phrases/Idioms
    const phrases = [];
    doc.querySelectorAll('.idm-g .idm, .pv-g .pv').forEach(el => {
        const phrase = el.textContent?.trim();
        if (phrase) phrases.push(phrase);
    });

    // Synonyms
    const synonyms = [];
    const antonyms = [];
    doc.querySelectorAll('.synonyms a, .opp a').forEach(el => {
        synonyms.push(el.textContent?.trim());
    });
    doc.querySelectorAll('.opp a').forEach(el => {
        antonyms.push(el.textContent?.trim());
    });

    if (meanings.length === 0) throw new Error('No meanings');
    return buildStandardResult(word, phonetic, audio, meanings, synonyms, antonyms, phrases);
}

function parseLongman(doc, word) {
    const phonetic = doc.querySelector('.PRON')?.textContent?.trim() || '';
    const amePron = doc.querySelector('.AMEVARPRON')?.textContent?.trim().replace(/^\$\s*/, '') || '';

    // British and American audio
    const breAudioEl = doc.querySelector('.brefile[data-src-mp3]');
    const ameAudioEl = doc.querySelector('.amefile[data-src-mp3]');
    const breAudio = breAudioEl?.getAttribute('data-src-mp3') || '';
    const ameAudio = ameAudioEl?.getAttribute('data-src-mp3') || '';
    const audioSrc = breAudio || ameAudio || doc.querySelector('[data-src-mp3]')?.getAttribute('data-src-mp3') || '';

    const meanings = [];

    // Main entry definitions (exclude business dictionary senses)
    const mainEntry = doc.querySelector('.ldoceEntry.Entry') || doc.querySelector('.Entry');
    const senses = mainEntry ? mainEntry.querySelectorAll('.Sense') : doc.querySelectorAll('.Entry .Sense');
    senses.forEach(sense => {
        if (sense.closest('.bussdictEntry')) return;
        const pos = sense.closest('.Entry')?.querySelector('.POS')?.textContent?.trim() || '';
        const defEl = sense.querySelector('.DEF');
        const definition = defEl?.textContent?.trim() || '';
        const examples = [];
        sense.querySelectorAll('.EXAMPLE').forEach(ex => {
            const t = ex.textContent?.trim().replace(/^•\s*/, '');
            if (t) examples.push(t);
        });
        if (definition) {
            meanings.push({ partOfSpeech: pos, definitions: [{ definition, example: examples.join(' • ') }] });
        }
    });

    // Examples from the Corpus (.exaGroup with .cexa1g1.exa children)
    const corpusGroups = doc.querySelectorAll('.exaGroup');
    if (corpusGroups.length > 0) {
        const corpusExamples = [];
        corpusGroups.forEach(group => {
            group.querySelectorAll('.exa, .cexa1g1').forEach(ex => {
                const t = ex.textContent?.trim().replace(/^•\s*/, '');
                if (t && t.length > 5) corpusExamples.push(t);
            });
        });
        if (corpusExamples.length > 0) {
            meanings.push({
                partOfSpeech: 'Examples from Corpus',
                definitions: corpusExamples.map(ex => ({ definition: ex, example: '' }))
            });
        }
    }

    // Thesaurus (.ThesBox > .Exponent)
    const thesBox = doc.querySelector('.ThesBox');
    if (thesBox) {
        const thesEntries = [];
        thesBox.querySelectorAll('.Exponent').forEach(exp => {
            const term = exp.querySelector('.EXP, .display')?.textContent?.trim() || '';
            const def = exp.querySelector('.DEF')?.textContent?.trim() || '';
            const examples = [];
            exp.querySelectorAll('.EXAMPLE').forEach(ex => {
                const t = ex.textContent?.trim();
                if (t) examples.push(t);
            });
            if (term && def) {
                thesEntries.push(`${term}: ${def}${examples.length ? ' — ' + examples.join('; ') : ''}`);
            }
        });
        if (thesEntries.length > 0) {
            meanings.push({
                partOfSpeech: 'Thesaurus',
                definitions: thesEntries.map(entry => ({ definition: entry, example: '' }))
            });
        }
    }

    // From Longman Business Dictionary (.bussdictEntry.Entry)
    const busDict = doc.querySelector('.bussdictEntry');
    if (busDict) {
        const busSenses = busDict.querySelectorAll('.Sense');
        busSenses.forEach(sense => {
            const category = sense.querySelector('.FIELD')?.textContent?.trim() || '';
            const definition = sense.querySelector('.DEF')?.textContent?.trim() || '';
            const examples = [];
            sense.querySelectorAll('.EXAMPLE').forEach(ex => {
                const t = ex.textContent?.trim().replace(/^•\s*/, '');
                if (t) examples.push(t);
            });
            if (definition) {
                const label = category ? `Business (${category})` : 'Business Dictionary';
                meanings.push({ partOfSpeech: label, definitions: [{ definition, example: examples.join(' • ') }] });
            }
        });
    }

    // Related Topics (.topics_container > a.topic)
    const relatedTopics = [];
    doc.querySelectorAll('.topics_container .topic, .related_topics a.topic').forEach(el => {
        const t = el.textContent?.trim();
        if (t) relatedTopics.push(t);
    });

    // Collocations (.ColloExa > .COLLO and .ColloEnt)
    const phrases = [];
    doc.querySelectorAll('.COLLO, .ColloEnt, .PHRASEOL .PHRASE').forEach(el => {
        const phrase = el.textContent?.trim();
        if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
    });

    // Synonyms from thesaurus entries
    const synonyms = [];
    const antonyms = [];
    if (thesBox) {
        thesBox.querySelectorAll('.EXP, .display').forEach(el => {
            const t = el.textContent?.trim();
            if (t && t.toLowerCase() !== word.toLowerCase()) synonyms.push(t);
        });
    }
    doc.querySelectorAll('.OPP .synt, .OPP a').forEach(el => {
        antonyms.push(el.textContent?.trim());
    });

    if (meanings.length === 0) throw new Error('No meanings');
    const result = buildStandardResult(word, phonetic, audioSrc, meanings, synonyms, antonyms, phrases);
    if (relatedTopics.length > 0) {
        result._relatedTopics = relatedTopics;
    }
    if (phonetic || amePron) {
        result._pronunciation = {
            uk: { ipa: phonetic, audio: breAudio },
            us: { ipa: amePron || phonetic, audio: ameAudio },
        };
    }
    return result;
}

function parseMerriam(doc, word) {
    const phonetic = doc.querySelector('.pr')?.textContent?.trim() || '';
    const audioFile = doc.querySelector('audio source')?.getAttribute('src') || '';

    const meanings = [];
    const entries = doc.querySelectorAll('.vg');
    entries.forEach(entry => {
        const pos = entry.closest('.entry-word-section-container')?.querySelector('.fl')?.textContent || '';
        const defs = entry.querySelectorAll('.dtText');
        defs.forEach(def => {
            const definition = def.textContent?.replace(/^:\s*/, '').trim() || '';
            const examples = [];
            const parent = def.parentElement;
            if (parent) {
                parent.querySelectorAll('.ex-sent, .t_sc, .sub-content-thread .ex-sent').forEach(ex => {
                    const t = ex.textContent?.trim();
                    if (t) examples.push(t);
                });
            }
            if (definition) {
                meanings.push({ partOfSpeech: pos, definitions: [{ definition, example: examples.join(' • ') }] });
            }
        });
    });

    // Synonyms & Antonyms from Merriam
    const synonyms = [];
    const antonyms = [];
    doc.querySelectorAll('.thes-list.syn-list .thes-word, .synonyms_list a').forEach(el => {
        synonyms.push(el.textContent?.trim());
    });
    doc.querySelectorAll('.thes-list.ant-list .thes-word, .antonyms_list a').forEach(el => {
        antonyms.push(el.textContent?.trim());
    });

    // Related Phrases — from the #related-phrases section and inline phrase markers
    const phrases = [];
    const phrasesSection = doc.getElementById('related-phrases') || doc.querySelector('[id*="related-phrases"]');
    if (phrasesSection) {
        const phraseContainer = phrasesSection.closest('div') || phrasesSection.parentElement;
        if (phraseContainer) {
            phraseContainer.querySelectorAll('a').forEach(el => {
                const phrase = el.textContent?.trim();
                if (phrase && phrase.length > 1) phrases.push(phrase);
            });
        }
    }
    // Also grab inline defined run-on phrases
    doc.querySelectorAll('.drp, .dro a, .if').forEach(el => {
        const phrase = el.textContent?.trim();
        if (phrase && phrase.includes(' ') && !phrases.includes(phrase)) phrases.push(phrase);
    });

    // Examples from the #examples section (real-world usage)
    const examplesSection = doc.getElementById('examples') || doc.querySelector('[id*="examples"]');
    if (examplesSection) {
        const exContainer = examplesSection.closest('div') || examplesSection.parentElement;
        if (exContainer) {
            exContainer.querySelectorAll('.t, .sents .t, [class*="ex-sent"]').forEach(ex => {
                const t = ex.textContent?.trim();
                if (t && meanings.length > 0) {
                    const lastMeaning = meanings[meanings.length - 1];
                    const existingEx = lastMeaning.definitions[0]?.example || '';
                    if (!existingEx) {
                        lastMeaning.definitions[0].example = t;
                    } else if (!existingEx.includes(t.slice(0, 30))) {
                        lastMeaning.definitions[0].example += ' • ' + t;
                    }
                }
            });
        }
    }

    if (meanings.length === 0) throw new Error('No meanings');
    return buildStandardResult(word, phonetic, audioFile, meanings, synonyms, antonyms, phrases);
}

function parseVocabulary(doc, word) {
    const shortDef = doc.querySelector('.short')?.textContent?.trim() || '';
    const longDef = doc.querySelector('.long')?.textContent?.trim() || '';

    const meanings = [];

    // Short/Long description as overview
    if (shortDef || longDef) {
        const overviewDefs = [];
        if (shortDef) overviewDefs.push({ definition: shortDef, example: '' });
        if (longDef && longDef !== shortDef) overviewDefs.push({ definition: longDef, example: '' });
        meanings.push({ partOfSpeech: 'Overview', definitions: overviewDefs });
    }

    // “Definitions of [word]” — individual senses with POS, definition, examples, types, synonyms
    const senses = doc.querySelectorAll('.sense');
    const synonyms = [];
    const senseDefs = [];
    senses.forEach(sense => {
        const posEl = sense.querySelector('.pos-icon');
        const pos = posEl?.textContent?.trim() || '';
        const defEl = sense.querySelector('.definition');
        let definition = defEl?.textContent?.trim() || '';
        // Remove the POS text from definition start
        if (pos && definition.startsWith(pos)) {
            definition = definition.slice(pos.length).trim();
        }

        const examples = [];
        sense.querySelectorAll('.defContent .example').forEach(ex => {
            const t = ex.textContent?.trim().replace(/[“”””]/g, '');
            if (t) examples.push(t);
        });

        // Types (sub-definitions like “celestial hierarchy”, “data hierarchy”)
        const types = [];
        sense.querySelectorAll('.instances .div-replace-dd').forEach(dd => {
            const typeWord = dd.querySelector('.word')?.textContent?.trim() || '';
            const typeDef = dd.querySelector('.definition')?.textContent?.trim() || '';
            if (typeWord && typeDef) types.push(`${typeWord}: ${typeDef}`);
        });

        // Synonyms from this sense
        sense.querySelectorAll('.instances .word').forEach(el => {
            const parent = el.closest('.div-replace-dl');
            const detail = parent?.querySelector('.detail')?.textContent?.trim() || '';
            if (detail.includes('synonym')) {
                synonyms.push(el.textContent?.trim());
            }
        });

        if (definition) {
            let exampleText = examples.join(' • ');
            if (types.length) {
                exampleText += (exampleText ? ' • ' : '') + 'Types: ' + types.join('; ');
            }
            senseDefs.push({ definition: (pos ? `(${pos}) ` : '') + definition, example: exampleText });
        }
    });

    if (senseDefs.length > 0) {
        meanings.push({ partOfSpeech: `Definitions of “${word}”`, definitions: senseDefs });
    }

    // Synonyms from instances sections
    doc.querySelectorAll('.instances .word').forEach(el => {
        const parent = el.closest('.div-replace-dl');
        const detail = parent?.querySelector('.detail')?.textContent?.trim() || '';
        if (detail.includes('synonym')) {
            const t = el.textContent?.trim();
            if (t && !synonyms.includes(t)) synonyms.push(t);
        }
    });

    if (meanings.length === 0) throw new Error('No meanings');

    // UK/US pronunciation
    let ukIpa = '', usIpa = '', ukAudio = '', usAudio = '';
    const ipaBlocks = doc.querySelectorAll('.ipa-with-audio');
    ipaBlocks.forEach(block => {
        const ipa = block.querySelector('.span-replace-h3')?.textContent?.trim() || '';
        if (block.querySelector('.us-flag-icon')) {
            usIpa = ipa;
            const audioEl = block.querySelector('[data-audio]');
            if (audioEl) {
                const code = audioEl.getAttribute('data-audio');
                usAudio = `https://audio.vocab.com/1.0/us/${code}.mp3`;
            }
        } else if (block.querySelector('.uk-flag-icon')) {
            ukIpa = ipa;
            const audioEl = block.querySelector('.pron-audio');
            if (audioEl) ukAudio = audioEl.getAttribute('src') || '';
        }
    });

    const phonetic = usIpa || ukIpa;
    const audio = usAudio || ukAudio;
    const result = buildStandardResult(word, phonetic, audio, meanings, synonyms, [], []);

    if (ukIpa || usIpa) {
        result._pronunciation = {
            uk: { ipa: ukIpa, audio: ukAudio },
            us: { ipa: usIpa, audio: usAudio },
        };
    }
    return result;
}

function buildStandardResult(word, phonetic, audio, meanings, synonyms = [], antonyms = [], phrases = []) {
    // Consolidate meanings by part of speech
    const grouped = {};
    meanings.forEach(m => {
        const pos = m.partOfSpeech || 'unknown';
        if (!grouped[pos]) grouped[pos] = { partOfSpeech: pos, definitions: [], synonyms: [], antonyms: [] };
        grouped[pos].definitions.push(...m.definitions);
    });

    const result = {
        word,
        phonetic: phonetic ? `/${phonetic}/` : '',
        phonetics: audio ? [{ text: phonetic, audio }] : [],
        meanings: Object.values(grouped),
        _synonyms: [...new Set(synonyms.filter(Boolean))].slice(0, 15),
        _antonyms: [...new Set(antonyms.filter(Boolean))].slice(0, 15),
        _phrases: [...new Set(phrases.filter(Boolean))].slice(0, 20),
    };
    return result;
}

function displayWordResult(data) {
    document.getElementById('resultWord').textContent = data.word;

    // Dual pronunciation (UK/US) if available
    const pronContainer = document.getElementById('resultPhonetic');
    const pronounceBtn = document.getElementById('pronounceBtn');

    if (data._pronunciation && (data._pronunciation.uk.ipa || data._pronunciation.us.ipa)) {
        const pron = data._pronunciation;
        let pronHtml = '';
        if (pron.uk.ipa) {
            pronHtml += `<span class="pron-variant"><span class="pron-label">UK</span> /${pron.uk.ipa}/`;
            if (pron.uk.audio) {
                pronHtml += ` <button class="btn-icon btn-pron" onclick="new Audio('${pron.uk.audio}').play()" title="British pronunciation"><i class="fas fa-volume-up"></i></button>`;
            }
            pronHtml += `</span>`;
        }
        if (pron.us.ipa) {
            pronHtml += `<span class="pron-variant"><span class="pron-label">US</span> /${pron.us.ipa}/`;
            if (pron.us.audio) {
                pronHtml += ` <button class="btn-icon btn-pron" onclick="new Audio('${pron.us.audio}').play()" title="American pronunciation"><i class="fas fa-volume-up"></i></button>`;
            }
            pronHtml += `</span>`;
        }
        pronContainer.innerHTML = pronHtml;
        pronounceBtn.classList.add('hidden');
        pronounceBtn.dataset.audio = pron.uk.audio || pron.us.audio || '';
    } else if (data.phonetics && data.phonetics.length > 1) {
        // Free Dictionary API: detect UK/US from audio URLs
        const ukEntry = data.phonetics.find(p => p.audio && p.audio.includes('-uk'));
        const usEntry = data.phonetics.find(p => p.audio && p.audio.includes('-us'));
        if (ukEntry || usEntry) {
            let pronHtml = '';
            if (ukEntry) {
                pronHtml += `<span class="pron-variant"><span class="pron-label">UK</span> ${ukEntry.text || data.phonetic || ''}`;
                pronHtml += ` <button class="btn-icon btn-pron" onclick="new Audio('${ukEntry.audio}').play()" title="British pronunciation"><i class="fas fa-volume-up"></i></button></span>`;
            }
            if (usEntry) {
                pronHtml += `<span class="pron-variant"><span class="pron-label">US</span> ${usEntry.text || data.phonetic || ''}`;
                pronHtml += ` <button class="btn-icon btn-pron" onclick="new Audio('${usEntry.audio}').play()" title="American pronunciation"><i class="fas fa-volume-up"></i></button></span>`;
            }
            pronContainer.innerHTML = pronHtml;
            pronounceBtn.classList.add('hidden');
            pronounceBtn.dataset.audio = (ukEntry || usEntry)?.audio || '';
        } else {
            pronContainer.textContent = data.phonetic || (data.phonetics?.[0]?.text) || '';
            pronounceBtn.classList.remove('hidden');
            pronounceBtn.dataset.audio = data.phonetics?.find(p => p.audio)?.audio || '';
        }
    } else {
        pronContainer.textContent = data.phonetic || (data.phonetics?.[0]?.text) || '';
        pronounceBtn.classList.remove('hidden');
        const audioEntry = data.phonetics?.find(p => p.audio);
        pronounceBtn.dataset.audio = audioEntry?.audio || '';
    }

    // Meanings with selectable checkboxes
    const meaningsDiv = document.getElementById('resultMeanings');
    let allSynonyms = [];
    let allAntonyms = [];
    let html = '';
    let defIdx = 0;

    data.meanings.forEach((meaning, mIdx) => {
        const isSupplementary = /corpus|thesaurus|business/i.test(meaning.partOfSpeech);
        html += `<div class="meaning-group">
            <h3>${meaning.partOfSpeech}</h3>`;
        meaning.definitions.forEach((def, i) => {
            const checked = !isSupplementary && defIdx < 2 ? 'checked' : '';
            html += `<div class="definition-item selectable-item">
                <label class="save-check"><input type="checkbox" data-save-type="def" data-def-idx="${defIdx}" ${checked}></label>
                <div class="def-content">
                    <p><strong>${i + 1}.</strong> ${def.definition}</p>
                    ${def.example ? `<p class="example">"${def.example}"</p>` : ''}
                </div>
            </div>`;
            defIdx++;
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

    // Store all definitions flat for save-selection
    STATE._allDefs = [];
    data.meanings.forEach(meaning => {
        meaning.definitions.forEach(def => {
            STATE._allDefs.push({ pos: meaning.partOfSpeech, definition: def.definition, example: def.example || '' });
        });
    });

    // Merge scraped synonyms/antonyms with API ones
    if (data._synonyms) allSynonyms.push(...data._synonyms);
    if (data._antonyms) allAntonyms.push(...data._antonyms);

    // Synonyms (selectable tags)
    const synSection = document.getElementById('resultSynonyms');
    const synList = document.getElementById('synonymsList');
    allSynonyms = [...new Set(allSynonyms)].slice(0, 12);
    if (allSynonyms.length) {
        synSection.classList.remove('hidden');
        synList.innerHTML = allSynonyms.map(s => `<span class="tag tag-selectable selected" data-save-type="syn" data-value="${s}" onclick="toggleTagSelect(this)">${s}</span>`).join('');
    } else {
        synSection.classList.add('hidden');
    }

    // Antonyms (selectable tags)
    const antSection = document.getElementById('resultAntonyms');
    const antList = document.getElementById('antonymsList');
    allAntonyms = [...new Set(allAntonyms)].slice(0, 12);
    if (allAntonyms.length) {
        antSection.classList.remove('hidden');
        antList.innerHTML = allAntonyms.map(a => `<span class="tag tag-selectable selected" data-save-type="ant" data-value="${a}" onclick="toggleTagSelect(this)">${a}</span>`).join('');
    } else {
        antSection.classList.add('hidden');
    }

    // Phrases/Collocations (selectable tags)
    const phrasesSection = document.getElementById('resultPhrases');
    const phrasesList = document.getElementById('phrasesList');
    const allPhrases = (data._phrases || []).slice(0, 20);
    if (allPhrases.length) {
        phrasesSection.classList.remove('hidden');
        phrasesList.innerHTML = allPhrases.map(p => `<span class="tag phrase-tag tag-selectable selected" data-save-type="phrase" data-value="${p}" onclick="toggleTagSelect(this)">${p}</span>`).join('');
    } else {
        phrasesSection.classList.add('hidden');
    }

    // Related Topics (from Longman)
    const topicsSection = document.getElementById('resultTopics');
    if (topicsSection) {
        const topicsList = document.getElementById('topicsList');
        const topics = data._relatedTopics || [];
        if (topics.length) {
            topicsSection.classList.remove('hidden');
            topicsList.innerHTML = topics.map(t => `<span class="tag topic-tag">${t}</span>`).join('');
        } else {
            topicsSection.classList.add('hidden');
        }
    }

    // Store current word data
    STATE.currentWord = {
        word: data.word,
        phonetic: data.phonetic || data.phonetics?.[0]?.text || '',
        partOfSpeech: data.meanings[0]?.partOfSpeech || '',
        audio: data.phonetics?.find(p => p.audio)?.audio || '',
        allMeanings: data.meanings,
    };
    STATE._allSynonyms = allSynonyms;
    STATE._allAntonyms = allAntonyms;
    STATE._allPhrases = allPhrases;
    STATE._relatedTopics = data._relatedTopics || [];
}

function toggleTagSelect(el) {
    el.classList.toggle('selected');
}

function getSelectedSaveData() {
    // Get checked definitions
    const checkedDefs = document.querySelectorAll('[data-save-type="def"]:checked');
    const meanings = [];
    const examples = [];
    checkedDefs.forEach(cb => {
        const idx = parseInt(cb.dataset.defIdx);
        const def = STATE._allDefs[idx];
        if (def) {
            meanings.push(def.definition);
            if (def.example) examples.push(def.example);
        }
    });

    // Get selected synonyms/antonyms/phrases
    const synonyms = [...document.querySelectorAll('[data-save-type="syn"].selected')].map(el => el.dataset.value);
    const antonyms = [...document.querySelectorAll('[data-save-type="ant"].selected')].map(el => el.dataset.value);
    const phrases = [...document.querySelectorAll('[data-save-type="phrase"].selected')].map(el => el.dataset.value);

    return {
        meaning: meanings.join(' • '),
        example: examples.join(' • '),
        synonyms,
        antonyms,
        phrases,
        partOfSpeech: STATE._allDefs.find((_, i) => document.querySelector(`[data-def-idx="${i}"]:checked`))?.pos || '',
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
    const url = getSourceUrl(source, word);
    if (url) window.open(url, '_blank');
}

function getSourceUrl(source, word) {
    const builtIn = {
        free: `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`,
        vocabulary: `https://www.vocabulary.com/dictionary/${word}`,
        cambridge: `https://dictionary.cambridge.org/dictionary/english/${word}`,
        oxford: `https://www.oxfordlearnersdictionaries.com/definition/english/${word}`,
        merriam: `https://www.merriam-webster.com/dictionary/${word}`,
        longman: `https://www.ldoceonline.com/dictionary/${word}`,
    };
    if (builtIn[source]) return builtIn[source];
    // Custom sources stored in localStorage
    const custom = JSON.parse(localStorage.getItem('vocabCustomSources') || '[]');
    const found = custom.find(s => s.id === source);
    if (found) return found.urlTemplate.replace('{word}', word);
    return null;
}

function getSourceLabel(source) {
    const labels = {
        free: 'Free Dict',
        vocabulary: 'Vocabulary.com',
        cambridge: 'Cambridge',
        oxford: 'Oxford',
        merriam: 'Merriam-Webster',
        longman: 'Longman',
    };
    if (labels[source]) return labels[source];
    if (source.startsWith('pdf_')) {
        const dicts = JSON.parse(localStorage.getItem('vocabPdfDicts') || '[]');
        const found = dicts.find(d => d.id === source);
        return found ? `📖 ${found.name}` : 'PDF Dictionary';
    }
    const custom = JSON.parse(localStorage.getItem('vocabCustomSources') || '[]');
    const found = custom.find(s => s.id === source);
    return found ? found.name : source;
}

function initCustomSources() {
    const select = document.getElementById('sourceSelect');
    select.addEventListener('change', () => {
        if (select.value === 'custom') {
            addCustomSource();
            select.value = 'free';
        }
    });
    // Load existing custom sources into dropdown
    const custom = JSON.parse(localStorage.getItem('vocabCustomSources') || '[]');
    custom.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        select.insertBefore(opt, select.querySelector('[value="custom"]'));
    });
}

function addCustomSource() {
    const name = prompt('Source name (e.g., "Wiktionary"):');
    if (!name) return;
    const urlTemplate = prompt('URL template with {word} placeholder:\n(e.g., https://en.wiktionary.org/wiki/{word})');
    if (!urlTemplate || !urlTemplate.includes('{word}')) {
        showToast('URL must include {word} placeholder', 'error');
        return;
    }
    const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const custom = JSON.parse(localStorage.getItem('vocabCustomSources') || '[]');
    custom.push({ id, name, urlTemplate });
    localStorage.setItem('vocabCustomSources', JSON.stringify(custom));

    const select = document.getElementById('sourceSelect');
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    select.insertBefore(opt, select.querySelector('[value="custom"]'));
    select.value = id;
    showToast(`"${name}" added as source!`, 'success');
}

function saveCurrentWord() {
    if (!STATE.currentWord) return;
    const selected = getSelectedSaveData();

    if (!selected.meaning && !selected.synonyms.length && !selected.antonyms.length && !selected.phrases.length) {
        showToast('Select at least one item to save!', 'error');
        return;
    }

    const existing = STATE.words.find(w => w.word.toLowerCase() === STATE.currentWord.word.toLowerCase());

    if (existing) {
        // Merge selected data into existing entry
        if (selected.meaning && !existing.meaning?.includes(selected.meaning.slice(0, 30))) {
            existing.meaning = (existing.meaning ? existing.meaning + ' • ' : '') + selected.meaning;
        }
        if (selected.example && !existing.example?.includes(selected.example.slice(0, 30))) {
            existing.example = (existing.example ? existing.example + ' • ' : '') + selected.example;
        }
        const mergeUnique = (arr1, arr2) => [...new Set([...(arr1 || []), ...(arr2 || [])])];
        existing.synonyms = mergeUnique(existing.synonyms, selected.synonyms);
        existing.antonyms = mergeUnique(existing.antonyms, selected.antonyms);
        existing.phrases = mergeUnique(existing.phrases, selected.phrases);
        existing.relatedTopics = mergeUnique(existing.relatedTopics, STATE._relatedTopics || []);
        if (STATE.currentWord.phonetic && !existing.phonetic) existing.phonetic = STATE.currentWord.phonetic;
        if (STATE.currentWord.audio && !existing.audio) existing.audio = STATE.currentWord.audio;
        // Track multiple sources
        const newSource = document.getElementById('sourceSelect').value;
        if (!existing.sources) existing.sources = existing.source ? [existing.source] : [];
        if (newSource && !existing.sources.includes(newSource)) {
            existing.sources.push(newSource);
        }
        existing.source = existing.sources.join(', ');
        saveWords();
        showToast(`"${existing.word}" enriched with selected data!`, 'success');
        return;
    }

    const source = document.getElementById('sourceSelect').value;
    const entry = {
        word: STATE.currentWord.word,
        phonetic: STATE.currentWord.phonetic || '',
        partOfSpeech: selected.partOfSpeech || '',
        meaning: selected.meaning,
        example: selected.example,
        synonyms: selected.synonyms,
        antonyms: selected.antonyms,
        phrases: selected.phrases,
        relatedTopics: STATE._relatedTopics || [],
        audio: STATE.currentWord.audio || '',
        id: Date.now(),
        source: source,
        dateAdded: new Date().toISOString(),
        mastery: 'new',
        reviewCount: 0,
    };

    STATE.words.push(entry);
    saveWords();
    showToast(`"${entry.word}" saved to history!`, 'success');
}

// --- History ---
function updateHistoryStats() {
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

    tbody.innerHTML = filtered.map((w, i) => `
        <tr>
            <td>${i + 1}</td>
            <td><strong>${w.word}</strong></td>
            <td>
                <span class="phonetic-small">${w.phonetic || ''}</span>
                <button class="btn-icon btn-pronounce" onclick="pronounceHistoryWord('${w.word}', '${w.audio || ''}')" title="Listen">
                    <i class="fas fa-volume-up"></i>
                </button>
            </td>
            <td><span class="mastery-badge ${w.partOfSpeech}">${w.partOfSpeech}</span></td>
            <td class="td-tags">${(w.relatedTopics || []).map(t => `<span class="mini-tag topic-tag">${t}</span>`).join('') || '-'}</td>
            <td>${w.meaning}</td>
            <td><em>${w.example || '-'}</em></td>
            <td class="td-tags">${(w.phrases || []).map(p => `<span class="mini-tag phrase-tag">${p}</span>`).join('') || '-'}</td>
            <td class="td-tags">${(w.synonyms || []).map(s => `<span class="mini-tag syn-tag">${s}</span>`).join('') || '-'}</td>
            <td class="td-tags">${(w.antonyms || []).map(a => `<span class="mini-tag ant-tag">${a}</span>`).join('') || '-'}</td>
            <td>${w.sources && w.sources.length ? w.sources.map(s => `<a href="${getSourceUrl(s, w.word) || '#'}" target="_blank" class="source-link">${getSourceLabel(s)}</a>`).join(' ') : (w.source ? `<a href="${getSourceUrl(w.source, w.word) || '#'}" target="_blank" class="source-link">${getSourceLabel(w.source)}</a>` : '-')}</td>
            <td>${formatDate(w.dateAdded)}</td>
            <td><span class="mastery-badge ${w.mastery}">${w.mastery}</span></td>
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
    if (audioUrl) {
        new Audio(audioUrl).play();
    } else if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(word);
        utter.lang = 'en-US';
        speechSynthesis.speak(utter);
    }
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
    document.getElementById('editWordModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editWordModal').style.display = 'none';
    STATE.editingWordId = null;
}

function saveEditWord() {
    const word = STATE.words.find(w => w.id === STATE.editingWordId);
    if (!word) return;
    word.partOfSpeech = document.getElementById('editPartOfSpeech').value.trim();
    word.relatedTopics = document.getElementById('editRelatedTopics').value.split(',').map(s => s.trim()).filter(Boolean);
    word.meaning = document.getElementById('editMeaning').value.trim();
    word.example = document.getElementById('editExample').value.trim();
    word.phrases = document.getElementById('editPhrases').value.split(',').map(s => s.trim()).filter(Boolean);
    word.synonyms = document.getElementById('editSynonyms').value.split(',').map(s => s.trim()).filter(Boolean);
    word.antonyms = document.getElementById('editAntonyms').value.split(',').map(s => s.trim()).filter(Boolean);
    saveWords();
    closeEditModal();
    renderHistory();
    showToast(`"${word.word}" updated!`, 'success');
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
        'Phrases': (w.phrases || []).join(', '),
        'Synonyms': (w.synonyms || []).join(', '),
        'Antonyms': (w.antonyms || []).join(', '),
        'Source': w.source ? getSourceLabel(w.source) : '',
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
    document.getElementById('bulkLookupBtn').addEventListener('click', bulkLookupWords);
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
                data = await fetchWordDataFromAPI(word);
            }

            if (data) {
                const entry = {
                    id: Date.now() + Math.random(),
                    word: data.word || word,
                    phonetic: data.phonetic || data.phonetics?.[0]?.text || '',
                    partOfSpeech: data.meanings?.[0]?.partOfSpeech || '',
                    meaning: data.meanings?.[0]?.definitions?.[0]?.definition || '',
                    example: data.meanings?.[0]?.definitions?.[0]?.example || '',
                    synonyms: data.meanings?.[0]?.definitions?.[0]?.synonyms || data.meanings?.[0]?.synonyms || [],
                    antonyms: data.meanings?.[0]?.definitions?.[0]?.antonyms || data.meanings?.[0]?.antonyms || [],
                    phrases: [],
                    audio: data.phonetics?.find(p => p.audio)?.audio || '',
                    source: source,
                    sources: [source],
                    dateAdded: new Date().toISOString(),
                    mastery: 'new',
                    reviewCount: 0,
                };

                if (!STATE.words.find(w => w.word.toLowerCase() === entry.word.toLowerCase())) {
                    STATE.words.push(entry);
                    added++;
                }
            } else {
                failed++;
            }

            await new Promise(r => setTimeout(r, 350));
        } catch (e) {
            failed++;
        }
    }

    saveWords();
    renderHistory();
    progressText.textContent = `Done! Added ${added} words.${failed ? ` ${failed} not found.` : ''}`;
    progressFill.style.width = '100%';
    showToast(`Added ${added} words from ${getSourceLabel(source)}${failed ? `, ${failed} not found` : ''}`, 'success');
}

// --- Flashcards ---
function initFlashcards() {
    document.getElementById('generateCards').addEventListener('click', generateFlashcards);
    document.getElementById('fcPrev').addEventListener('click', prevCard);
    document.getElementById('fcNext').addEventListener('click', nextCard);
    document.getElementById('flashcard').addEventListener('click', flipCard);
    document.getElementById('fcPronounceUS').addEventListener('click', (e) => { e.stopPropagation(); fcPronounce('us'); });
    document.getElementById('fcPronounceUK').addEventListener('click', (e) => { e.stopPropagation(); fcPronounce('uk'); });

    document.querySelectorAll('.fc-rate').forEach(btn => {
        btn.addEventListener('click', () => rateCard(parseInt(btn.dataset.rating)));
    });

    populateFcRange();
}

function populateFcRange() {
    const fromSel = document.getElementById('fcFrom');
    const toSel = document.getElementById('fcTo');
    const count = STATE.words.length;
    fromSel.innerHTML = '';
    toSel.innerHTML = '';
    for (let i = 1; i <= count; i++) {
        fromSel.innerHTML += `<option value="${i}">${i}</option>`;
        toSel.innerHTML += `<option value="${i}">${i}</option>`;
    }
    if (count > 0) toSel.value = count;
}

function generateFlashcards() {
    if (STATE.words.length === 0) {
        showToast('No words in history! Add some words first.', 'error');
        return;
    }

    const from = parseInt(document.getElementById('fcFrom').value) || 1;
    const to = parseInt(document.getElementById('fcTo').value) || STATE.words.length;
    const shuffle = document.getElementById('shuffleCards').checked;
    const fcType = document.getElementById('fcType').value;

    let cards = STATE.words.slice(from - 1, to);
    if (shuffle) cards = shuffleArray([...cards]);

    STATE.currentFlashcards = cards;
    STATE.currentFcIndex = 0;
    STATE.fcType = fcType;

    document.getElementById('flashcardArea').classList.remove('hidden');
    document.getElementById('fcEmpty').classList.add('hidden');
    document.getElementById('fcTotal').textContent = cards.length;

    showCard(0);
}

function showCard(index) {
    const card = STATE.currentFlashcards[index];
    if (!card) return;

    STATE.currentFcIndex = index;
    document.getElementById('fcCurrent').textContent = index + 1;

    const progress = ((index + 1) / STATE.currentFlashcards.length) * 100;
    document.getElementById('fcProgressFill').style.width = progress + '%';

    // Reset flip
    document.getElementById('flashcard').classList.remove('flipped');

    const fcType = STATE.fcType || 'classic';
    const frontContent = document.getElementById('fcFrontContent');

    // Front side — the clue
    if (fcType === 'classic') {
        frontContent.innerHTML = `
            <h2 class="fc-front-word">${card.word}</h2>
            <p class="fc-front-phonetic">${card.phonetic || ''}</p>
        `;
    } else if (fcType === 'meaning') {
        frontContent.innerHTML = `
            <p class="fc-front-label">What word has this meaning?</p>
            <p class="fc-front-clue">${card.meaning}</p>
        `;
    } else if (fcType === 'fill') {
        const example = card.example || 'No example available for this word.';
        const blanked = example.replace(new RegExp(card.word, 'gi'), '________');
        frontContent.innerHTML = `
            <p class="fc-front-label">Fill in the blank:</p>
            <p class="fc-front-clue">"${blanked}"</p>
            <p class="fc-front-hint">(${card.meaning})</p>
        `;
    } else if (fcType === 'synonym') {
        const syns = (card.synonyms || []).slice(0, 3).join(', ') || 'N/A';
        const ants = (card.antonyms || []).slice(0, 3).join(', ') || 'N/A';
        frontContent.innerHTML = `
            <p class="fc-front-label">What word has these?</p>
            <p class="fc-front-clue"><strong>Synonyms:</strong> ${syns}</p>
            <p class="fc-front-clue"><strong>Antonyms:</strong> ${ants}</p>
            <p class="fc-front-hint">(${card.partOfSpeech})</p>
        `;
    }

    // Back side — always the answer (word + pronunciation + meaning + example)
    document.getElementById('fcBackWord').textContent = card.word;
    document.getElementById('fcBackPhonetic').textContent = card.phonetic || '';
    document.getElementById('fcBackPos').textContent = card.partOfSpeech;
    document.getElementById('fcBackMeaning').textContent = card.meaning;
    document.getElementById('fcBackExample').textContent = card.example || '';

    // Store audio for pronunciation
    STATE._fcCurrentAudio = card.audio || '';
    STATE._fcCurrentWord = card.word;
}

function fcPronounce(accent) {
    const audio = STATE._fcCurrentAudio;
    if (audio) {
        new Audio(audio).play().catch(() => {});
    } else if (STATE._fcCurrentWord) {
        const utterance = new SpeechSynthesisUtterance(STATE._fcCurrentWord);
        utterance.lang = accent === 'uk' ? 'en-GB' : 'en-US';
        speechSynthesis.speak(utterance);
    }
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

// --- PDF Dictionary ---
function initPdfDictionary() {
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

function updatePdfRemoveBtn() {
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

async function removePdfDictionary(id) {
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

async function searchPdfDict(source, word) {
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

// --- Utilities ---
function saveWords() {
    localStorage.setItem('vocabWords', JSON.stringify(STATE.words));
    // Debounced cloud sync
    if (STATE.userId) {
        clearTimeout(STATE._syncTimer);
        STATE._syncTimer = setTimeout(() => saveToCloud(), 2000);
    }
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

// --- Reader Module ---
function initReader() {
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
    if (STATE.readerPopupWord?.audio) {
        new Audio(STATE.readerPopupWord.audio).play();
    } else {
        const word = document.getElementById('popupWord').textContent;
        if ('speechSynthesis' in window) {
            const utter = new SpeechSynthesisUtterance(word);
            utter.lang = 'en-US';
            speechSynthesis.speak(utter);
        }
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
            <span class="meaning">${truncate(w.meaning, 25)}</span>
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
