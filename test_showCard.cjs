const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('src/features/flashcards.js', 'utf8');

const dom = new JSDOM(html);
const window = dom.window;
const document = window.document;

global.window = window;
global.document = document;
global.STATE = {
    words: [{
        id: 1,
        word: 'test',
        meaning: 'test meaning',
        example: 'test example',
        partOfSpeech: 'noun',
        phonetic: '/test/',
        synonyms: ['exam'],
        antonyms: [],
        phrases: [],
        relatedTopics: ['testing']
    }],
    currentFlashcards: [{
        id: 1,
        word: 'test',
        meaning: 'test meaning',
        example: 'test example',
        partOfSpeech: 'noun',
        phonetic: '/test/',
        synonyms: ['exam'],
        antonyms: [],
        phrases: [],
        relatedTopics: ['testing']
    }],
    currentFcIndex: 0,
    fcType: 'classic'
};

// Mock other globals
global.showToast = console.log;
global.playAudio = console.log;
global.saveWords = console.log;
global.updateFlashcardTheme = () => {};
global.fcOverlay = { classList: { contains: () => false } };

try {
    // Evaluate the JS inside the global context
    let code = js.replace(/import\s+.+/g, '').replace(/export\s+/g, '');
    eval(code);
    
    // Call showCard
    showCard(0);
    console.log("showCard success!");
    console.log("Front content:", document.getElementById('fcFrontContent').innerHTML);
    console.log("Back content:", document.getElementById('fcBackWord').textContent);
} catch (e) {
    console.error("showCard failed:", e.stack);
}
