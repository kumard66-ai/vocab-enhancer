
import { STATE, saveStateToLocal, saveWords } from '../state.js';
import { showToast, shuffleArray } from '../utils.js';
import { saveToCloud } from '../services/firebase.js';

// --- Quiz ---
export function initQuiz() {
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
    const snoFrom = parseInt(document.getElementById('quizSnoFrom').value) || 1;
    const snoTo = parseInt(document.getElementById('quizSnoTo').value) || STATE.words.length;
    
    let wordPool = [...STATE.words];
    // Filter by S.No (Note: STATE.words is typically reversed or needs sorting? 
    // In history.js, S.No is based on chronological order or displayed order.
    // Assuming S.No is the index in the original STATE.words array: 1 to length.)
    wordPool = wordPool.slice(snoFrom - 1, snoTo);

    if (wordPool.length < 4) {
        showToast('Need at least 4 words in the selected range to start a quiz!', 'error');
        return;
    }

    const count = countStr === 'all' ? wordPool.length : Math.min(parseInt(countStr), wordPool.length);
    const optionsCount = difficulty === 'hard' ? 6 : 4;
    const timed = difficulty !== 'easy';

    const shuffled = shuffleArray([...wordPool]);
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

