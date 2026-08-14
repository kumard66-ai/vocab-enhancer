const fs = require('fs');

const code = fs.readFileSync('app-temp.js', 'utf8');

const sections = [
    { header: '// --- State Management ---', name: 'state' },
    { header: '// --- Initialize ---', name: 'init' },
    { header: '// --- Theme ---', name: 'theme' },
    { header: '// --- Auth & Cloud Sync ---', name: 'auth' },
    { header: '// --- Navigation ---', name: 'nav' },
    { header: '// --- Word Lookup ---', name: 'lookup' },
    { header: '// --- Source Scraping ---', name: 'scraping' },
    { header: '// --- History ---', name: 'history' },
    { header: '// --- Reader ---', name: 'reader' },
    { header: '// --- Upload ---', name: 'upload' },
    { header: '// --- Flashcards ---', name: 'flashcards' },
    { header: '// --- Quiz ---', name: 'quiz' },
    { header: '// --- Stats ---', name: 'stats' },
    { header: '// --- PDF Dictionary ---', name: 'pdf' },
    { header: '// --- Utilities ---', name: 'utils' }
];

let parts = {};
let currentPart = 'misc';
let currentLines = [];

const lines = code.split('\n');
for (const line of lines) {
    const section = sections.find(s => line.trim().startsWith(s.header));
    if (section) {
        parts[currentPart] = currentLines.join('\n');
        currentPart = section.name;
        currentLines = [];
    }
    currentLines.push(line);
}
parts[currentPart] = currentLines.join('\n');

fs.writeFileSync('src/api/dictionary.js', parts['lookup'] + '\n' + parts['scraping']);
fs.writeFileSync('src/features/history.js', parts['history']);
fs.writeFileSync('src/features/reader.js', parts['reader'] + '\n' + parts['pdf']);
fs.writeFileSync('src/features/upload.js', parts['upload']);
fs.writeFileSync('src/features/flashcards.js', parts['flashcards']);
fs.writeFileSync('src/features/quiz.js', parts['quiz']);
fs.writeFileSync('src/features/stats.js', parts['stats']);
fs.writeFileSync('src/main.js', parts['init'] + '\n' + parts['theme'] + '\n' + parts['nav']);
