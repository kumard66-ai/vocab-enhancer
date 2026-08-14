
import sys

content = open('src/api/dictionary.js', 'r', encoding='utf-8').read()

new_block = '''import { STATE, saveStateToLocal, saveWords } from '../state.js';
import { showToast, truncate } from '../utils.js';
import { searchPdfDict, updatePdfRemoveBtn, removePdfDictionary } from '../features/reader.js'; // Will be defined later
import { saveToCloud } from '../services/firebase.js';

// --- Word Lookup ---
export function initSearch() {
    const input = document.getElementById('wordInput');
    const btn = document.getElementById('searchBtn');
    const openBtn = document.getElementById('openSourceBtn');
    const sourceSelect = document.getElementById('sourceSelect');

    btn.addEventListener('click', () => searchWord(input.value.trim()));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchWord(input.value.trim());
    });

    // AI UI Bindings
    const llmSettingsBtn = document.getElementById('llmSettingsBtn');
    const llmSettingsModal = document.getElementById('llmSettingsModal');
    const closeLlmSettingsBtn = document.getElementById('closeLlmSettingsBtn');
    const cancelLlmSettingsBtn = document.getElementById('cancelLlmSettingsBtn');
    const saveLlmSettingsBtn = document.getElementById('saveLlmSettingsBtn');
    const llmProviderSelect = document.getElementById('llmProviderSelect');
    const llmCustomUrlGroup = document.getElementById('llmCustomUrlGroup');
    
    // Load saved settings
    if (STATE.llmSettings) {
        if (STATE.llmSettings.provider) llmProviderSelect.value = STATE.llmSettings.provider;
        if (STATE.llmSettings.apiKey) document.getElementById('llmApiKey').value = STATE.llmSettings.apiKey;
        if (STATE.llmSettings.customUrl) document.getElementById('llmCustomUrl').value = STATE.llmSettings.customUrl;
    }
    
    llmProviderSelect.addEventListener('change', () => {
        llmCustomUrlGroup.style.display = llmProviderSelect.value === 'custom' ? 'block' : 'none';
    });
    // trigger initial state
    llmCustomUrlGroup.style.display = llmProviderSelect.value === 'custom' ? 'block' : 'none';

    const closeLlmModal = () => { llmSettingsModal.style.display = 'none'; };
    llmSettingsBtn.addEventListener('click', () => { llmSettingsModal.style.display = 'flex'; });
    closeLlmSettingsBtn.addEventListener('click', closeLlmModal);
    cancelLlmSettingsBtn.addEventListener('click', closeLlmModal);
    saveLlmSettingsBtn.addEventListener('click', () => {
        STATE.llmSettings = {
            mode: 'ai',
            provider: llmProviderSelect.value,
            apiKey: document.getElementById('llmApiKey').value,
            customUrl: document.getElementById('llmCustomUrl').value
        };
        saveStateToLocal();
        showToast('AI Settings saved successfully');
        closeLlmModal();
    });

    // Check AI key on load
    if (!STATE.llmSettings || !STATE.llmSettings.apiKey) {
        showToast('Please configure your AI API key in Settings (Gear Icon)', 'warning');
    }
'''

start_idx = content.find('import { STATE')
end_idx = content.find('    openBtn.addEventListener')

if start_idx == -1 or end_idx == -1:
    print('Failed to find markers')
    sys.exit(1)

new_content = new_block + content[end_idx:]

with open('src/api/dictionary.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done')

