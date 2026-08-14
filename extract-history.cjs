const fs = require('fs');

let mainCode = fs.readFileSync('src/main.js', 'utf8');
const lines = mainCode.split('\n');

function getBlock(startMarker, endMarker) {
    const start = lines.findIndex(l => l.includes(startMarker));
    if (start === -1) return '';
    const end = endMarker ? lines.findIndex((l, i) => i > start && l.includes(endMarker)) : lines.length;
    return lines.slice(start, end !== -1 ? end : lines.length).join('\n');
}

function removeBlock(startMarker, endMarker) {
    const start = lines.findIndex(l => l.includes(startMarker));
    if (start === -1) return;
    const end = endMarker ? lines.findIndex((l, i) => i > start && l.includes(endMarker)) : lines.length;
    lines.splice(start, (end !== -1 ? end : lines.length) - start);
}

const history = getBlock('// --- History ---', '// --- Bulk Lookup Helpers ---');
removeBlock('// --- History ---', '// --- Bulk Lookup Helpers ---');

const historyContent = `
import { STATE, saveStateToLocal } from '../state.js';
import { showToast, formatDate, truncate } from '../utils.js';
import { searchWord } from '../api/dictionary.js';

${history}
`;

fs.writeFileSync('src/features/history.js', historyContent);

fs.writeFileSync('src/main.js', lines.join('\n'));
