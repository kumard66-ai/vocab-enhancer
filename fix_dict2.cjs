const fs = require('fs');
let content = fs.readFileSync('src/api/dictionary.js', 'utf8');

// revert all bullets to question marks
content = content.replace(/•/g, '?');

// now target specifically the string concatenations that I wanted to fix
content = content.replace(/\.join\(' \? '\)/g, ".join(' \\n\\n ')");
content = content.replace(/existing\.meaning \+ ' \? '/g, "existing.meaning + ' \\n\\n '");
content = content.replace(/existing\.example \+ ' \? '/g, "existing.example + ' \\n\\n '");
content = content.replace(/meaning: meanings\.join\(' \? '\)/g, "meaning: meanings.join(' \\n\\n ')");
content = content.replace(/example: examples\.concat\(aiExamples\)\.join\(' \? '\)/g, "example: examples.concat(aiExamples).join(' \\n\\n ')");
content = content.replace(/existing\.meaning \+ ' \? '/g, "existing.meaning + ' \\n\\n '");
content = content.replace(/existing\.example \+ ' \? '/g, "existing.example + ' \\n\\n '");

fs.writeFileSync('src/api/dictionary.js', content, 'utf8');
