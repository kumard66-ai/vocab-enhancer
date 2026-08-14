import { STATE } from '../state.js';

let hangmanWord = '';
let hangmanMeaning = '';
let guessedLetters = new Set();
let lives = 6;
let score = 0;

export function initGames() {
    const startBtn = document.getElementById('startHangmanBtn');
    const nextBtn = document.getElementById('nextHangmanBtn');
    const quitBtn = document.getElementById('quitHangmanBtn');
    
    if (startBtn) startBtn.addEventListener('click', startHangman);
    if (nextBtn) nextBtn.addEventListener('click', startHangman);
    if (quitBtn) quitBtn.addEventListener('click', quitHangman);
}

function startHangman() {
    const snoFrom = parseInt(document.getElementById('hangmanSnoFrom').value) || 1;
    const snoTo = parseInt(document.getElementById('hangmanSnoTo').value) || STATE.words.length;
    
    let wordPool = [...STATE.words].slice(snoFrom - 1, snoTo);

    if (wordPool.length === 0) {
        alert("You need to save some words to your history (in this range) first!");
        return;
    }

    // Only use words that don't have spaces or hyphens for simplicity
    const cleanWords = wordPool.filter(w => !w.word.includes(' ') && !w.word.includes('-'));
    
    if (cleanWords.length === 0) {
        alert("No suitable words found in this range (without spaces/hyphens).");
        return;
    }

    // Pick a random word
    const targetObj = cleanWords[Math.floor(Math.random() * cleanWords.length)];
    
    hangmanWord = targetObj.word.toUpperCase();
    hangmanMeaning = targetObj.meaning || "No meaning provided.";
    guessedLetters.clear();
    lives = 6;

    document.getElementById('hangmanSetup').style.display = 'none';
    document.getElementById('hangmanGame').style.display = 'block';
    document.getElementById('hangmanResult').style.display = 'none';
    
    document.getElementById('hangmanHint').textContent = hangmanMeaning;
    
    updateHangmanDisplay();
    renderKeyboard();
}

function updateHangmanDisplay() {
    document.getElementById('hangmanLives').textContent = `Lives: ${lives}`;
    document.getElementById('hangmanScore').textContent = `Score: ${score}`;
    
    const displayArr = hangmanWord.split('').map(char => {
        if (guessedLetters.has(char)) return char;
        return '_';
    });
    
    document.getElementById('hangmanWordDisplay').textContent = displayArr.join(' ');
    
    checkWinLoss();
}

function renderKeyboard() {
    const keyboard = document.getElementById('hangmanKeyboard');
    keyboard.innerHTML = '';
    
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.textContent = letter;
        btn.className = 'btn btn-outline';
        btn.style.width = '40px';
        btn.style.height = '40px';
        btn.style.padding = '0';
        btn.style.fontWeight = 'bold';
        
        if (guessedLetters.has(letter)) {
            btn.disabled = true;
            if (hangmanWord.includes(letter)) {
                btn.classList.add('btn-success');
                btn.classList.remove('btn-outline');
            } else {
                btn.classList.add('btn-secondary');
                btn.classList.remove('btn-outline');
                btn.style.opacity = '0.5';
            }
        } else {
            btn.addEventListener('click', () => handleGuess(letter));
        }
        
        keyboard.appendChild(btn);
    });
}

function handleGuess(letter) {
    if (lives <= 0 || isGameWon()) return;
    
    guessedLetters.add(letter);
    
    if (!hangmanWord.includes(letter)) {
        lives--;
    }
    
    updateHangmanDisplay();
    renderKeyboard();
}

function isGameWon() {
    return hangmanWord.split('').every(char => guessedLetters.has(char));
}

function checkWinLoss() {
    const resultDiv = document.getElementById('hangmanResult');
    const msg = document.getElementById('hangmanResultMessage');
    const resultWord = document.getElementById('hangmanResultWord');
    
    if (isGameWon()) {
        score += 10;
        document.getElementById('hangmanScore').textContent = `Score: ${score}`;
        msg.textContent = "🎉 You Won!";
        msg.style.color = "var(--success)";
        resultWord.textContent = `The word was: ${hangmanWord}`;
        resultDiv.style.display = 'block';
    } else if (lives <= 0) {
        score = 0; // reset score on loss
        document.getElementById('hangmanScore').textContent = `Score: ${score}`;
        msg.textContent = "💀 Game Over";
        msg.style.color = "var(--danger)";
        resultWord.textContent = `The word was: ${hangmanWord}`;
        resultDiv.style.display = 'block';
    }
}

function quitHangman() {
    document.getElementById('hangmanGame').style.display = 'none';
    document.getElementById('hangmanSetup').style.display = 'block';
    score = 0;
}
