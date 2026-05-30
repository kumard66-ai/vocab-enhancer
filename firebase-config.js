// Firebase Configuration
// Replace with your Firebase project config from:
// https://console.firebase.google.com → Your Project → Project Settings → Web App

const firebaseConfig = {
    apiKey: "AIzaSyA3qKeqlsLu2XLJB7YL-Z_eaLK85a9gnx0",
    authDomain: "vocabvault-30eca.firebaseapp.com",
    projectId: "vocabvault-30eca",
    storageBucket: "vocabvault-30eca.firebasestorage.app",
    messagingSenderId: "228496318191",
    appId: "1:228496318191:web:c828a6ca9045f6e5a3851a"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
