export const STATE = {
    words: JSON.parse(localStorage.getItem('vocabWords') || '[]'),
    streak: JSON.parse(localStorage.getItem('vocabStreak') || '{"count":0,"lastDate":""}'),
    theme: localStorage.getItem('vocabTheme') || 'light',
    llmSettings: JSON.parse(localStorage.getItem('vocabLlmSettings') || '{"mode":"ai","provider":"gemini-3.6-flash","apiKey":"","customUrl":""}'),
    currentFlashcards: [],
    currentFcIndex: 0,
    quizData: null,
    lastBulkResults: [], // Holds the results of the last bulk lookup
};

export function saveStateToLocal() {
    localStorage.setItem('vocabWords', JSON.stringify(STATE.words));
    localStorage.setItem('vocabStreak', JSON.stringify(STATE.streak));
    localStorage.setItem('vocabLlmSettings', JSON.stringify(STATE.llmSettings));
}

export const saveWords = saveStateToLocal;
