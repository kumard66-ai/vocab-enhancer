const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(/localStorage\.setItem\('vocabWords',\s*JSON\.stringify\(STATE\.words\)\);/g, 'saveStateToLocal();');
code = code.replace(/localStorage\.setItem\('vocabStreak',\s*JSON\.stringify\(STATE\.streak\)\);/g, 'saveStateToLocal();');

fs.writeFileSync('src/main.js', code);
