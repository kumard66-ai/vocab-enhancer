const fs = require('fs');
let content = fs.readFileSync('src/api/dictionary.js', 'utf8');
content = content.replace(/\?/g, '•');
fs.writeFileSync('src/api/dictionary.js', content, 'utf8');
