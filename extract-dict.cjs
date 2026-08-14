const fs = require('fs');

let mainCode = fs.readFileSync('src/main.js', 'utf8');
const lines = mainCode.split('\n');

const lookupStart = lines.findIndex(l => l.includes('// --- Word Lookup ---'));
const historyStart = lines.findIndex(l => l.includes('// --- History ---'));

const dictionaryCode = lines.slice(lookupStart, historyStart).join('\n');
const newMainCode = lines.slice(0, lookupStart).join('\n') + '\n' + lines.slice(historyStart).join('\n');

const dictionaryContent = `
import { STATE, saveStateToLocal } from '../state.js';
import { showToast, truncate } from '../utils.js';
import { searchPdfDict } from '../features/reader.js'; // Will be defined later
import { saveToCloud } from '../services/firebase.js';

` + dictionaryCode + `

export {
    searchWord,
    fetchWordDataFromAPI,
    fetchWordData,
    scrapeFromSource,
    parseCambridge,
    parseOxford,
    parseLongman,
    parseMerriam,
    parseVocabulary,
    buildStandardResult,
    getSourceUrl,
    getSourceLabel
};
`;

fs.writeFileSync('src/api/dictionary.js', dictionaryContent);
fs.writeFileSync('src/main.js', `import { searchWord } from './api/dictionary.js';\nwindow.searchWord = searchWord;\n` + newMainCode);
