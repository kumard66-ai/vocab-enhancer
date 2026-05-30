# VocabVault - Vocabulary Enhancement Tool

A beautiful, feature-rich vocabulary enhancement web app hosted on GitHub Pages.

## Features

- **Word Lookup** - Search any word with pronunciation, parts of speech, meanings, examples, synonyms & antonyms
- **Multiple Sources** - Quick links to Vocabulary.com, Cambridge, Oxford, Merriam-Webster
- **Word History** - Tabular history with filtering, sorting, and export to Excel/CSV
- **File Upload** - Upload PDF, DOCX, TXT, HTML files to extract highlighted/bold words
- **Flashcards** - Generate interactive flashcards from your word history (select range)
- **Quiz Mode** - Multiple quiz types with difficulty levels and timed mode
- **Statistics** - Track progress with charts, mastery levels, and learning streaks
- **Dark Mode** - Toggle between light and dark themes
- **Word of the Day** - Daily vocabulary word on the homepage
- **Offline Storage** - All data saved locally in your browser

## Setup

1. Fork or clone this repository
2. Go to Settings → Pages → Source: Deploy from branch (main)
3. Your site will be live at `https://<username>.github.io/vocab-enhancer/`

## Tech Stack

- Pure HTML/CSS/JavaScript (no build step)
- Free Dictionary API for word lookups
- Chart.js for statistics
- SheetJS (xlsx) for Excel export
- Mammoth.js for DOCX processing
- PDF.js for PDF text extraction
- LocalStorage for data persistence
