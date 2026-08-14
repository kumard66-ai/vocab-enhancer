const fs = require('fs');

let mainCode = fs.readFileSync('src/main.js', 'utf8');
const lines = mainCode.split('\n');

function getBlock(startMarker, endMarker) {
    const start = lines.findIndex(l => l.includes(startMarker));
    const end = endMarker ? lines.findIndex((l, i) => i > start && l.includes(endMarker)) : lines.length;
    return lines.slice(start, end).join('\n');
}

function removeBlock(startMarker, endMarker) {
    const start = lines.findIndex(l => l.includes(startMarker));
    const end = endMarker ? lines.findIndex((l, i) => i > start && l.includes(endMarker)) : lines.length;
    lines.splice(start, end - start);
}

// 1. Reader
const fileUpload = getBlock('// --- File Upload ---', '// --- Bulk Lookup Helpers ---');
removeBlock('// --- File Upload ---', '// --- Bulk Lookup Helpers ---');

const pdfDict = getBlock('// --- PDF Dictionary ---', '// --- Reader Module ---');
removeBlock('// --- PDF Dictionary ---', '// --- Reader Module ---');

const readerMod = getBlock('// --- Reader Module ---', '// --- Reader Selection & Popup ---');
removeBlock('// --- Reader Module ---', '// --- Reader Selection & Popup ---');

const readerSel = getBlock('// --- Reader Selection & Popup ---', null); // till end
removeBlock('// --- Reader Selection & Popup ---', null);

const readerContent = `
import { STATE, saveStateToLocal } from '../state.js';
import { showToast, truncate } from '../utils.js';
import { searchWord } from '../api/dictionary.js';
import { saveToCloud } from '../services/firebase.js';

${fileUpload}
${pdfDict}
${readerMod}
${readerSel}
`;
fs.writeFileSync('src/features/reader.js', readerContent);

// 2. Flashcards
const flashcards = getBlock('// --- Flashcards ---', '// --- Quiz ---');
removeBlock('// --- Flashcards ---', '// --- Quiz ---');
const flashcardsContent = `
import { STATE, saveStateToLocal } from '../state.js';
import { showToast, shuffleArray } from '../utils.js';
import { saveToCloud } from '../services/firebase.js';

${flashcards}
`;
fs.writeFileSync('src/features/flashcards.js', flashcardsContent);

// 3. Quiz
const quiz = getBlock('// --- Quiz ---', '// --- Stats ---');
removeBlock('// --- Quiz ---', '// --- Stats ---');
const quizContent = `
import { STATE, saveStateToLocal } from '../state.js';
import { showToast, shuffleArray } from '../utils.js';
import { saveToCloud } from '../services/firebase.js';

${quiz}
`;
fs.writeFileSync('src/features/quiz.js', quizContent);

// 4. Stats
const stats = getBlock('// --- Stats ---', '// --- Word of the Day ---');
removeBlock('// --- Stats ---', '// --- Word of the Day ---');

const wotd = getBlock('// --- Word of the Day ---', '// --- Streak ---');
removeBlock('// --- Word of the Day ---', '// --- Streak ---');

// Wait, streak might be before PDF Dictionary
const streakStart = lines.findIndex(l => l.includes('// --- Streak ---'));
if(streakStart > -1) {
   const streakEnd = lines.findIndex((l, i) => i > streakStart && l.includes('// ---'));
   const streak = lines.slice(streakStart, streakEnd !== -1 ? streakEnd : lines.length).join('\n');
   lines.splice(streakStart, (streakEnd !== -1 ? streakEnd : lines.length) - streakStart);
   
   const statsContent = `
import { STATE, saveStateToLocal } from '../state.js';
import { formatDate } from '../utils.js';
import { saveToCloud } from '../services/firebase.js';

${stats}
${wotd}
${streak}
`;
   fs.writeFileSync('src/features/stats.js', statsContent);
}

fs.writeFileSync('src/main.js', lines.join('\n'));
