
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

    const fcColor = document.getElementById('fcColor') ? document.getElementById('fcColor').value : 'default';
    const flashcardEl = document.getElementById('flashcard');
    flashcardEl.className = 'flashcard'; // Reset classes
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
        if (card.aiMnemonic) extraHtml += `<p style="margin-bottom: 5px;"><strong>🧠 Mnemonic:</strong> ${card.aiMnemonic}</p>`;
        if (card.aiMeaning) extraHtml += `<p style="margin-bottom: 5px;"><strong>📖 AI Meaning:</strong> ${card.aiMeaning}</p>`;
        if (card.synonyms && card.synonyms.length) extraHtml += `<p style="margin-bottom: 5px;"><strong>🔗 Synonyms:</strong> ${card.synonyms.join(', ')}</p>`;
        if (card.antonyms && card.antonyms.length) extraHtml += `<p style="margin-bottom: 5px;"><strong>🚫 Antonyms:</strong> ${card.antonyms.join(', ')}</p>`;
        if (card.phrases && card.phrases.length) extraHtml += `<p style="margin-bottom: 5px;"><strong>💬 Phrases:</strong> ${card.phrases.join(', ')}</p>`;
        if (card.aiRelatedTopics) extraHtml += `<p style="margin-bottom: 5px;"><strong>🏷️ Topics:</strong> ${card.aiRelatedTopics}</p>`;
        if (card.source) extraHtml += `<p style="margin-bottom: 5px;"><strong>🌐 Source:</strong> ${card.source}</p>`;
        
        extraContainer.innerHTML = extraHtml;
        extraContainer.style.display = extraHtml ? 'block' : 'none';
    }

    // Store audio for pronunciation
    STATE._fcCurrentAudio = card.audio || '';
    STATE._fcCurrentWord = card.word;
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
    }
    nextCard();
}

function updateFlashcardTheme() {
    const fcColor = document.getElementById('fcColor') ? document.getElementById('fcColor').value : 'default';
    const flashcardEl = document.getElementById('flashcard');
    flashcardEl.className = 'flashcard'; // Reset classes
    if (fcColor !== 'default') {
        flashcardEl.classList.add(`theme-${fcColor}`);
    }
}

// Make it globally available for the inline onchange handler
window.updateFlashcardTheme = updateFlashcardTheme;

