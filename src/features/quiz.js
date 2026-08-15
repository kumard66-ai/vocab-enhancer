
import { STATE, saveStateToLocal, saveWords } from '../state.js';
import { showToast, shuffleArray, truncate } from '../utils.js';
import { saveToCloud } from '../services/firebase.js';

// --- Quiz ---
export function initQuiz() {
    document.getElementById('startQuiz').addEventListener('click', startQuiz);
    document.getElementById('retakeQuiz').addEventListener('click', () => {
        document.getElementById('quizResults').classList.add('hidden');
        document.getElementById('quizSetup').classList.remove('hidden');
    });
    document.getElementById('nextQuestion').addEventListener('click', showNextQuestion);
    document.getElementById('nextMatchRound').addEventListener('click', () => showMatchRound(STATE.quizData.currentRound + 1));
    document.querySelectorAll('.exit-quiz-btn').forEach(btn => {
        btn.addEventListener('click', exitQuiz);
    });
}

function exitQuiz() {
    if (STATE.quizData && STATE.quizData.timer) {
        clearInterval(STATE.quizData.timer);
    }
    document.getElementById('quizArea').classList.add('hidden');
    document.getElementById('quizMatchingArea').classList.add('hidden');
    document.getElementById('quizResults').classList.add('hidden');
    document.getElementById('quizSetup').classList.remove('hidden');
}

function startQuiz() {
    if (STATE.words.length < 4) {
        showToast('Need at least 4 words in history to start a quiz!', 'error');
        return;
    }

    const type = document.getElementById('quizType').value;
    const countStr = document.getElementById('quizCount').value;
    const difficulty = document.getElementById('quizDifficulty').value;
    const snoFrom = parseInt(document.getElementById('quizSnoFrom').value) || 1;
    const snoTo = parseInt(document.getElementById('quizSnoTo').value) || STATE.words.length;
    
    // Reverse STATE.words so S.No 1 matches the top of the history list (newest first)
    let wordPool = [...STATE.words].reverse();
    wordPool = wordPool.slice(snoFrom - 1, snoTo);

    if (wordPool.length < 4) {
        showToast('Need at least 4 words in the selected range to start a quiz!', 'error');
        return;
    }

    const count = countStr === 'all' ? wordPool.length : Math.min(parseInt(countStr), wordPool.length);
    const optionsCount = difficulty === 'hard' ? 6 : 4;
    const timed = difficulty !== 'easy';

    const shuffled = shuffleArray([...wordPool]);
    
    if (type === 'match') {
        const batchSize = 5;
        const rounds = [];
        for (let i = 0; i < count; i += batchSize) {
            const batch = shuffled.slice(0, count).slice(i, i + batchSize);
            if (batch.length === 0) break;
            const leftItems = shuffleArray(batch.map(w => ({ id: w.id, text: w.word })));
            const rightItems = shuffleArray(batch.map(w => ({ id: w.id, text: truncate(w.meaning, 60) })));
            rounds.push({ left: leftItems, right: rightItems, allWords: batch });
        }
        
        STATE.quizData = { type: 'match', rounds, currentRound: 0, score: 0, totalMatches: count, matchedInRound: 0, answers: [], questions: { length: count }, timePerQ: difficulty === 'hard' ? 30 : 60, timed };
        
        document.getElementById('quizSetup').classList.add('hidden');
        document.getElementById('quizMatchingArea').classList.remove('hidden');
        document.getElementById('quizResults').classList.add('hidden');
        document.getElementById('quizMatchScore').textContent = '0 / ' + count;
        
        showMatchRound(0);
        return;
    }

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
            // safely escape word.word for regex
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            question = example.replace(new RegExp(escapeRegExp(word.word), 'gi'), '________');
            correctAnswer = word.word;
            options = shuffleArray([
                { text: word.word, correct: true },
                ...wrongOptions.map(w => ({ text: w.word, correct: false }))
            ]);
        } else {
            question = `Which word is a synonym/related to "<strong>${word.word}</strong>"?`;
            const synonymWord = word.synonyms?.[0] || (word.meaning || word.word).split(' ').slice(0, 2).join(' ');
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

function showMatchRound(index) {
    const round = STATE.quizData.rounds[index];
    STATE.quizData.currentRound = index;
    STATE.quizData.matchedInRound = 0;
    STATE.quizData.selectedLeft = null;
    STATE.quizData.selectedRight = null;

    document.getElementById('quizMatchRound').textContent = `${index + 1} / ${STATE.quizData.rounds.length}`;
    document.getElementById('nextMatchRound').classList.add('hidden');

    const leftCol = document.getElementById('matchColLeft');
    const rightCol = document.getElementById('matchColRight');

    leftCol.innerHTML = round.left.map(item => `
        <div class="match-item left-item" data-id="${item.id}">${item.text}</div>
    `).join('');

    rightCol.innerHTML = round.right.map(item => `
        <div class="match-item right-item" data-id="${item.id}">${item.text}</div>
    `).join('');

    document.querySelectorAll('.left-item').forEach(el => el.addEventListener('click', () => handleMatchClick(el, 'left')));
    document.querySelectorAll('.right-item').forEach(el => el.addEventListener('click', () => handleMatchClick(el, 'right')));
}

function handleMatchClick(el, side) {
    if (el.classList.contains('matched') || el.classList.contains('wrong-match')) return;

    document.querySelectorAll(`.${side}-item`).forEach(item => item.classList.remove('selected'));
    el.classList.add('selected');

    if (side === 'left') STATE.quizData.selectedLeft = el;
    if (side === 'right') STATE.quizData.selectedRight = el;

    checkMatch();
}

function checkMatch() {
    const left = STATE.quizData.selectedLeft;
    const right = STATE.quizData.selectedRight;
    if (!left || !right) return;

    const leftId = left.dataset.id;
    const rightId = right.dataset.id;
    const round = STATE.quizData.rounds[STATE.quizData.currentRound];
    const word = round.allWords.find(w => w.id == leftId);

    if (leftId === rightId) {
        left.classList.remove('selected');
        right.classList.remove('selected');
        left.classList.add('matched');
        right.classList.add('matched');
        STATE.quizData.selectedLeft = null;
        STATE.quizData.selectedRight = null;
        
        const alreadyWrong = STATE.quizData.answers.find(a => a.word === word.word && !a.correct);
        if (!alreadyWrong) {
            STATE.quizData.score++;
            STATE.quizData.answers.push({ word: word.word, correct: true });
        }
        
        STATE.quizData.matchedInRound++;
        document.getElementById('quizMatchScore').textContent = `${STATE.quizData.score} / ${STATE.quizData.totalMatches}`;

        if (STATE.quizData.matchedInRound === round.left.length) {
            if (STATE.quizData.currentRound < STATE.quizData.rounds.length - 1) {
                document.getElementById('nextMatchRound').classList.remove('hidden');
            } else {
                setTimeout(showQuizResults, 1000);
            }
        }
    } else {
        left.classList.remove('selected');
        right.classList.remove('selected');
        left.classList.add('wrong-match');
        right.classList.add('wrong-match');
        STATE.quizData.selectedLeft = null;
        STATE.quizData.selectedRight = null;
        
        setTimeout(() => {
            left.classList.remove('wrong-match');
            right.classList.remove('wrong-match');
        }, 500);

        const existingAnswer = STATE.quizData.answers.find(a => a.word === word.word && !a.correct);
        if (!existingAnswer) {
             STATE.quizData.answers.push({ word: word.word, correct: false });
        }
    }
}

function showNextQuestion() {
    showQuestion(STATE.quizData.current + 1);
}

function showQuizResults() {
    document.getElementById('quizArea').classList.add('hidden');
    document.getElementById('quizMatchingArea').classList.add('hidden');
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

