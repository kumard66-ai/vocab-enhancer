
import { STATE, saveStateToLocal, saveWords } from '../state.js';
import { showToast, shuffleArray } from '../utils.js';
import { saveToCloud } from '../services/firebase.js';

// --- Flashcards ---
export function initFlashcards() {
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
    const filter = document.getElementById('fcMasteryFilter') ? document.getElementById('fcMasteryFilter').value : 'all';

    let filteredWords = STATE.words;
    if (filter !== 'all') {
        filteredWords = STATE.words.filter(w => {
            const mastery = w.mastery || 'new';
            return mastery === filter;
        });
    }

    if (filteredWords.length === 0) {
        showToast('No words found for this filter.', 'warning');
        document.getElementById('flashcardArea').classList.add('hidden');
        document.getElementById('fcEmpty').classList.remove('hidden');
        return;
    }

    let cards = filteredWords.slice(from - 1, to);
    if (shuffle) cards = shuffleArray([...cards]);

    STATE.currentFlashcards = cards;
    STATE.currentFcIndex = 0;
    STATE.fcType = fcType;

    // Populate Jump dropdown
    const jumpSelect = document.getElementById('fcJumpToCard');
    if (jumpSelect) {
        jumpSelect.innerHTML = cards.map((card, i) => 
            `<option value="${i}">${i + 1}. ${card.word}</option>`
        ).join('');
    }

    document.getElementById('flashcardArea').classList.remove('hidden');
    document.getElementById('fcEmpty').classList.add('hidden');
    document.getElementById('fcTotal').textContent = cards.length;

    updateRatingCounts();
    showCard(0);
}

function updateRatingCounts() {
    let count1 = 0, count2 = 0, count3 = 0;
    if (STATE.currentFlashcards) {
        STATE.currentFlashcards.forEach(card => {
            const wordEntry = STATE.words.find(w => w.id === card.id);
            if (wordEntry) {
                if (wordEntry.mastery === 'mastered') count3++;
                else if (wordEntry.mastery === 'learning' || wordEntry.mastery === 'familiar') count2++;
                else count1++;
            } else {
                count1++;
            }
        });
    }
    const c1 = document.getElementById('fcCount1');
    const c2 = document.getElementById('fcCount2');
    const c3 = document.getElementById('fcCount3');
    if (c1) c1.textContent = count1;
    if (c2) c2.textContent = count2;
    if (c3) c3.textContent = count3;
}

function showCard(index) {
    const card = STATE.currentFlashcards[index];
    if (!card) return;

    STATE.currentFcIndex = index;
    const currentEl = document.getElementById('fcCurrent');
    if (currentEl) currentEl.textContent = index + 1;

    const progress = ((index + 1) / STATE.currentFlashcards.length) * 100;
    document.getElementById('fcProgressFill').style.width = progress + '%';

    const fcColor = document.getElementById('fcColor') ? document.getElementById('fcColor').value : 'default';
    const flashcardEl = document.getElementById('flashcard');
    const isFullscreen = flashcardEl.classList.contains('flashcard-fullscreen');
    flashcardEl.className = 'flashcard'; // Reset classes
    if (isFullscreen) flashcardEl.classList.add('flashcard-fullscreen');
    
    if (fcColor !== 'default') {
        flashcardEl.classList.add(`theme-${fcColor}`);
    }

    // Reset flip
    flashcardEl.classList.remove('flipped');

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
    } else if (fcType === 'meaning_example_fill') {
        const example = card.example || 'No example available.';
        const blankedExample = example.replace(new RegExp(card.word, 'gi'), '________');
        const meaning = card.meaning || 'No meaning available.';
        const blankedMeaning = meaning.replace(new RegExp(card.word, 'gi'), '________');
        frontContent.innerHTML = `
            <p class="fc-front-label" style="margin-bottom: 1rem;">What word matches this?</p>
            <p class="fc-front-clue" style="font-size: 1.1rem; line-height: 1.5; text-align: left;"><strong>Meaning:</strong> ${blankedMeaning}</p>
            <p class="fc-front-clue" style="font-style: italic; margin-top: 10px; text-align: left;"><strong>Example:</strong> "${blankedExample}"</p>
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

    // Extra information for the back of the card
    const extraContainer = document.getElementById('fcBackExtra');
    if (extraContainer) {
        let extraHtml = '';
        if (card.aiMnemonic) extraHtml += `<div class="fc-extra-item fc-extra-mnemonic"><strong>🧠 Mnemonic:</strong> ${card.aiMnemonic}</div>`;
        if (card.aiMeaning) extraHtml += `<div class="fc-extra-item fc-extra-meaning"><strong>📖 AI Meaning:</strong> ${card.aiMeaning}</div>`;
        if (card.synonyms && card.synonyms.length) extraHtml += `<div class="fc-extra-item fc-extra-synonyms"><strong>🔗 Synonyms:</strong> ${card.synonyms.join(', ')}</div>`;
        if (card.antonyms && card.antonyms.length) extraHtml += `<div class="fc-extra-item fc-extra-antonyms"><strong>🚫 Antonyms:</strong> ${card.antonyms.join(', ')}</div>`;
        if (card.phrases && card.phrases.length) extraHtml += `<div class="fc-extra-item fc-extra-phrases"><strong>💬 Phrases:</strong> ${card.phrases.join(', ')}</div>`;
        if (card.aiRelatedTopics) extraHtml += `<div class="fc-extra-item fc-extra-topics"><strong>🏷️ Topics:</strong> ${card.aiRelatedTopics}</div>`;
        if (card.source) extraHtml += `<div class="fc-extra-item fc-extra-source"><strong>🌐 Source:</strong> ${card.source}</div>`;
        
        extraContainer.innerHTML = extraHtml;
        extraContainer.style.display = extraHtml ? 'block' : 'none';
    }

    // Store audio for pronunciation
    STATE._fcCurrentAudio = card.audio || '';
    STATE._fcCurrentWord = card.word;

    // Update jump dropdown value
    const jumpSelect = document.getElementById('fcJumpToCard');
    if (jumpSelect) jumpSelect.value = index;

    const wordEntry = STATE.words.find(w => w.id === card.id);
    const mastery = wordEntry ? wordEntry.mastery : 'new';

    // Update highlight
    updateRatingHighlight(mastery);

    // Remove any previously injected images
    const oldImg = document.getElementById('fcInjectedImg');
    if (oldImg) oldImg.remove();

    // Render image if present
    import('../services/imageStore.js').then(({ getImage }) => {
        getImage(card.id).then(base64 => {
            if (base64) {
                // If it's the classic mode (Word -> Meaning), put it on the back, else put it on the front
                if (fcType === 'classic') {
                    // Put on the back, above the extra container
                    const imgHtml = `<img id="fcInjectedImg" src="${base64}" style="max-height: 150px; border-radius: 8px; margin-bottom: 10px; margin-top: 10px;" />`;
                    document.getElementById('fcBackExtra').insertAdjacentHTML('beforebegin', imgHtml);
                } else {
                    // Put on the front
                    const imgHtml = `<img id="fcInjectedImg" src="${base64}" style="max-height: 150px; border-radius: 8px; margin-top: 15px;" />`;
                    frontContent.insertAdjacentHTML('beforeend', imgHtml);
                }
            }
        });
    });
}

function fcPronounce(accent) {
    const audio = STATE._fcCurrentAudio;
    if (audio) {
        if (window.playAudio) {
            window.playAudio(audio, STATE._fcCurrentWord);
        } else {
            new Audio(audio).play().catch(() => {});
        }
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
        updateRatingCounts();
        updateRatingHighlight(wordEntry.mastery);
    }
}

function updateRatingHighlight(mastery) {
    // Reset all buttons
    document.querySelectorAll('.fc-rate').forEach(btn => {
        btn.style.opacity = '0.4';
        btn.style.border = 'none';
        btn.style.boxShadow = 'none';
        btn.style.transform = 'scale(0.9)';
    });

    // Highlight active button with matching colors
    let activeBtnIndex = 0; // Default: Don't know
    let activeColor = '#dc3545'; // Danger (Red)
    
    if (mastery === 'learning' || mastery === 'familiar') { 
        activeBtnIndex = 1; 
        activeColor = '#ffc107'; // Warning (Yellow)
    }
    if (mastery === 'mastered') { 
        activeBtnIndex = 2; 
        activeColor = '#198754'; // Success (Green)
    }
    
    const activeBtn = document.querySelectorAll('.fc-rate')[activeBtnIndex];
    if (activeBtn) {
        activeBtn.style.opacity = '1';
        activeBtn.style.border = `3px solid ${activeColor}`;
        activeBtn.style.boxShadow = `0 0 12px ${activeColor}`;
        activeBtn.style.transform = 'scale(1.15)';
        activeBtn.style.transition = 'all 0.2s ease-in-out';
    }

    // Give the flashcard itself a matching border for better visibility in fullscreen
    const flashcardEl = document.getElementById('flashcard');
    if (flashcardEl) {
        flashcardEl.style.border = `3px solid ${activeColor}`;
        flashcardEl.style.boxShadow = `0 0 20px ${activeColor}40`; // 40 is hex for 25% opacity
    }
}

function updateFlashcardTheme() {
    const fcColor = document.getElementById('fcColor') ? document.getElementById('fcColor').value : 'default';
    const flashcardEl = document.getElementById('flashcard');
    flashcardEl.className = 'flashcard'; // Reset classes
    if (fcColor !== 'default') {
        flashcardEl.classList.add(`theme-${fcColor}`);
    }
}

function toggleFullscreenFlashcard(e) {
    if (e) e.stopPropagation();
    const fc = document.getElementById('flashcard');
    const overlay = document.getElementById('fcOverlay');
    const controls = document.querySelector('.fc-nav');
    
    fc.classList.toggle('flashcard-fullscreen');
    overlay.classList.toggle('active');
    
    if (controls) {
        controls.classList.toggle('fc-controls-fullscreen');
    }
}

function fcLookupWord(e) {
    e.stopPropagation();
    const card = STATE.currentFlashcards[STATE.currentFcIndex];
    if (card) {
        const overlay = document.getElementById('fcOverlay');
        if (overlay && overlay.classList.contains('active')) toggleFullscreenFlashcard();
        
        const lookupTab = document.querySelector('.nav-links a[data-section="lookup"]');
        if (lookupTab) lookupTab.click();
        
        const searchInput = document.getElementById('wordInput');
        if (searchInput) searchInput.value = card.word;
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) searchBtn.click();
    }
}

function fcEditWord(e) {
    e.stopPropagation();
    const card = STATE.currentFlashcards[STATE.currentFcIndex];
    if (card) {
        if (window.openEditModal) {
            window.openEditModal(card.id);
        }
    }
}

function fcDeleteWord(e) {
    e.stopPropagation();
    const card = STATE.currentFlashcards[STATE.currentFcIndex];
    if (card && confirm(`Are you sure you want to delete "${card.word}"?`)) {
        const idx = STATE.words.findIndex(w => w.id === card.id);
        if (idx !== -1) {
            STATE.words.splice(idx, 1);
            saveWords();
            STATE.currentFlashcards.splice(STATE.currentFcIndex, 1);
            if (STATE.currentFlashcards.length === 0) {
                document.getElementById('flashcardArea').classList.add('hidden');
                document.getElementById('fcEmpty').classList.remove('hidden');
            } else {
                if (STATE.currentFcIndex >= STATE.currentFlashcards.length) {
                    STATE.currentFcIndex = STATE.currentFlashcards.length - 1;
                }
                showCard(STATE.currentFcIndex);
            }
        }
    }
}

// Make globally available for inline handlers
window.updateFlashcardTheme = updateFlashcardTheme;
window.toggleFullscreenFlashcard = toggleFullscreenFlashcard;
window.fcLookupWord = fcLookupWord;
window.fcEditWord = fcEditWord;
window.fcDeleteWord = fcDeleteWord;

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    const fcArea = document.getElementById('flashcardArea');
    if (!fcArea || fcArea.classList.contains('hidden')) return;
    
    // Ignore if typing in an input/textarea (like edit modal or the jump to select)
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.code === 'Escape') {
        const fcOverlay = document.getElementById('fcOverlay');
        if (fcOverlay && fcOverlay.classList.contains('active')) {
            toggleFullscreenFlashcard();
        }
        return;
    }

    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        flipCard();
    } else if (e.code === 'ArrowLeft') {
        prevCard();
    } else if (e.code === 'ArrowRight') {
        nextCard();
    } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
        rateCard(1); // Don't Know
    } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        rateCard(2); // Learning
    } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        rateCard(3); // Mastered
    }
});

// Add jump to card listener
document.addEventListener('DOMContentLoaded', () => {
    const jumpSelect = document.getElementById('fcJumpToCard');
    if (jumpSelect) {
        jumpSelect.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value);
            if (!isNaN(idx) && idx >= 0 && idx < STATE.currentFlashcards.length) {
                STATE.currentFcIndex = idx;
                showCard(idx);
            }
        });
    }
});

