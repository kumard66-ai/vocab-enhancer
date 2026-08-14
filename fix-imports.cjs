const fs = require('fs');

const exportsMap = {
    'src/api/dictionary.js': ['initSearch'],
    'src/features/history.js': ['initHistory', 'updateHistoryStats'],
    'src/features/reader.js': ['initReader', 'initUpload', 'initPdfDictionary'],
    'src/features/flashcards.js': ['initFlashcards'],
    'src/features/quiz.js': ['initQuiz'],
    'src/features/stats.js': ['initStats', 'loadWordOfTheDay', 'updateStreak']
};

for (const [file, funcs] of Object.entries(exportsMap)) {
    if (fs.existsSync(file)) {
        let code = fs.readFileSync(file, 'utf8');
        for (const func of funcs) {
            code = code.replace(new RegExp("function " + func + "\\\\(.*?\\\\) \\{"), "export function " + func + "() {");
        }
        fs.writeFileSync(file, code);
    }
}

// Now update main.js
let main = fs.readFileSync('src/main.js', 'utf8');
const imports = `
import { initSearch } from './api/dictionary.js';
import { initHistory, updateHistoryStats } from './features/history.js';
import { initReader, initUpload, initPdfDictionary } from './features/reader.js';
import { initFlashcards } from './features/flashcards.js';
import { initQuiz } from './features/quiz.js';
import { initStats, loadWordOfTheDay, updateStreak } from './features/stats.js';
`;

// Insert after the first few imports (e.g. Utils)
main = main.replace(/(import .*? from '.*?utils\.js';)/, "$1\n" + imports);
fs.writeFileSync('src/main.js', main);

console.log('Fixed imports and exports!');
