const fs = require('fs');

let mainJs = fs.readFileSync('src/main.js', 'utf8');

const regex = /(function renderBulkResultsUI\(\) \{[\s\S]*?)(\n\n\n|\n$)/;
// Wait, the functions are at the bottom of main.js. Let's just grab everything from function renderBulkResultsUI() to the end of the file.
const splitIndex = mainJs.indexOf('function renderBulkResultsUI() {');
if (splitIndex !== -1) {
    const bulkFuncs = mainJs.slice(splitIndex);
    mainJs = mainJs.slice(0, splitIndex);
    fs.writeFileSync('src/main.js', mainJs, 'utf8');

    let readerJs = fs.readFileSync('src/features/reader.js', 'utf8');
    readerJs += '\n\n' + bulkFuncs;

    // We also need to export them so that they can be called from main.js if needed.
    // Actually, in reader.js they are referenced as just exportBulkResultsCSV without import, which is correct if they are in the same file!
    fs.writeFileSync('src/features/reader.js', readerJs, 'utf8');
}
