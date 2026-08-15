import { searchWord } from './api/dictionary.js';
window.searchWord = searchWord;
// ===== VocabVault - Main Application =====

import { STATE, saveStateToLocal, setCloudSaveFn } from './state.js';
import { initAuth, signInWithGoogle, signOut, handleAuthChange, loadFromCloud, saveToCloud, setSyncStatus } from './services/firebase.js';

// Attach the cloud sync hook so any local saves are pushed to Firebase automatically
setCloudSaveFn(saveToCloud);
import { showToast, truncate, formatDate, shuffleArray } from './utils.js';

import { initSearch } from './api/dictionary.js';
import { initHistory, updateHistoryStats } from './features/history.js';
import { initReader, initUpload, initPdfDictionary } from './features/reader.js';
import { initFlashcards } from './features/flashcards.js';
import { initQuiz } from './features/quiz.js';
import { initGames } from './features/games.js';
import { initStats, loadWordOfTheDay, updateStreak } from './features/stats.js';

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
    initGames();
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
    if (id === 'history' && window.renderHistory) window.renderHistory();
    if (id === 'stats' && window.renderStats) window.renderStats();
}
window.showSection = showSection;

// --- Bulk Lookup Helpers ---


// --- Chrome Extension Integration ---
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'lookupWord' && request.word) {
            // Switch to lookup tab
            const lookupTab = document.querySelector('[data-section="lookup"]');
            if (lookupTab) lookupTab.click();
            
            // Set word and search
            const wordInput = document.getElementById('wordInput');
            const searchBtn = document.getElementById('searchBtn');
            if (wordInput && searchBtn) {
                wordInput.value = request.word;
                searchBtn.click();
            }
        }
    });
}

