const DB_NAME = 'vocabEnhancerDB';
const DB_VERSION = 1;
const STORE_NAME = 'wordImages';

let dbPromise = null;

function initDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
            
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME); // Key will be the word ID
                }
            };
        });
    }
    return dbPromise;
}

export async function saveImage(wordId, base64Data) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(base64Data, wordId);
        
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
    });
}

export async function getImage(wordId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(wordId);
        
        request.onsuccess = (e) => resolve(e.target.result || null);
        request.onerror = (e) => reject(e.target.error);
    });
}

export async function deleteImage(wordId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(wordId);
        
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
    });
}
