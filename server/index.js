import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Proxy endpoint for scraping
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch ${targetUrl}: ${response.status} ${response.statusText}`);
        }
        
        const text = await response.text();
        res.send(text);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).send('Proxy error: ' + error.message);
    }
});

// AI Generation Endpoint
app.post('/api/ai/generate', async (req, res) => {
    const { provider, apiKey, customUrl, word, meanings } = req.body;
    
    if (!provider || !apiKey || !word) {
        return res.status(400).json({ error: 'Missing required parameters (provider, apiKey, word)' });
    }

    // Build the prompt
    const meaningsText = meanings.map(m => m.definitions[0]?.definition).join('; ');
    const prompt = `I am learning the English word "${word}". Here are its definitions from the dictionary: ${meaningsText}.
Please provide the following to help me learn this word deeply:
1. A clever mnemonic or memory hook to help me remember this word.
2. A clear and concise meaning or definition of the word.
3. Two unique, natural example sentences using the word.
4. 2 to 3 common phrases, idioms, or collocations using this word.
5. A list of 3 synonyms for the word.
6. A list of 3 antonyms for the word.
7. A list of 3 to 5 related topics, fields, or categories the word belongs to.

Format your response exactly like this:
Mnemonic: [your mnemonic here]
Meaning: [your meaning here]
Examples: [example 1] | [example 2]
Phrases: [phrase 1], [phrase 2], [phrase 3]
Synonyms: [syn 1], [syn 2], [syn 3]
Antonyms: [ant 1], [ant 2], [ant 3]
Related Topics: [topic 1], [topic 2], [topic 3]`;

    try {
        let result = '';

        if (provider.startsWith('gemini')) {
            // Support both gemini-3.6-flash and gemini-3.5-flash-lite, or fallback
            const modelName = provider === 'gemini' ? 'gemini-3.6-flash' : provider;
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'Gemini API Error');
            result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        } else if (provider === 'openai') {
            // OpenAI API
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'OpenAI API Error');
            result = data.choices?.[0]?.message?.content || '';

        } else if (provider === 'custom') {
            // Custom API (assuming OpenAI compatible endpoint like Ollama/LMStudio)
            const url = customUrl || 'http://localhost:11434/v1/chat/completions';
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo', // Or ignored by local endpoints
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'Custom API Error');
            result = data.choices?.[0]?.message?.content || '';
        } else {
            return res.status(400).json({ error: 'Unknown provider' });
        }

        // Parse the result text
        const lines = result.split('\n');
        let mnemonic = '';
        let meaning = '';
        let phrases = '';
        let synonyms = '';
        let antonyms = '';
        let relatedTopics = '';
        let examples = [];

        for (const line of lines) {
            if (line.toLowerCase().startsWith('mnemonic:')) {
                mnemonic = line.substring(9).trim();
            } else if (line.toLowerCase().startsWith('meaning:')) {
                meaning = line.substring(8).trim();
            } else if (line.toLowerCase().startsWith('phrases:')) {
                phrases = line.substring(8).trim();
            } else if (line.toLowerCase().startsWith('synonyms:')) {
                synonyms = line.substring(9).trim();
            } else if (line.toLowerCase().startsWith('antonyms:')) {
                antonyms = line.substring(9).trim();
            } else if (line.toLowerCase().startsWith('related topics:')) {
                relatedTopics = line.substring(15).trim();
            } else if (line.toLowerCase().startsWith('examples:')) {
                const exString = line.substring(9).trim();
                examples = exString.split('|').map(e => e.trim()).filter(e => e.length > 0);
            } else if (line.toLowerCase().startsWith('example')) {
                const parts = line.split(':');
                if (parts.length > 1) {
                    examples.push(parts.slice(1).join(':').trim());
                }
            }
        }

        res.json({ mnemonic, meaning, phrases, synonyms, antonyms, relatedTopics, examples });

    } catch (error) {
        console.error('AI error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
});
