const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const regex = /on[a-z]+=\"([a-zA-Z0-9_]+)\(/g;
const matches = [...html.matchAll(regex)].map(m => m[1]);
console.log(Array.from(new Set(matches)).join(', '));
