import { auth, db, getGoogleProvider } from './firebase-config.js';
import { STATE, saveStateToLocal } from '../state.js';
import { showToast } from '../utils.js';
import firebase from 'firebase/compat/app';

export function initAuth() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const syncBtn = document.getElementById('syncStatus');

    if (loginBtn) loginBtn.addEventListener('click', signInWithGoogle);
    if (logoutBtn) logoutBtn.addEventListener('click', signOut);
    if (syncBtn) {
        syncBtn.style.cursor = 'pointer';
        syncBtn.addEventListener('click', forcePullFromCloud);
    }

    // Listen to auth state
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(handleAuthChange);
    }
}

export async function signInWithGoogle() {
    try {
        // If we are inside the Chrome Extension environment
        if (typeof chrome !== 'undefined' && chrome.identity) {
            chrome.identity.getAuthToken({ interactive: true }, async (token) => {
                if (chrome.runtime.lastError || !token) {
                    console.error("Auth Token Error:", chrome.runtime.lastError);
                    showToast('Sign-in failed: ' + (chrome.runtime.lastError?.message || 'Token empty'), 'error');
                    return;
                }
                
                try {
                    // Create a Firebase credential with the Chrome Auth Token
                    const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
                    await auth.signInWithCredential(credential);
                    showToast('Signed in successfully!', 'success');
                } catch (credErr) {
                    console.error("Firebase Credential Error:", credErr);
                    showToast('Sign-in failed: ' + credErr.message, 'error');
                }
            });
        } else {
            // Local web development environment
            await auth.signInWithPopup(getGoogleProvider());
        }
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            showToast('Sign-in failed: ' + err.message, 'error');
        }
    }
}

export async function signOut() {
    try {
        await auth.signOut();
        showToast('Signed out. Using local storage only.', 'success');
    } catch (err) {
        showToast('Sign-out failed', 'error');
    }
}

export function handleAuthChange(user) {
    const loginBtn = document.getElementById('loginBtn');
    const profile = document.getElementById('userProfile');

    if (user) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (profile) profile.classList.remove('hidden');
        document.getElementById('userAvatar').src = user.photoURL || '';
        document.getElementById('userName').textContent = user.displayName?.split(' ')[0] || 'User';
        STATE.userId = user.uid;
        loadFromCloud();
    } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (profile) profile.classList.add('hidden');
        STATE.userId = null;
    }
}

export async function loadFromCloud() {
    if (!STATE.userId) return;
    setSyncStatus('syncing');

    try {
        const doc = await db.collection('users').doc(STATE.userId).get();
        if (doc.exists) {
            const cloudData = doc.data();
            const cloudWords = cloudData.words || [];
            const cloudStreak = cloudData.streak || STATE.streak;

            // Merge: cloud + local, deduplicate by word
            const merged = mergeWordLists(STATE.words, cloudWords);
            STATE.words = merged;
            STATE.streak = cloudStreak;
            saveStateToLocal();

            showToast(`Synced ${STATE.words.length} words from cloud`, 'success');
        } else {
            // First time: push local data to cloud
            await saveToCloud();
            showToast('Local data uploaded to cloud', 'success');
        }
        setSyncStatus('synced');
    } catch (err) {
        setSyncStatus('offline');
        console.error('Cloud sync error:', err.code, err.message);
        if (err.code === 'permission-denied') {
            showToast('Firestore rules need updating. Check console for details.', 'error');
        } else {
            showToast('Cloud sync failed: ' + (err.code || err.message), 'error');
        }
    }
}

export async function forcePullFromCloud() {
    if (!STATE.userId) return;
    setSyncStatus('syncing');

    try {
        const doc = await db.collection('users').doc(STATE.userId).get();
        if (doc.exists) {
            const cloudData = doc.data();
            
            // Hard overwrite to reflect deletions
            STATE.words = cloudData.words || [];
            if (cloudData.streak) STATE.streak = cloudData.streak;
            
            saveStateToLocal();
            
            if (window.renderHistory) window.renderHistory();
            if (window.renderStats) window.renderStats();

            showToast('Refreshed data from cloud!', 'success');
        } else {
            showToast('No cloud data found.', 'info');
        }
        setSyncStatus('synced');
    } catch (err) {
        setSyncStatus('offline');
        showToast('Refresh failed: ' + err.message, 'error');
    }
}

export async function saveToCloud() {
    if (!STATE.userId) return;
    setSyncStatus('syncing');

    try {
        await db.collection('users').doc(STATE.userId).set({
            words: STATE.words,
            streak: STATE.streak,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        setSyncStatus('synced');
    } catch (err) {
        setSyncStatus('offline');
    }
}

function mergeWordLists(local, cloud) {
    const map = new Map();
    // Cloud first (older baseline)
    cloud.forEach(w => map.set(w.word.toLowerCase(), w));
    // Local overwrites with newer data
    local.forEach(w => {
        const key = w.word.toLowerCase();
        const existing = map.get(key);
        if (!existing || new Date(w.dateAdded) > new Date(existing.dateAdded)) {
            map.set(key, w);
        }
    });
    return [...map.values()].sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
}

export function setSyncStatus(status) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    el.className = 'sync-status ' + (status === 'syncing' ? 'syncing' : status === 'offline' ? 'offline' : '');
    el.title = status === 'synced' ? 'Synced! Click to refresh from cloud.' : status === 'syncing' ? 'Syncing...' : 'Offline. Click to retry.';
    const icon = el.querySelector('i');
    if (icon) icon.className = status === 'synced' ? 'fas fa-cloud' : status === 'syncing' ? 'fas fa-sync fa-spin' : 'fas fa-cloud-slash';
}
