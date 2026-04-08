// ─── App Constants ─────────────────────────────────────────────────────────────
export const APP_VERSION = 'v2.7';
export const ALLOWED_EMAILS = ['rjohnson5481@gmail.com'];
export const SCHOOL_YEAR_START = new Date('2025-08-25');
export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const CHAT_SYSTEM_PROMPT = `You are the AI assistant for Iron & Light Johnson Academy, a classical/Charlotte Mason homeschool. You help Rob plan lessons, review schedules, log progress, and manage the academic record. Students are Orion (Reading 3, Math 3 TGTB) and Malachi (Reading 2, Math 2). School year started August 25, 2025. ND requires 175 days or 1025 hours. Be warm, concise, and professional.

When Rob asks you to add, update, or change schedule data, confirm what you understood, then output this EXACT structured block (required for the Apply button to work):
[APPLY_DATA]{"rows":[{"day":"Tuesday","student":"Orion","subject":"bible","lesson":"Lesson 12 of Heroes"},{"day":"Tuesday","student":"Malachi","subject":"bible","lesson":"Lesson 12 of Heroes"}]}[/APPLY_DATA]
Then on the next line include <button>Apply to Schedule</button>

Rules: day must be one of Monday/Tuesday/Wednesday/Thursday/Friday. subject must be lowercase (reading, math, science, history, bible, or any custom subject). Never write to the database without confirmation.`;

export const SEED_SCHEDULE = {
  Monday: { note: 'No School' },
  Tuesday: {
    orion: { reading: 'Re3 Day 15 "Encyclopedia Brown"', math: 'Data Review / Catch-Up' },
    malachi: { reading: 'Re2 Day 12 "To Market"', math: 'Data Review / Catch-Up p.152' }
  },
  Wednesday: {
    orion: { reading: 'Re3 Day 16 "Encyclopedia Brown"', math: 'Time: Hour p.10' },
    malachi: { reading: 'Re2 Day 13 "The Crow and the Pitcher"', math: 'Time: Hour p.10' }
  },
  Thursday: {
    orion: { reading: 'Re3 Day 18 DRAMA: Two Crooks and Two Heroes', math: 'Time: Half Hour p.10' },
    malachi: { reading: 'Re2 Day 14 Look Again "The Crow and the Pitcher"', math: 'Time: Half Hour p.10' }
  },
  Friday: {
    orion: { reading: 'Re3 Day 19 DRAMA: Two Crooks and Two Heroes', math: 'Review: Time (Hour & Half Hour)' },
    malachi: { reading: 'Re2 Day 15 "Owl Face"', math: 'Review: Time (Hour & Half Hour)' }
  }
};
