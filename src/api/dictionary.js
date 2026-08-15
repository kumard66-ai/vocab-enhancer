import { STATE, saveStateToLocal, saveWords } from '../state.js';
import { showToast, truncate } from '../utils.js';
import { searchPdfDict, updatePdfRemoveBtn, removePdfDictionary } from '../features/reader.js'; // Will be defined later
import { saveToCloud } from '../services/firebase.js';

// --- Word Lookup ---
export function initSearch() {
    const input = document.getElementById('wordInput');
    const btn = document.getElementById('searchBtn');
    const openBtn = document.getElementById('openSourceBtn');
    const sourceSelect = document.getElementById('sourceSelect');

    btn.addEventListener('click', () => searchWord(input.value.trim()));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchWord(input.value.trim());
    });

    // AI UI Bindings
    const llmSettingsBtn = document.getElementById('llmSettingsBtn');
    function setupLlmSettingsModal() {
        const llmSettingsModal = document.getElementById('llmSettingsModal');
        const closeLlmSettingsBtn = document.getElementById('closeLlmSettingsBtn');
        const cancelLlmSettingsBtn = document.getElementById('cancelLlmSettingsBtn');
        const saveLlmSettingsBtn = document.getElementById('saveLlmSettingsBtn');
        const llmProviderSelect = document.getElementById('llmProviderSelect');
        const llmCustomUrlGroup = document.getElementById('llmCustomUrlGroup');
        
        // Load saved settings
        if (STATE.llmSettings) {
            if (STATE.llmSettings.provider) llmProviderSelect.value = STATE.llmSettings.provider;
            if (STATE.llmSettings.modelName) document.getElementById('llmModelName').value = STATE.llmSettings.modelName;
            if (STATE.llmSettings.apiKey) document.getElementById('llmApiKey').value = STATE.llmSettings.apiKey;
            if (STATE.llmSettings.customUrl) document.getElementById('llmCustomUrl').value = STATE.llmSettings.customUrl;
        }
        
        llmProviderSelect.addEventListener('change', () => {
            llmCustomUrlGroup.style.display = llmProviderSelect.value === 'custom' ? 'block' : 'none';
        });
        // trigger initial state
        llmCustomUrlGroup.style.display = llmProviderSelect.value === 'custom' ? 'block' : 'none';

        const closeLlmModal = () => { llmSettingsModal.style.display = 'none'; };
        llmSettingsBtn.addEventListener('click', () => { llmSettingsModal.style.display = 'flex'; });
        closeLlmSettingsBtn.addEventListener('click', closeLlmModal);
        cancelLlmSettingsBtn.addEventListener('click', closeLlmModal);
        saveLlmSettingsBtn.addEventListener('click', () => {
            STATE.llmSettings = {
                mode: 'ai',
                provider: llmProviderSelect.value,
                modelName: document.getElementById('llmModelName').value.trim(),
                apiKey: document.getElementById('llmApiKey').value,
                customUrl: document.getElementById('llmCustomUrl').value
            };
            saveStateToLocal();

            showToast('AI Settings saved successfully');
            closeLlmModal();
        });
    }
    setupLlmSettingsModal();

    // Check AI key on load
    if (!STATE.llmSettings || !STATE.llmSettings.apiKey) {
        showToast('Please configure your AI API key in Settings (Gear Icon)', 'warning');
    }
    openBtn.addEventListener('click', openInSource);
    document.getElementById('saveWordBtn').addEventListener('click', saveCurrentWord);
    document.getElementById('pronounceBtn').addEventListener('click', pronounceWord);
    initCustomSources();
    initAutocomplete(input);
}

export function initAutocomplete(input) {
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

    let html = null;
    try {
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(12000) });
        if (res.ok) {
            html = await res.text();
        }
    } catch (e) {
        console.error("Proxy fetch error:", e);
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
            meanings.push({ partOfSpeech: pos, definitions: [{ definition, example: examples.join(' \n\n ') }] });
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
            meanings.push({ partOfSpeech: pos, definitions: [{ definition, example: examples.join(' \n\n ') }] });
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
            meanings.push({ partOfSpeech: pos, definitions: [{ definition, example: examples.join(' \n\n ') }] });
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
                meanings.push({ partOfSpeech: label, definitions: [{ definition, example: examples.join(' \n\n ') }] });
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
                meanings.push({ partOfSpeech: pos, definitions: [{ definition, example: examples.join(' \n\n ') }] });
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
                        lastMeaning.definitions[0].example += ' ? ' + t;
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
            let exampleText = examples.join(' \n\n ');
            if (types.length) {
                exampleText += (exampleText ? ' ? ' : '') + 'Types: ' + types.join('; ');
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
                pronHtml += ` <button class="btn-icon btn-pron" onclick="playAudio('${pron.uk.audio}', '${data.word}')" title="British pronunciation"><i class="fas fa-volume-up"></i></button>`;
            }
            pronHtml += `</span>`;
        }
        if (pron.us.ipa) {
            pronHtml += `<span class="pron-variant"><span class="pron-label">US</span> /${pron.us.ipa}/`;
            if (pron.us.audio) {
                pronHtml += ` <button class="btn-icon btn-pron" onclick="playAudio('${pron.us.audio}', '${data.word}')" title="American pronunciation"><i class="fas fa-volume-up"></i></button>`;
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
                pronHtml += ` <button class="btn-icon btn-pron" onclick="playAudio('${ukEntry.audio}', '${data.word}')" title="British pronunciation"><i class="fas fa-volume-up"></i></button></span>`;
            }
            if (usEntry) {
                pronHtml += `<span class="pron-variant"><span class="pron-label">US</span> ${usEntry.text || data.phonetic || ''}`;
                pronHtml += ` <button class="btn-icon btn-pron" onclick="playAudio('${usEntry.audio}', '${data.word}')" title="American pronunciation"><i class="fas fa-volume-up"></i></button></span>`;
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

    // Trigger AI Generation if enabled
    const aiBlock = document.getElementById('aiResultBlock');
    if (STATE.llmSettings && STATE.llmSettings.apiKey) {
        aiBlock.classList.remove('hidden');
        document.getElementById('aiLoadingSpinner').classList.remove('hidden');
        document.getElementById('aiMnemonic').textContent = 'Generating...';
        document.getElementById('aiExamples').innerHTML = '';

        generateAIContext({
            provider: STATE.llmSettings.provider,
            modelName: STATE.llmSettings.modelName,
            apiKey: STATE.llmSettings.apiKey,
            customUrl: STATE.llmSettings.customUrl,
            word: data.word,
            meanings: data.meanings
        })
        .then(aiData => {
            document.getElementById('aiLoadingSpinner').classList.add('hidden');
            if (aiData.error) {
                document.getElementById('aiMnemonic').textContent = 'AI Error: ' + aiData.error;
            } else {
                let aiHtml = `<p><strong>Mnemonic:</strong> ${aiData.mnemonic}</p>`;
                if (aiData.pronunciation) aiHtml += `<p style="margin-top: 8px;"><strong>Pronunciation:</strong> ${aiData.pronunciation}</p>`;
                if (aiData.meaning) aiHtml += `<p style="margin-top: 8px;"><strong>Meaning:</strong> ${aiData.meaning}</p>`;
                if (aiData.phrases) aiHtml += `<p style="margin-top: 8px;"><strong>Phrases:</strong> ${aiData.phrases}</p>`;
                if (aiData.synonyms) aiHtml += `<p style="margin-top: 8px;"><strong>Synonyms:</strong> ${aiData.synonyms}</p>`;
                if (aiData.antonyms) aiHtml += `<p style="margin-top: 8px;"><strong>Antonyms:</strong> ${aiData.antonyms}</p>`;
                if (aiData.relatedTopics) aiHtml += `<p style="margin-top: 8px;"><strong>Related Topics:</strong> ${aiData.relatedTopics}</p>`;
                
                document.getElementById('aiMnemonic').innerHTML = aiHtml;
                document.getElementById('aiExamples').innerHTML = aiData.examples.map(ex => `<span class="tag tag-selectable selected" data-save-type="ai_ex" data-value="${ex}" onclick="toggleTagSelect(this)">${ex}</span>`).join('');
                STATE.currentWord.aiMnemonic = aiData.mnemonic;
                STATE.currentWord.aiPronunciation = aiData.pronunciation;
                STATE.currentWord.aiMeaning = aiData.meaning;
                STATE.currentWord.aiPhrases = aiData.phrases;
                STATE.currentWord.aiSynonyms = aiData.synonyms;
                STATE.currentWord.aiAntonyms = aiData.antonyms;
                STATE.currentWord.aiRelatedTopics = aiData.relatedTopics;
                STATE.currentWord.aiExamples = aiData.examples;
            }
        })
        .catch(err => {
            document.getElementById('aiLoadingSpinner').classList.add('hidden');
            document.getElementById('aiMnemonic').textContent = 'AI Request failed.';
        });
    } else {
        aiBlock.classList.add('hidden');
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

    // Get selected synonyms/antonyms/phrases/ai_examples
    const synonyms = [...document.querySelectorAll('[data-save-type="syn"].selected')].map(el => el.dataset.value);
    const antonyms = [...document.querySelectorAll('[data-save-type="ant"].selected')].map(el => el.dataset.value);
    const phrases = [...document.querySelectorAll('[data-save-type="phrase"].selected')].map(el => el.dataset.value);
    const aiExamples = [...document.querySelectorAll('[data-save-type="ai_ex"].selected')].map(el => el.dataset.value);

    return {
        meaning: meanings.join(' \n\n '),
        example: examples.concat(aiExamples).join(' \n\n '),
        synonyms,
        antonyms,
        phrases,
        partOfSpeech: STATE._allDefs.find((_, i) => document.querySelector(`[data-def-idx="${i}"]:checked`))?.pos || '',
    };
}

function pronounceWord() {
    const audioUrl = document.getElementById('pronounceBtn').dataset.audio;
    const word = document.getElementById('resultWord').textContent;
    playAudio(audioUrl, word);
}

function playAudio(audioUrl, word) {
    if (audioUrl && audioUrl !== 'undefined' && audioUrl !== 'null' && audioUrl.length > 5) {
        const audio = new Audio(audioUrl);
        audio.play().catch(err => {
            console.warn('Audio play failed, falling back to synthesis:', err);
            fallbackSynthesisDict(word);
        });
    } else {
        fallbackSynthesisDict(word);
    }
}

function fallbackSynthesisDict(word) {
    if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(word);
        utter.lang = 'en-US';
        speechSynthesis.speak(utter);
    } else {
        showToast('Audio not available for this word', 'error');
    }
}

// Export for global inline use
window.playAudio = playAudio;

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

    if (!selected.meaning && !selected.example && !selected.synonyms.length && !selected.antonyms.length && !selected.phrases.length && !STATE.currentWord.aiMnemonic) {
        showToast('Select at least one item or wait for AI to generate content!', 'error');
        return;
    }

    const existing = STATE.words.find(w => w.word.toLowerCase() === STATE.currentWord.word.toLowerCase());

    if (existing) {
        // Merge selected data into existing entry
        if (selected.meaning && !existing.meaning?.includes(selected.meaning.slice(0, 30))) {
            existing.meaning = (existing.meaning ? existing.meaning + ' <br/><br/> ' : '') + selected.meaning;
        }
        if (STATE.currentWord.aiMeaning && !existing.meaning?.includes('AI source:')) {
            existing.meaning = (existing.meaning ? existing.meaning + ' <br/><br/> ' : '') + '<strong>AI source:</strong> ' + STATE.currentWord.aiMeaning;
        }

        if (selected.example && !existing.example?.includes(selected.example.slice(0, 30))) {
            existing.example = (existing.example ? existing.example + ' <br/><br/> ' : '') + selected.example;
        }
        if (STATE.currentWord.aiExamples && STATE.currentWord.aiExamples.length > 0 && !existing.example?.includes('AI source:')) {
            existing.example = (existing.example ? existing.example + ' <br/><br/> ' : '') + '<strong>AI source:</strong> ' + STATE.currentWord.aiExamples.join(' | ');
        }

        const mergeUnique = (arr1, arr2) => [...new Set([...(arr1 || []), ...(arr2 || [])])];
        
        let newSynonyms = [...selected.synonyms];
        if (STATE.currentWord.aiSynonyms && !(existing.synonyms || []).some(s => s.includes('AI source:'))) {
            newSynonyms.push('<strong>AI source:</strong> ' + STATE.currentWord.aiSynonyms);
        }
        existing.synonyms = mergeUnique(existing.synonyms, newSynonyms);

        let newAntonyms = [...selected.antonyms];
        if (STATE.currentWord.aiAntonyms && !(existing.antonyms || []).some(a => a.includes('AI source:'))) {
            newAntonyms.push('<strong>AI source:</strong> ' + STATE.currentWord.aiAntonyms);
        }
        existing.antonyms = mergeUnique(existing.antonyms, newAntonyms);

        let newPhrases = [...selected.phrases];
        if (STATE.currentWord.aiPhrases && !(existing.phrases || []).some(p => p.includes('AI source:'))) {
            newPhrases.push('<strong>AI source:</strong> ' + STATE.currentWord.aiPhrases);
        }
        existing.phrases = mergeUnique(existing.phrases, newPhrases);

        let newRelatedTopics = [...(STATE._relatedTopics || [])];
        if (STATE.currentWord.aiRelatedTopics && !(existing.relatedTopics || []).some(rt => rt.includes('AI source:'))) {
            newRelatedTopics.push('<strong>AI source:</strong> ' + STATE.currentWord.aiRelatedTopics);
        }
        existing.relatedTopics = mergeUnique(existing.relatedTopics, newRelatedTopics);
        
        if (STATE.currentWord.aiPronunciation && !(existing.phonetic || '').includes('AI source:')) {
            existing.phonetic = (existing.phonetic ? existing.phonetic + ' <br/><br/> ' : '') + '<strong>AI source:</strong> ' + STATE.currentWord.aiPronunciation;
        } else if (STATE.currentWord.phonetic && !existing.phonetic) {
            existing.phonetic = STATE.currentWord.phonetic;
        }
        
        if (STATE.currentWord.audio && !existing.audio) existing.audio = STATE.currentWord.audio;
        if (STATE.currentWord.aiMnemonic && !existing.aiMnemonic) existing.aiMnemonic = STATE.currentWord.aiMnemonic;
        // Track multiple sources
        const newSource = document.getElementById('sourceSelect').value;
        if (!existing.sources) existing.sources = existing.source ? [existing.source] : [];
        if (newSource && !existing.sources.includes(newSource)) {
            existing.sources.push(newSource);
        }
        existing.source = existing.sources.join(', ');
        saveWords();
        showToast(`"${existing.word}" enriched with selected data and AI context!`, 'success');
        return;
    }

    let meaning = selected.meaning || '';
    if (STATE.currentWord.aiMeaning) {
        meaning = (meaning ? meaning + ' <br/><br/> ' : '') + '<strong>AI source:</strong> ' + STATE.currentWord.aiMeaning;
    }
    let example = selected.example || '';
    if (STATE.currentWord.aiExamples && STATE.currentWord.aiExamples.length > 0) {
        example = (example ? example + ' <br/><br/> ' : '') + '<strong>AI source:</strong> ' + STATE.currentWord.aiExamples.join(' | ');
    }

    const synonyms = [...(selected.synonyms || [])];
    if (STATE.currentWord.aiSynonyms) synonyms.push('<strong>AI source:</strong> ' + STATE.currentWord.aiSynonyms);

    const antonyms = [...(selected.antonyms || [])];
    if (STATE.currentWord.aiAntonyms) antonyms.push('<strong>AI source:</strong> ' + STATE.currentWord.aiAntonyms);

    const phrases = [...(selected.phrases || [])];
    if (STATE.currentWord.aiPhrases) phrases.push('<strong>AI source:</strong> ' + STATE.currentWord.aiPhrases);

    const relatedTopics = [...(STATE._relatedTopics || [])];
    if (STATE.currentWord.aiRelatedTopics) relatedTopics.push('<strong>AI source:</strong> ' + STATE.currentWord.aiRelatedTopics);

    let phonetic = STATE.currentWord.phonetic || selected.phonetic || '';
    if (STATE.currentWord.aiPronunciation) {
        phonetic = (phonetic ? phonetic + ' <br/><br/> ' : '') + '<strong>AI source:</strong> ' + STATE.currentWord.aiPronunciation;
    }

    const source = document.getElementById('sourceSelect').value;
    const entry = {
        word: STATE.currentWord.word,
        phonetic: phonetic,
        partOfSpeech: selected.partOfSpeech || '',
        meaning: meaning,
        example: example,
        synonyms: synonyms,
        antonyms: antonyms,
        phrases: phrases,
        relatedTopics: relatedTopics,
        audio: STATE.currentWord.audio || '',
        aiMnemonic: STATE.currentWord.aiMnemonic || '',
        id: Date.now(),
        source: source,
        dateAdded: new Date().toISOString(),
        mastery: 'new',
        reviewCount: 0,
    };

    STATE.words.push(entry);
    saveWords();
    showToast(`"${entry.word}" saved to history with AI context!`, 'success');
}

async function generateAIContext(params) {
    const { provider = 'gemini-1.5-flash', modelName: customModelName, apiKey, customUrl, word, meanings } = params;
    
    if (!provider || !apiKey || !word) {
        return { error: `Missing parameters (provider:${!!provider}, apiKey:${!!apiKey}, word:${!!word})` };
    }

    const meaningsText = meanings.map(m => m.definitions[0]?.definition).join('; ');
    const prompt = `I am learning the English word "${word}". Here are its definitions from the dictionary: ${meaningsText}.
Please provide the following to help me learn this word deeply:
1. A clever mnemonic or memory hook to help me remember this word.
2. A clear and concise meaning or definition of the word.
3. Two unique, natural example sentences using the word.
4. 2 to 3 common phrases, idioms, or collocations using this word.
5. A list of 3 synonyms for the word.
6. A list of 3 antonyms for the word.
7. A list of 3 to 5 related topics, fields, or categories the word belongs to.
8. The word's pronunciation and its syllable breakdown (breaking the spelling into parts for easy pronunciation).

Format your response exactly like this:
Mnemonic: [your mnemonic here]
Pronunciation: [pronunciation here]
Meaning: [your meaning here]
Examples: [example 1] | [example 2]
Phrases: [phrase 1], [phrase 2], [phrase 3]
Synonyms: [syn 1], [syn 2], [syn 3]
Antonyms: [ant 1], [ant 2], [ant 3]
Related Topics: [topic 1], [topic 2], [topic 3]`;

    try {
        let result = '';

        if (provider.startsWith('gemini')) {
            let modelName = 'gemini-1.5-flash-latest';
            if (provider === 'gemini-3.5-flash-lite') modelName = 'gemini-3.5-flash-lite';
            else if (provider === 'gemini-3.7-flash') modelName = 'gemini-3.7-flash';
            else if (provider === 'gemini-3.1-pro') modelName = 'gemini-3.1-pro';
            else if (provider === 'gemini-1.5-pro') modelName = 'gemini-1.5-pro-latest';
            else if (provider === 'gemini-1.5-flash-8b') modelName = 'gemini-1.5-flash-8b-latest';
            
            // Allow user override
            if (customModelName && customModelName.trim() !== '') {
                modelName = customModelName.trim();
            }
            
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'Gemini API Error');
            result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        } else if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'OpenAI API Error');
            result = data.choices?.[0]?.message?.content || '';

        } else if (provider === 'custom') {
            const url = customUrl || 'http://localhost:11434/v1/chat/completions';
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'Custom API Error');
            result = data.choices?.[0]?.message?.content || '';
        } else {
            return { error: 'Unknown provider' };
        }

        const lines = result.split('\n');
        let mnemonic = '';
        let pronunciation = '';
        let meaning = '';
        let phrases = '';
        let synonyms = '';
        let antonyms = '';
        let relatedTopics = '';
        let examples = [];

        for (const line of lines) {
            if (line.toLowerCase().startsWith('mnemonic:')) {
                mnemonic = line.substring(9).trim();
            } else if (line.toLowerCase().startsWith('pronunciation:')) {
                pronunciation = line.substring(14).trim();
            } else if (line.toLowerCase().startsWith('meaning:')) {
                meaning = line.substring(8).trim();
            } else if (line.toLowerCase().startsWith('phrases:')) {
                phrases = line.substring(8).trim();
            } else if (line.toLowerCase().startsWith('synonyms:')) {
                synonyms = line.substring(9).trim();
            } else if (line.toLowerCase().startsWith('antonyms:')) {
                antonyms = line.substring(9).trim();
            } else if (line.toLowerCase().startsWith('related topics:')) {
                relatedTopics = line.substring(15).trim();
            } else if (line.toLowerCase().startsWith('examples:')) {
                const exString = line.substring(9).trim();
                examples = exString.split('|').map(e => e.trim()).filter(e => e.length > 0);
            } else if (line.toLowerCase().startsWith('example')) {
                const parts = line.split(':');
                if (parts.length > 1) {
                    examples.push(parts.slice(1).join(':').trim());
                }
            }
        }

        return { mnemonic, pronunciation, meaning, phrases, synonyms, antonyms, relatedTopics, examples };

    } catch (error) {
        console.error('AI error:', error);
        return { error: error.message };
    }
}

export {
    searchWord,
    fetchWordDataFromAPI,
    fetchWordData,
    scrapeFromSource,
    parseCambridge,
    parseOxford,
    parseLongman,
    parseMerriam,
    parseVocabulary,
    buildStandardResult,
    getSourceUrl,
    getSourceLabel
};
