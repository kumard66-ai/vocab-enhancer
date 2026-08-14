
import { STATE, saveStateToLocal } from '../state.js';
import { formatDate } from '../utils.js';
import { saveToCloud } from '../services/firebase.js';

// --- Stats ---
export function initStats() {
    window.renderStats = renderStats;
}

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
export function loadWordOfTheDay() {
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
export function updateStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (STATE.streak.lastDate === today) return;
    if (STATE.streak.lastDate === yesterday) {
        STATE.streak.count++;
    } else if (STATE.streak.lastDate !== today) {
        STATE.streak.count = 1;
    }
    STATE.streak.lastDate = today;
    saveStateToLocal();
}

