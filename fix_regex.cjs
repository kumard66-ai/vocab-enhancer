const fs = require('fs');
let content = fs.readFileSync('src/api/dictionary.js', 'utf8');

content = content.replace(/\/\^\?\\s\*\//g, '/^•\\s*/');
content = content.replace(/existing\.meaning \? existing\.meaning \+ ' \\n\\n ' :/g, ""); // wait, I shouldn't guess what the string is.
fs.writeFileSync('src/api/dictionary.js', content, 'utf8');
