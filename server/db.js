const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'learn_spanish.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    translation TEXT,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    last_practiced DATETIME,
    learned BOOLEAN DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS mistakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_input TEXT NOT NULL,
    expected TEXT,
    explanation TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = {
    db,

    // Progress tracking methods
    logMistake: (userInput, expected, explanation) => {
        const stmt = db.prepare('INSERT INTO mistakes (user_input, expected, explanation) VALUES (?, ?, ?)');
        return stmt.run(userInput, expected, explanation);
    },

    getRecentMistakes: (limit = 10) => {
        return db.prepare('SELECT * FROM mistakes ORDER BY timestamp DESC LIMIT ?').all(limit);
    },

    deleteMistake: (id) => {
        const stmt = db.prepare('DELETE FROM mistakes WHERE id = ?');
        return stmt.run(id);
    },

    updateWordStatus: (word, translation, isCorrect) => {
        // Upsert word logic
        const existing = db.prepare('SELECT * FROM words WHERE word = ?').get(word);
        if (!existing) {
            const stmt = db.prepare(
                'INSERT INTO words (word, translation, correct_count, incorrect_count, last_practiced, learned) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)'
            );
            stmt.run(word, translation, isCorrect ? 1 : 0, isCorrect ? 0 : 1, isCorrect ? 1 : 0);
        } else {
            const newCorrect = existing.correct_count + (isCorrect ? 1 : 0);
            const newIncorrect = existing.incorrect_count + (isCorrect ? 0 : 1);
            const learned = newCorrect > newIncorrect + 2; // Simple learned heuristic

            const stmt = db.prepare(
                'UPDATE words SET translation = ?, correct_count = ?, incorrect_count = ?, last_practiced = CURRENT_TIMESTAMP, learned = ? WHERE word = ?'
            );
            stmt.run(translation || existing.translation, newCorrect, newIncorrect, learned ? 1 : 0, word);
        }
    },

    getLearnedWords: () => {
        return db.prepare('SELECT * FROM words WHERE learned = 1').all();
    },

    clearAllMistakes: () => {
        const stmt = db.prepare('DELETE FROM mistakes');
        return stmt.run();
    }
};
