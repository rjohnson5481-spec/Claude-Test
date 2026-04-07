import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth, googleProvider } from '../firebase.js';
import {
  doc, setDoc, updateDoc, onSnapshot, collection, query, orderBy,
  getDocs, deleteDoc, arrayUnion, getDoc
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

// ─── Constants ────────────────────────────────────────────────────────────────
const APP_VERSION = 'v1.4';
const ALLOWED_EMAILS = ['rjohnson5481@gmail.com'];
const SCHOOL_YEAR_START = new Date('2025-08-25');
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const CHAT_SYSTEM_PROMPT = `You are the AI assistant for Iron & Light Johnson Academy, a classical/Charlotte Mason homeschool. You help Rob plan lessons, review schedules, log progress, and manage the academic record. Students are Orion (Reading 3, Math 3 TGTB) and Malachi (Reading 2, Math 2). School year started August 25, 2025. ND requires 175 days or 1025 hours. Be warm, concise, and professional.

When Rob asks you to add, update, or change schedule data, confirm what you understood, then output this EXACT structured block (required for the Apply button to work):
[APPLY_DATA]{"rows":[{"day":"Tuesday","student":"Orion","subject":"bible","lesson":"Lesson 12 of Heroes"},{"day":"Tuesday","student":"Malachi","subject":"bible","lesson":"Lesson 12 of Heroes"}]}[/APPLY_DATA]
Then on the next line include <button>Apply to Schedule</button>

Rules: day must be one of Monday/Tuesday/Wednesday/Thursday/Friday. subject must be lowercase (reading, math, science, history, bible, or any custom subject). Never write to the database without confirmation.`;

const SEED_SCHEDULE = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getWeekId(date) {
  const d = date ? new Date(date) : new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-${String(week).padStart(2, '0')}`;
}

function getTodayId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDayOfWeek(date) {
  const d = date ? new Date(date) : new Date();
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

function getSchoolDayNumber() {
  const today = new Date();
  let count = 0;
  let d = new Date(SCHOOL_YEAR_START);
  while (d <= today) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function formatDateDisplay(date) {
  return (date ? new Date(date) : new Date()).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(+y, +m-1, +d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getYesterdayId() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getWeekDateFor(dayName) {
  const today = new Date();
  const dows = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const diff = dows.indexOf(dayName) - today.getDay();
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d;
}

function getDateId(date) {
  const d = date ? new Date(date) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calcProjectedFinish(daysCompleted) {
  if (daysCompleted === 0) return 'N/A';
  const today = new Date();
  const elapsed = Math.max(1, Math.floor((today - SCHOOL_YEAR_START) / 86400000));
  const pace = daysCompleted / elapsed;
  const remaining = 175 - daysCompleted;
  if (pace <= 0) return 'N/A';
  const daysNeeded = Math.ceil(remaining / pace);
  const finish = new Date(today);
  let added = 0;
  while (added < daysNeeded) {
    finish.setDate(finish.getDate() + 1);
    if (finish.getDay() !== 0 && finish.getDay() !== 6) added++;
  }
  return finish.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}


// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.pw { font-family: 'Lora', Georgia, serif; background: #f4f2ee; color: #2c2c2c; min-height: 100vh; position: relative; }
.pw *, .pw *::before, .pw *::after { box-sizing: border-box; }

/* Loading / Login */
.p-fullscreen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f4f2ee; flex-direction: column; gap: 1.5rem; padding: 2rem; }
.p-login-card { background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.10); padding: 2.5rem 2rem; text-align: center; max-width: 380px; width: 100%; }
.p-school-hero { font-family: 'Cinzel', Georgia, serif; font-size: 1.5rem; font-weight: 700; color: #1a3a2a; margin-bottom: 0.35rem; }
.p-tagline-hero { color: #b4a064; font-size: 0.85rem; letter-spacing: 0.12em; margin-bottom: 1.75rem; }
.p-login-title { font-size: 1rem; color: #6b7280; margin-bottom: 1.5rem; }
.p-spinner { width: 36px; height: 36px; border: 3px solid #edecea; border-top-color: #1a3a2a; border-radius: 50%; animation: pspin 0.8s linear infinite; }
@keyframes pspin { to { transform: rotate(360deg); } }
.p-dot-spin { display: inline-flex; gap: 4px; align-items: center; }
.p-dot-spin span { width: 7px; height: 7px; border-radius: 50%; background: #1e2d4a; animation: pdot 1.2s ease-in-out infinite; }
.p-dot-spin span:nth-child(2) { animation-delay: 0.2s; }
.p-dot-spin span:nth-child(3) { animation-delay: 0.4s; }
@keyframes pdot { 0%,80%,100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }

/* Buttons */
.p-btn { display: inline-flex; align-items: center; gap: 0.4rem; border: none; border-radius: 8px; padding: 0.6rem 1.1rem; font-family: 'Lora', serif; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; text-decoration: none; }
.p-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.p-btn-primary { background: #1e2d4a; color: white; }
.p-btn-primary:hover:not(:disabled) { background: #162139; }
.p-btn-green { background: #1a3a2a; color: white; }
.p-btn-green:hover:not(:disabled) { background: #122a1e; }
.p-btn-gold { background: #b4a064; color: white; }
.p-btn-gold:hover:not(:disabled) { background: #9d8a52; }
.p-btn-outline { background: transparent; color: #1a3a2a; border: 1.5px solid #1a3a2a; }
.p-btn-outline:hover:not(:disabled) { background: #1a3a2a; color: white; }
.p-btn-ghost { background: transparent; color: #6b7280; border: none; padding: 0.4rem 0.7rem; }
.p-btn-ghost:hover { background: #edecea; color: #2c2c2c; }
.p-btn-danger { background: #dc2626; color: white; }
.p-btn-danger:hover:not(:disabled) { background: #b91c1c; }
.p-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }
.p-btn-lg { padding: 0.75rem 1.5rem; font-size: 1rem; }
.p-btn-block { width: 100%; justify-content: center; }
.p-google-btn { background: white; color: #2c2c2c; border: 1.5px solid rgba(0,0,0,0.15); font-size: 0.95rem; padding: 0.75rem 1.5rem; border-radius: 8px; }
.p-google-btn:hover { background: #f8f8f8; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }

/* Top Bar */
.p-topbar { position: sticky; top: 0; z-index: 100; background: white; border-bottom: 2px solid #1a3a2a; display: flex; align-items: center; padding: 0.65rem 1rem; gap: 0.75rem; }
.p-topbar-menu-btn { background: none; border: none; cursor: pointer; color: #1a3a2a; font-size: 1.4rem; padding: 0.25rem; line-height: 1; }
.p-topbar-center { flex: 1; text-align: center; }
.p-topbar-name { font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 700; color: #1a3a2a; line-height: 1.2; }
.p-topbar-tagline { font-size: 0.65rem; color: #b4a064; letter-spacing: 0.1em; }
.p-compliance-mini { text-align: right; font-size: 0.7rem; color: #6b7280; min-width: 90px; }
.p-compliance-mini .p-cm-row { display: flex; align-items: center; gap: 0.35rem; margin-bottom: 2px; white-space: nowrap; }
.p-cm-bar { height: 4px; background: #edecea; border-radius: 2px; flex: 1; overflow: hidden; }
.p-cm-fill { height: 100%; background: #b4a064; border-radius: 2px; transition: width 0.5s ease; }

/* Tab Nav */
.p-tabnav { display: flex; background: white; border-bottom: 1px solid rgba(0,0,0,0.08); position: sticky; top: 57px; z-index: 99; }
.p-tabnav button { flex: 1; border: none; background: none; padding: 0.65rem 0.5rem; font-family: 'Lora', serif; font-size: 0.8rem; font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 2.5px solid transparent; transition: all 0.15s; letter-spacing: 0.05em; text-transform: uppercase; }
.p-tabnav button.active { color: #1a3a2a; border-bottom-color: #1a3a2a; }
.p-tabnav button:hover:not(.active) { color: #2c2c2c; background: #f9f8f6; }

/* Main content */
.p-main { padding: 1rem; padding-bottom: 80px; max-width: 900px; margin: 0 auto; }

/* Side Menu */
.p-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; }
.p-sidemenu { position: fixed; top: 0; left: 0; bottom: 0; width: 280px; background: white; z-index: 201; transform: translateX(-100%); transition: transform 0.25s ease; display: flex; flex-direction: column; box-shadow: 4px 0 24px rgba(0,0,0,0.15); }
.p-sidemenu.open { transform: translateX(0); }
.p-sidemenu-header { background: #1a3a2a; color: white; padding: 1.25rem 1rem; display: flex; align-items: center; justify-content: space-between; }
.p-sidemenu-title { font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 600; }
.p-sidemenu-close { background: none; border: none; color: white; font-size: 1.3rem; cursor: pointer; line-height: 1; }
.p-sidemenu-nav { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
.p-sidemenu-item { display: flex; align-items: center; gap: 0.75rem; width: 100%; border: none; background: none; padding: 0.85rem 1.25rem; font-family: 'Lora', serif; font-size: 0.9rem; cursor: pointer; color: #2c2c2c; transition: background 0.15s; text-align: left; }
.p-sidemenu-item:hover { background: #f4f2ee; }
.p-sidemenu-item span.icon { font-size: 1.1rem; width: 24px; }

/* Subview */
.p-subview { position: fixed; inset: 0; background: #f4f2ee; z-index: 300; display: flex; flex-direction: column; overflow: hidden; }
.p-subview-header { background: #1a3a2a; color: white; padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.75rem; }
.p-subview-header h2 { font-family: 'Cinzel', serif; font-size: 1rem; flex: 1; }
.p-subview-back { background: none; border: none; color: white; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
.p-subview-body { flex: 1; overflow-y: auto; padding: 1.25rem 1rem; }

/* Cards */
.p-card { background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); padding: 1.25rem; margin-bottom: 1rem; border: 1px solid rgba(0,0,0,0.06); }
.p-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.p-card-title { font-family: 'Cinzel', serif; font-size: 0.9rem; font-weight: 600; color: #1a3a2a; }

/* Section headers */
.p-section-title { font-family: 'Cinzel', serif; font-size: 0.95rem; font-weight: 600; color: #1a3a2a; margin-bottom: 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid rgba(0,0,0,0.08); }
.p-date-header { text-align: center; margin-bottom: 1.25rem; }
.p-date-header h2 { font-family: 'Cinzel', serif; font-size: 1.1rem; color: #1a3a2a; }
.p-date-header .p-day-num { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }

/* TODAY: lesson rows */
.p-students-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
@media (max-width: 640px) { .p-students-grid { grid-template-columns: 1fr; } }
.p-student-card { background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.06); overflow: hidden; }
.p-student-header { background: #1a3a2a; color: white; padding: 0.65rem 1rem; font-family: 'Cinzel', serif; font-size: 0.875rem; font-weight: 600; }
.p-student-body { padding: 0.75rem; }
.p-lesson-row { margin-bottom: 0.75rem; }
.p-lesson-check-row { display: flex; align-items: flex-start; gap: 0.6rem; }
.p-lesson-check-row input[type=checkbox] { margin-top: 3px; width: 16px; height: 16px; accent-color: #1a3a2a; flex-shrink: 0; cursor: pointer; }
.p-lesson-label { font-size: 0.85rem; line-height: 1.4; flex: 1; }
.p-lesson-subject { font-weight: 600; color: #1e2d4a; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
.p-lesson-text { color: #2c2c2c; }
.p-lesson-notes { width: 100%; margin-top: 0.4rem; padding: 0.4rem 0.6rem; font-family: 'Lora', serif; font-size: 0.8rem; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; resize: vertical; min-height: 48px; background: #f9f8f6; outline: none; }
.p-lesson-notes:focus { border-color: #1a3a2a; }
.p-badge-carried { background: #b4a064; color: white; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 999px; margin-left: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em; }
.p-badge-skipped { background: #6b7280; color: white; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 999px; margin-left: 0.35rem; }

/* Extra subjects */
.p-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.p-chip { border: 1.5px solid #1a3a2a; color: #1a3a2a; background: transparent; border-radius: 999px; padding: 0.3rem 0.8rem; font-size: 0.8rem; font-family: 'Lora', serif; cursor: pointer; transition: all 0.15s; font-weight: 600; }
.p-chip.active { background: #1a3a2a; color: white; }
.p-chip:hover { background: #1a3a2a; color: white; }
.p-extra-panel { background: #f4f2ee; border-radius: 8px; padding: 0.75rem; margin-top: 0.5rem; margin-bottom: 0.75rem; }
.p-extra-panel label { display: block; font-size: 0.75rem; font-weight: 600; color: #6b7280; margin-bottom: 0.2rem; text-transform: uppercase; letter-spacing: 0.05em; }
.p-extra-panel input, .p-extra-panel textarea { width: 100%; padding: 0.4rem 0.6rem; font-family: 'Lora', serif; font-size: 0.85rem; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; background: white; outline: none; margin-bottom: 0.5rem; }
.p-extra-panel textarea { min-height: 56px; resize: vertical; }
.p-extra-panel input:focus, .p-extra-panel textarea:focus { border-color: #1a3a2a; }

/* Day notes / hours */
.p-field { margin-bottom: 0.85rem; }
.p-field label { display: block; font-size: 0.75rem; font-weight: 600; color: #6b7280; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.05em; }
.p-field input, .p-field textarea, .p-field select { width: 100%; padding: 0.55rem 0.75rem; font-family: 'Lora', serif; font-size: 0.9rem; border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; background: white; outline: none; }
.p-field input:focus, .p-field textarea:focus, .p-field select:focus { border-color: #1a3a2a; box-shadow: 0 0 0 2px rgba(26,58,42,0.12); }
.p-field textarea { resize: vertical; min-height: 72px; }
.p-field-row { display: flex; gap: 0.75rem; }
.p-field-row .p-field { flex: 1; }

/* Finalize */
.p-finalize-panel { background: #fff8f0; border: 1.5px solid #f59e0b; border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
.p-finalize-title { font-family: 'Cinzel', serif; font-size: 0.875rem; font-weight: 600; color: #92400e; margin-bottom: 1rem; }
.p-incomplete-item { background: white; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.75rem; border: 1px solid rgba(0,0,0,0.08); }
.p-incomplete-item p { font-size: 0.85rem; margin-bottom: 0.6rem; }
.p-resolution-btns { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.p-resolution-btns button { font-size: 0.78rem; padding: 0.3rem 0.65rem; }

/* WEEK view */
.p-week-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
.p-week-title { font-family: 'Cinzel', serif; font-size: 1.05rem; font-weight: 600; color: #1a3a2a; }
.p-week-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.p-day-card { background: white; border-radius: 10px; margin-bottom: 0.75rem; box-shadow: 0 1px 4px rgba(0,0,0,0.07); border: 1px solid rgba(0,0,0,0.07); overflow: hidden; }
.p-day-card-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; cursor: pointer; user-select: none; }
.p-day-card-header:hover { background: #f9f8f6; }
.p-day-name { font-family: 'Cinzel', serif; font-size: 0.875rem; font-weight: 600; color: #1a3a2a; }
.p-day-status { font-size: 0.8rem; }
.p-day-body { padding: 0.75rem 1rem; border-top: 1px solid rgba(0,0,0,0.07); }
.p-day-student { margin-bottom: 0.6rem; }
.p-day-student-name { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; margin-bottom: 0.25rem; }
.p-day-lesson { font-size: 0.83rem; color: #2c2c2c; display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.2rem; }
.p-day-lesson .done { color: #1a3a2a; }
.p-day-lesson .undone { color: #6b7280; }
.p-pacing { display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; }
.p-pacing-badge { font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 999px; }
.p-pacing-on { background: #dcfce7; color: #166534; }
.p-pacing-ahead { background: #dbeafe; color: #1e40af; }
.p-pacing-behind { background: #fee2e2; color: #991b1b; }
.p-no-school { font-size: 0.85rem; color: #6b7280; font-style: italic; padding: 0.25rem 0; }

/* Report */
.p-report-panel { background: white; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); padding: 1.25rem; margin-top: 1rem; }
.p-report-content { font-size: 0.875rem; line-height: 1.7; white-space: pre-wrap; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; padding: 1rem; background: #f9f8f6; max-height: 400px; overflow-y: auto; }
.p-report-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; }

/* HISTORY */
.p-compliance-dashboard { background: #1a3a2a; color: white; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
.p-compliance-dashboard h2 { font-family: 'Cinzel', serif; font-size: 0.9rem; margin-bottom: 1rem; color: #b4a064; letter-spacing: 0.08em; }
.p-comp-stat { margin-bottom: 0.85rem; }
.p-comp-label { display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.35rem; }
.p-comp-bar { height: 8px; background: rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; }
.p-comp-fill { height: 100%; background: #b4a064; border-radius: 4px; transition: width 0.7s ease; }
.p-comp-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.75rem; font-size: 0.78rem; color: rgba(255,255,255,0.75); }
.p-archive-item { background: white; border-radius: 10px; margin-bottom: 0.75rem; box-shadow: 0 1px 4px rgba(0,0,0,0.07); border: 1px solid rgba(0,0,0,0.07); overflow: hidden; }
.p-archive-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; cursor: pointer; }
.p-archive-header:hover { background: #f9f8f6; }
.p-archive-week { font-family: 'Cinzel', serif; font-size: 0.85rem; font-weight: 600; color: #1a3a2a; }
.p-archive-date { font-size: 0.78rem; color: #6b7280; }
.p-archive-body { border-top: 1px solid rgba(0,0,0,0.07); padding: 1rem; }
.p-archive-html { font-size: 0.82rem; max-height: 300px; overflow-y: auto; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; padding: 0.75rem; background: #f9f8f6; }
.p-archive-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }

/* Chat logs */
.p-chat-log-item { background: white; border-radius: 10px; margin-bottom: 0.75rem; border: 1px solid rgba(0,0,0,0.07); overflow: hidden; }
.p-chat-log-header { display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 1rem; cursor: pointer; }
.p-chat-log-header:hover { background: #f9f8f6; }
.p-chat-log-body { border-top: 1px solid rgba(0,0,0,0.07); padding: 0.75rem; max-height: 250px; overflow-y: auto; }
.p-chat-log-msg { margin-bottom: 0.5rem; }
.p-chat-log-msg.user { text-align: right; }
.p-chat-log-bubble { display: inline-block; padding: 0.4rem 0.75rem; border-radius: 10px; font-size: 0.8rem; max-width: 85%; text-align: left; }
.p-chat-log-msg.user .p-chat-log-bubble { background: #1e2d4a; color: white; }
.p-chat-log-msg.assistant .p-chat-log-bubble { background: #edecea; color: #2c2c2c; }

/* AI Chat Drawer */
.p-chat-tab { position: fixed; bottom: 0; left: 0; right: 0; background: #1e2d4a; color: white; z-index: 150; cursor: pointer; padding: 0.7rem 1.25rem; display: flex; align-items: center; justify-content: space-between; user-select: none; }
.p-chat-tab-label { font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
.p-chat-unread-dot { width: 8px; height: 8px; background: #b4a064; border-radius: 50%; display: inline-block; }
.p-chat-drawer { position: fixed; bottom: 0; left: 0; right: 0; height: 55vh; background: white; z-index: 151; display: flex; flex-direction: column; box-shadow: 0 -4px 24px rgba(0,0,0,0.15); transform: translateY(0); }
.p-chat-drawer.hidden { display: none; }
.p-chat-handle { width: 40px; height: 4px; background: #d1d5db; border-radius: 2px; margin: 8px auto; }
.p-chat-header { background: #1e2d4a; color: white; padding: 0.6rem 1rem; display: flex; align-items: center; justify-content: space-between; }
.p-chat-header h3 { font-family: 'Cinzel', serif; font-size: 0.875rem; }
.p-chat-close { background: none; border: none; color: white; font-size: 1.1rem; cursor: pointer; }
.p-chat-messages { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
.p-chat-msg { display: flex; flex-direction: column; }
.p-chat-msg.user { align-items: flex-end; }
.p-chat-msg.assistant { align-items: flex-start; }
.p-chat-bubble { max-width: 82%; padding: 0.55rem 0.9rem; border-radius: 12px; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; }
.p-chat-msg.user .p-chat-bubble { background: #1e2d4a; color: white; border-bottom-right-radius: 4px; }
.p-chat-msg.assistant .p-chat-bubble { background: #f0f0ee; color: #2c2c2c; border-bottom-left-radius: 4px; }
.p-chat-ts { font-size: 0.68rem; color: #9ca3af; margin-top: 2px; }
.p-chat-input-row { padding: 0.65rem 0.75rem; border-top: 1px solid rgba(0,0,0,0.08); display: flex; gap: 0.5rem; align-items: flex-end; }
.p-chat-input-row textarea { flex: 1; font-family: 'Lora', serif; font-size: 0.875rem; border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; padding: 0.5rem 0.65rem; resize: none; outline: none; min-height: 40px; max-height: 100px; }
.p-chat-input-row textarea:focus { border-color: #1e2d4a; }

/* Attendance Calendar */
.p-cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.p-cal-month { font-family: 'Cinzel', serif; font-size: 0.95rem; color: #1a3a2a; }
.p-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-bottom: 0.5rem; }
.p-cal-dow { text-align: center; font-size: 0.7rem; font-weight: 700; color: #6b7280; padding: 0.2rem; text-transform: uppercase; }
.p-cal-day { aspect-ratio: 1; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
.p-cal-day.school { background: #dcfce7; color: #166534; font-weight: 600; }
.p-cal-day.started { background: #fef3c7; color: #92400e; }
.p-cal-day.weekend { color: #9ca3af; }
.p-cal-day.future { color: #d1d5db; }
.p-cal-day.empty { }
.p-cal-day:hover:not(.future):not(.weekend):not(.empty) { opacity: 0.75; }
.p-cal-summary { font-size: 0.78rem; color: #6b7280; text-align: right; margin-bottom: 1.5rem; }
.p-cal-popup { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); z-index: 400; padding: 1rem; }
.p-cal-popup-card { background: white; border-radius: 12px; padding: 1.25rem; max-width: 320px; width: 100%; }
.p-cal-popup-card h3 { font-family: 'Cinzel', serif; font-size: 0.9rem; color: #1a3a2a; margin-bottom: 0.75rem; }

/* Memory Work */
.p-mem-filter { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.p-mem-filter select { font-family: 'Lora', serif; font-size: 0.8rem; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; padding: 0.3rem 0.5rem; background: white; outline: none; }
.p-mem-group { margin-bottom: 1.25rem; }
.p-mem-group-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid rgba(0,0,0,0.08); }
.p-mem-item { background: white; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); margin-bottom: 0.5rem; overflow: hidden; }
.p-mem-item-header { padding: 0.65rem 0.85rem; cursor: pointer; display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
.p-mem-item-header:hover { background: #f9f8f6; }
.p-mem-ref { font-weight: 600; font-size: 0.83rem; color: #1e2d4a; }
.p-mem-preview { font-size: 0.78rem; color: #6b7280; margin-top: 0.2rem; }
.p-mem-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; flex-shrink: 0; }
.p-mem-badge { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 999px; text-transform: uppercase; }
.p-mem-badge.learning { background: #dbeafe; color: #1e40af; }
.p-mem-badge.reciting { background: #fef3c7; color: #92400e; }
.p-mem-badge.mastered { background: #dcfce7; color: #166534; }
.p-mem-badge.student { background: #f3e8ff; color: #6b21a8; }
.p-mem-item-body { border-top: 1px solid rgba(0,0,0,0.07); padding: 0.75rem 0.85rem; }
.p-mem-full-text { font-size: 0.83rem; line-height: 1.6; background: #f9f8f6; border-radius: 6px; padding: 0.5rem 0.75rem; margin-bottom: 0.75rem; }

/* Portfolio */
.p-port-tabs { display: flex; margin-bottom: 1rem; border-bottom: 2px solid rgba(0,0,0,0.08); }
.p-port-tab { border: none; background: none; padding: 0.6rem 1.25rem; font-family: 'Lora', serif; font-size: 0.875rem; font-weight: 600; color: #6b7280; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -2px; transition: all 0.15s; }
.p-port-tab.active { color: #1a3a2a; border-bottom-color: #1a3a2a; }
.p-port-stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
.p-port-stat { background: white; border-radius: 8px; padding: 0.75rem; text-align: center; border: 1px solid rgba(0,0,0,0.07); }
.p-port-stat-val { font-family: 'Cinzel', serif; font-size: 1.5rem; font-weight: 700; color: #1a3a2a; }
.p-port-stat-label { font-size: 0.72rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }

/* Settings */
.p-settings-section { margin-bottom: 1.5rem; }
.p-settings-section h3 { font-family: 'Cinzel', serif; font-size: 0.875rem; color: #1a3a2a; margin-bottom: 0.75rem; }
.p-danger-zone { background: #fff5f5; border: 1.5px solid #fca5a5; border-radius: 10px; padding: 1rem; }
.p-danger-zone h3 { color: #dc2626; }

/* Confirmation Dialog */
.p-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.p-modal { background: white; border-radius: 14px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto; padding: 1.5rem; }
.p-modal h2 { font-family: 'Cinzel', serif; font-size: 1rem; color: #1a3a2a; margin-bottom: 1rem; }
.p-modal-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 1rem; }
.p-modal-table th { background: #1a3a2a; color: white; padding: 0.5rem 0.6rem; text-align: left; font-weight: 600; }
.p-modal-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(0,0,0,0.07); }
.p-modal-table tr:nth-child(even) td { background: #f9f8f6; }
.p-modal-table input, .p-modal-table select { width: 100%; font-family: 'Lora', serif; font-size: 0.82rem; border: 1px solid rgba(0,0,0,0.12); border-radius: 4px; padding: 0.25rem 0.4rem; }
.p-modal-actions { display: flex; gap: 0.6rem; justify-content: flex-end; flex-wrap: wrap; }

/* Toast */
.p-toast { position: fixed; top: 1rem; right: 1rem; background: #1a3a2a; color: white; border-radius: 8px; padding: 0.75rem 1.1rem; font-size: 0.875rem; z-index: 1000; box-shadow: 0 4px 16px rgba(0,0,0,0.2); animation: ptoast 0.2s ease; }
@keyframes ptoast { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

/* Home link */
.p-home-link { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; color: #6b7280; text-decoration: none; padding: 0.4rem 0; }
.p-home-link:hover { color: #1a3a2a; }

/* Misc */
.p-divider { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 1rem 0; }
.p-empty { text-align: center; color: #6b7280; font-size: 0.875rem; padding: 2rem 1rem; }
.p-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.p-text-sm { font-size: 0.8rem; color: #6b7280; }
.p-text-gold { color: #b4a064; }
.p-text-green { color: #1a3a2a; }
.p-mb1 { margin-bottom: 0.5rem; }
.p-mb2 { margin-bottom: 1rem; }
.p-gap { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.p-no-school-banner { background: #f3f4f6; border-radius: 10px; padding: 1.5rem; text-align: center; color: #6b7280; font-size: 0.9rem; }
`;


// ─── Small sub-components ─────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="p-fullscreen">
      <div className="p-spinner" />
      <div style={{fontFamily:"'Cinzel',serif",color:'#1a3a2a',fontSize:'1rem'}}>Iron &amp; Light Johnson Academy</div>
    </div>
  );
}

function LoginScreen() {
  const handleLogin = () => signInWithPopup(auth, googleProvider).catch(console.error);
  return (
    <div className="p-fullscreen">
      <div className="p-login-card">
        <div className="p-school-hero">Iron &amp; Light<br />Johnson Academy</div>
        <div className="p-tagline-hero">Faith · Knowledge · Strength</div>
        <p className="p-login-title">Sign in to access the Daily Planner</p>
        <button className="p-btn p-google-btn p-btn-block" onClick={handleLogin}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{marginRight:8}}><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="#FBBC05" d="M10.53 28.59c-.5-1.45-.79-3-.79-4.59s.29-3.14.79-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/></svg>
          Sign in with Google
        </button>
        <p style={{marginTop:'1.25rem',fontSize:'0.75rem',color:'#9ca3af'}}>Access is restricted to authorized users</p>
      </div>
      <a href="/" className="p-home-link">← Home</a>
    </div>
  );
}

function AccessDeniedScreen({ user }) {
  return (
    <div className="p-fullscreen">
      <div className="p-login-card">
        <div style={{fontSize:'2rem',marginBottom:'0.75rem'}}>🚫</div>
        <div className="p-school-hero">Access Denied</div>
        <p style={{margin:'0.75rem 0',fontSize:'0.875rem',color:'#6b7280'}}>
          {user?.email} is not authorized to access this application.
        </p>
        <button className="p-btn p-btn-outline p-btn-block" onClick={() => signOut(auth)}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="p-toast">{message}</div>;
}


// ─── Chat bubble renderer (handles <button> tags from AI) ────────────────────
function renderChatBubble(text, onApply) {
  const displayText = text.replace(/\s*\[APPLY_DATA\][\s\S]*?\[\/APPLY_DATA\]\s*/g, '').trim();
  const parts = displayText.split(/(<button[^>]*>[\s\S]*?<\/button>)/gi);
  return parts.map((part, i) => {
    const m = part.match(/<button[^>]*>([\s\S]*?)<\/button>/i);
    if (m) {
      return (
        <button
          key={i}
          style={{
            display:'inline-block', marginTop:'0.6rem',
            background:'#1e2d4a', color:'white', border:'none',
            borderRadius:'7px', padding:'0.45rem 1rem',
            fontFamily:'inherit', fontSize:'0.85rem',
            fontWeight:600, cursor:'pointer'
          }}
          onClick={onApply}
        >{m[1]}</button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Planner() {
  // Auth
  const [authState, setAuthState] = useState('loading');
  const [currentUser, setCurrentUser] = useState(null);

  // Navigation
  const [activeTab, setActiveTab] = useState('today');
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [sideMenuView, setSideMenuView] = useState(null);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);

  // Firestore data
  const [todayLog, setTodayLog] = useState(null);
  const [weekSchedule, setWeekSchedule] = useState(null);
  const [compliance, setCompliance] = useState({ daysCompleted: 0, hoursLogged: 0 });
  const [appSettings, setAppSettings] = useState({ defaultHoursPerDay: 5.5, schoolYearStart: '2025-08-25', address: '', studentName1: 'Orion', studentName2: 'Malachi' });
  const [memoryWorkItems, setMemoryWorkItems] = useState([]);
  const [archiveList, setArchiveList] = useState([]);
  const [chatLogs, setChatLogs] = useState([]);
  const [allLogs, setAllLogs] = useState({});

  // Today view
  const [schoolDayStarted, setSchoolDayStarted] = useState(false);
  const [lessonChecks, setLessonChecks] = useState({});
  const [lessonNotes, setLessonNotes] = useState({});
  const [hoursLogged, setHoursLogged] = useState(5.5);
  const [dayNotes, setDayNotes] = useState('');
  const [extraSubjects, setExtraSubjects] = useState({ science: false, history: false, bible: false });
  const [extraDetails, setExtraDetails] = useState({});
  const [showFinalizePanel, setShowFinalizePanel] = useState(false);
  const [resolutions, setResolutions] = useState({});
  const [viewDayOverride, setViewDayOverride] = useState(null);
  const [viewedDayLog, setViewedDayLog] = useState(null);
  const [viewedLessonChecks, setViewedLessonChecks] = useState({});
  const [viewedHoursLogged, setViewedHoursLogged] = useState(5.5);
  const [viewedDayNotes, setViewedDayNotes] = useState('');
  const [newCustomSubject, setNewCustomSubject] = useState('');

  // Week view
  const [weekReport, setWeekReport] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [weekNotes, setWeekNotes] = useState('');
  const [expandedDays, setExpandedDays] = useState({});

  // History
  const [expandedArchive, setExpandedArchive] = useState({});
  const [expandedChatLogs, setExpandedChatLogs] = useState({});

  // Memory work
  const [memFilter, setMemFilter] = useState({ student: 'All', type: 'All', status: 'All' });
  const [showMemForm, setShowMemForm] = useState(false);
  const [newMemItem, setNewMemItem] = useState({ student: 'Both', type: 'Scripture', reference: '', text: '', status: 'Learning' });
  const [expandedMemItems, setExpandedMemItems] = useState({});
  const [editMemItem, setEditMemItem] = useState({});

  // Portfolio
  const [portTab, setPortTab] = useState('orion');

  // Settings
  const [settingsForm, setSettingsForm] = useState({});

  // Attendance calendar
  const [calMonthIdx, setCalMonthIdx] = useState(0);
  const [calPopup, setCalPopup] = useState(null);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const todayId = getTodayId();
  const weekId = getWeekId();
  const dayOfWeek = getDayOfWeek();

  const showToast = useCallback((msg) => setToast(msg), []);

  // ── Auth effect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { setAuthState('unauthenticated'); setCurrentUser(null); }
      else if (ALLOWED_EMAILS.includes(user.email)) { setCurrentUser(user); setAuthState('authorized'); }
      else { setCurrentUser(user); setAuthState('denied'); }
    });
    return unsub;
  }, []);

  // ── jsPDF CDN ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.jspdf) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(s);
    }
  }, []);

  // ── Data loading (authorized only) ───────────────────────────────────────────
  useEffect(() => {
    if (authState !== 'authorized') return;
    const unsubs = [];

    // Today's log
    unsubs.push(onSnapshot(doc(db, 'logs', todayId), snap => {
      const data = snap.data() || {};
      setTodayLog(data);
      setSchoolDayStarted(!!data.startedAt);
      if (data.lessons) {
        const checks = {};
        const notes = {};
        Object.entries(data.lessons).forEach(([s, subjs]) => {
          if (typeof subjs !== 'object' || !subjs) return;
          Object.entries(subjs).forEach(([sub, val]) => {
            if (typeof val !== 'object' || !val) return;
            const key = `${s}_${sub}`;
            checks[key] = val.done || false;
            notes[key] = val.notes || '';
          });
        });
        setLessonChecks(checks);
        setLessonNotes(notes);
      }
      setHoursLogged(data.hoursLogged ?? 5.5);
      setDayNotes(data.dayNotes || '');
      setExtraSubjects(data.extraSubjects || { science: false, history: false, bible: false });
      setExtraDetails(data.extraDetails || {});
    }));

    // Week schedule
    unsubs.push(onSnapshot(doc(db, 'schedule', weekId), async snap => {
      if (snap.exists()) {
        setWeekSchedule(snap.data().days || {});
      } else {
        // Seed schedule
        await setDoc(doc(db, 'schedule', weekId), { days: SEED_SCHEDULE }, { merge: true });
        setWeekSchedule(SEED_SCHEDULE);
      }
    }));

    // Compliance
    unsubs.push(onSnapshot(doc(db, 'compliance', 'nd'), snap => {
      setCompliance(snap.data() || { daysCompleted: 0, hoursLogged: 0 });
    }));

    // Settings
    unsubs.push(onSnapshot(doc(db, 'settings', 'app'), snap => {
      const d = snap.data() || {};
      const merged = { defaultHoursPerDay: 5.5, schoolYearStart: '2025-08-25', address: '', studentName1: 'Orion', studentName2: 'Malachi', ...d };
      setAppSettings(merged);
      setSettingsForm(merged);
    }));

    // Memory work
    unsubs.push(onSnapshot(doc(db, 'memoryWork', 'items'), snap => {
      setMemoryWorkItems(snap.data()?.entries || []);
    }));

    // Archive
    unsubs.push(onSnapshot(collection(db, 'archive'), snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.id > a.id ? 1 : -1));
      setArchiveList(items);
    }));

    // Chat history for today
    unsubs.push(onSnapshot(doc(db, 'chatHistory', todayId), snap => {
      const msgs = snap.data()?.messages || [];
      if (msgs.length > 0) {
        setChatMessages(msgs.map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp?.toDate?.()?.toISOString() || m.timestamp })));
      } else {
        // Load yesterday's last 6
        getDoc(doc(db, 'chatHistory', getYesterdayId())).then(ys => {
          const ym = ys.data()?.messages || [];
          if (ym.length > 0) {
            setChatMessages(ym.slice(-6).map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp?.toDate?.()?.toISOString() || m.timestamp })));
          }
        });
      }
    }));

    // Chat logs history (all dates)
    getDocs(collection(db, 'chatHistory')).then(snap => {
      const logs = snap.docs.map(d => ({ id: d.id, messages: d.data().messages || [] }));
      logs.sort((a, b) => (b.id > a.id ? 1 : -1));
      setChatLogs(logs);
    });

    // All logs for portfolio/calendar
    getDocs(collection(db, 'logs')).then(snap => {
      const data = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setAllLogs(data);
    });

    return () => unsubs.forEach(u => u());
  }, [authState, todayId, weekId]);

  // ── Scroll chat to bottom ────────────────────────────────────────────────────
  useEffect(() => {
    if (chatOpen && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  // ── Load viewed day log when day override changes ────────────────────────────
  useEffect(() => {
    if (!viewDayOverride || authState !== 'authorized') {
      setViewedDayLog(null);
      setViewedLessonChecks({});
      return;
    }
    const vDate = getWeekDateFor(viewDayOverride);
    const vId = getDateId(vDate);
    const unsub = onSnapshot(doc(db, 'logs', vId), snap => {
      const data = snap.data() || {};
      setViewedDayLog({ ...data, _id: vId });
      const checks = {};
      if (data.lessons) {
        Object.entries(data.lessons).forEach(([s, subjs]) => {
          if (typeof subjs !== 'object' || !subjs) return;
          Object.entries(subjs).forEach(([sub, val]) => {
            if (typeof val !== 'object' || !val) return;
            checks[`${s}_${sub}`] = val.done || false;
          });
        });
      }
      setViewedLessonChecks(checks);
      setViewedHoursLogged(data.hoursLogged ?? 5.5);
      setViewedDayNotes(data.dayNotes || '');
    });
    return unsub;
  }, [viewDayOverride, authState]);

  // ── Firestore write helpers ───────────────────────────────────────────────────
  const saveLessonCheck = useCallback(async (student, subject, checked) => {
    await setDoc(doc(db, 'logs', todayId), {
      lessons: { [student]: { [subject]: { done: checked } } }
    }, { merge: true });
  }, [todayId]);

  const saveLessonNote = useCallback(async (student, subject, note) => {
    await setDoc(doc(db, 'logs', todayId), {
      lessons: { [student]: { [subject]: { notes: note } } }
    }, { merge: true });
  }, [todayId]);

  const saveHoursLogged = useCallback(async (hours) => {
    await setDoc(doc(db, 'logs', todayId), { hoursLogged: parseFloat(hours) || 0 }, { merge: true });
  }, [todayId]);

  const saveDayNotes = useCallback(async (notes) => {
    await setDoc(doc(db, 'logs', todayId), { dayNotes: notes }, { merge: true });
  }, [todayId]);

  const saveExtraSubject = useCallback(async (key, active) => {
    await setDoc(doc(db, 'logs', todayId), { extraSubjects: { [key]: active } }, { merge: true });
  }, [todayId]);

  const saveExtraDetail = useCallback(async (key, field, value) => {
    await setDoc(doc(db, 'logs', todayId), { extraDetails: { [key]: { [field]: value } } }, { merge: true });
  }, [todayId]);

  const startSchoolDay = async () => {
    await setDoc(doc(db, 'logs', todayId), { startedAt: new Date(), dayNotes: '', hoursLogged: appSettings.defaultHoursPerDay || 5.5 }, { merge: true });
    setSchoolDayStarted(true);
  };

  const finalizeDay = async () => {
    const hours = parseFloat(hoursLogged) || 0;
    await setDoc(doc(db, 'logs', todayId), { finalized: true, finalizedAt: new Date() }, { merge: true });
    await setDoc(doc(db, 'compliance', 'nd'), {
      daysCompleted: (compliance.daysCompleted || 0) + 1,
      hoursLogged: (compliance.hoursLogged || 0) + hours
    }, { merge: true });
    setShowFinalizePanel(false);
    showToast('Day finalized! Great work today.');
  };

  const handleFinalizeClick = () => {
    const incomplete = getIncompleteLessons();
    if (incomplete.length === 0) { finalizeDay(); return; }
    setShowFinalizePanel(true);
    const res = {};
    incomplete.forEach(item => { res[item.key] = 'pending'; });
    setResolutions(res);
  };

  const getIncompleteLessons = () => {
    if (!weekSchedule || !weekSchedule[dayOfWeek]) return [];
    const day = weekSchedule[dayOfWeek];
    if (day.note) return [];
    const incomplete = [];
    ['orion', 'malachi'].forEach(student => {
      ['reading', 'math'].forEach(subject => {
        if (day[student]?.[subject] && !lessonChecks[`${student}_${subject}`]) {
          incomplete.push({ key: `${student}_${subject}`, student, subject, lesson: day[student][subject] });
        }
      });
    });
    return incomplete;
  };

  const resolveLesson = async (item, action) => {
    if (action === 'carry') {
      // Get next school day and carry forward
      const nextDay = DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(dayOfWeek) + 1) % 5];
      if (nextDay) {
        await setDoc(doc(db, 'schedule', weekId), {
          days: { [nextDay]: { [item.student]: { [item.subject]: item.lesson + ' [carried]' } } }
        }, { merge: true });
      }
      await setDoc(doc(db, 'logs', todayId), {
        lessons: { [item.student]: { [item.subject]: { carried: true } } }
      }, { merge: true });
    } else if (action === 'skip') {
      await setDoc(doc(db, 'logs', todayId), {
        lessons: { [item.student]: { [item.subject]: { skipped: true } } }
      }, { merge: true });
    } else if (action === 'note') {
      await setDoc(doc(db, 'logs', todayId), {
        lessons: { [item.student]: { [item.subject]: { noted: true } } }
      }, { merge: true });
    }
    setResolutions(prev => ({ ...prev, [item.key]: action }));
    const stillPending = Object.values({ ...resolutions, [item.key]: action }).some(v => v === 'pending');
    if (!stillPending) {
      // auto-check lesson and finalize
      await setDoc(doc(db, 'logs', todayId), { lessons: { [item.student]: { [item.subject]: { done: true } } } }, { merge: true });
    }
  };

  const canFinalize = () => {
    const incomplete = getIncompleteLessons();
    return incomplete.every(item => resolutions[item.key] && resolutions[item.key] !== 'pending');
  };

  const saveMemoryItem = async (item) => {
    const existing = memoryWorkItems.filter(i => i.id !== item.id);
    const updated = item.id ? [...existing, item] : [...memoryWorkItems, { ...item, id: Date.now().toString(), dateAdded: new Date().toISOString() }];
    await setDoc(doc(db, 'memoryWork', 'items'), { entries: updated }, { merge: true });
    showToast('Memory work saved.');
  };

  const saveSettings = async () => {
    await setDoc(doc(db, 'settings', 'app'), settingsForm, { merge: true });
    showToast('Settings saved.');
  };

  const deleteArchiveEntry = async (id) => {
    if (!window.confirm('Delete this archive entry? This cannot be undone.')) return;
    await deleteDoc(doc(db, 'archive', id));
    showToast('Entry deleted.');
  };

  const saveToArchive = async (content, label) => {
    const id = todayId;
    await setDoc(doc(db, 'archive', id), { weekLabel: label || getWeekId(), htmlContent: content, createdAt: new Date() });
    showToast('Report saved to archive.');
  };

  const resetWeekSchedule = async () => {
    if (!window.confirm('Reset this week\'s schedule to the seed data?')) return;
    await setDoc(doc(db, 'schedule', weekId), { days: SEED_SCHEDULE });
    showToast('Week schedule reset.');
  };

  const clearTodayLog = async () => {
    if (!window.confirm('Clear today\'s log? This cannot be undone.')) return;
    await setDoc(doc(db, 'logs', todayId), { startedAt: null, finalized: false, lessons: {}, dayNotes: '', hoursLogged: 0 });
    showToast('Today\'s log cleared.');
  };

  const saveWeekNotes = useCallback(async (notes) => {
    await setDoc(doc(db, 'schedule', weekId), { weekNotes: notes }, { merge: true });
  }, [weekId]);

  // ── Parse AI response into confirmation dialog rows ───────────────────────────
  const handleApplyFromChat = (aiText) => {
    // Primary: extract structured JSON block [APPLY_DATA]...[/APPLY_DATA]
    const jsonMatch = aiText.match(/\[APPLY_DATA\]([\s\S]*?)\[\/APPLY_DATA\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const rows = (parsed.rows || []).map(r => ({ ...r, checked: true }));
        if (rows.length > 0) { setConfirmDialog({ rows }); return; }
      } catch {}
    }

    // Fallback: text parsing with markdown stripped
    const rows = [];
    const lines = aiText.split('\n').filter(l => l.trim());
    let day = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday' ? 'Tuesday' : dayOfWeek;
    let student = 'Both';
    let subject = 'Bible';
    let lesson = '';

    lines.forEach(line => {
      // Strip markdown bold markers before matching
      const stripped = line.replace(/\*\*/g, '').replace(/^\s*[-•]\s*/, '').trim();
      const dayMatch = stripped.match(/(?:date|day)[:\s]+(\w+day)/i);
      const studentMatch = stripped.match(/students?[:\s]+(both|orion|malachi)/i);
      const subjectMatch = stripped.match(/subject[:\s]+(\w+)/i);
      const lessonMatch = stripped.match(/lesson[:\s]+(.+)/i);

      if (dayMatch) day = dayMatch[1];
      if (studentMatch) student = studentMatch[1].charAt(0).toUpperCase() + studentMatch[1].slice(1).toLowerCase();
      if (subjectMatch) subject = subjectMatch[1].charAt(0).toUpperCase() + subjectMatch[1].slice(1).toLowerCase();
      if (lessonMatch) lesson = lessonMatch[1].trim();
    });

    if (student === 'Both') {
      rows.push({ day, student: 'Orion', subject, lesson, checked: true });
      rows.push({ day, student: 'Malachi', subject, lesson, checked: true });
    } else {
      rows.push({ day, student, subject, lesson, checked: true });
    }

    setConfirmDialog({ rows });
  };

  // ── Chat ──────────────────────────────────────────────────────────────────────
  const sendChatMessage = async (text) => {
    if (!text.trim() || chatLoading) return;
    const user = auth.currentUser;
    if (!user) return;

    const userMsg = { role: 'user', text, timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const token = await user.getIdToken();
      await setDoc(doc(db, 'chatHistory', todayId), {
        messages: arrayUnion({ role: 'user', text, timestamp: new Date() }),
        updatedAt: new Date()
      }, { merge: true });

      const context = chatMessages.slice(-12).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }));
      context.push({ role: 'user', content: text });

      const resp = await fetch('/.netlify/functions/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ system: CHAT_SYSTEM_PROMPT, messages: context })
      });
      const data = await resp.json();
      const aiText = data.content?.[0]?.text || 'Sorry, I could not process that request.';
      const aiMsg = { role: 'assistant', text: aiText, timestamp: new Date().toISOString() };
      setChatMessages(prev => [...prev, aiMsg]);
      if (!chatOpen) setChatUnread(true);

      await setDoc(doc(db, 'chatHistory', todayId), {
        messages: arrayUnion({ role: 'assistant', text: aiText, timestamp: new Date() }),
        updatedAt: new Date()
      }, { merge: true });

      // Check if AI response contains schedule data to apply
      if (aiText.includes('Apply to Schedule') || aiText.includes('apply to schedule')) {
        // Parse any table-like schedule data from the AI response
        // and offer confirmation dialog
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Error connecting to AI: ' + err.message, timestamp: new Date().toISOString() }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Generate weekly report ────────────────────────────────────────────────────
  const generateWeekReport = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setGeneratingReport(true);
    try {
      const token = await user.getIdToken();
      const weekData = { schedule: weekSchedule, logs: allLogs, week: weekId };
      const resp = await fetch('/.netlify/functions/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          system: CHAT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Generate a 5-section weekly homeschool report for the week of ${weekId}. Use exactly these section headers: WEEK AT A GLANCE, ORION, MALACHI, HIGHLIGHTS & OBSERVATIONS, NOTES FOR NEXT WEEK. Keep each section concise and professional. Data: ${JSON.stringify(weekData)}` }]
        })
      });
      const data = await resp.json();
      setWeekReport(data.content?.[0]?.text || 'Unable to generate report.');
    } catch (err) {
      setWeekReport('Error generating report: ' + err.message);
    } finally {
      setGeneratingReport(false);
    }
  };

  // ── Download PDF ──────────────────────────────────────────────────────────────
  const downloadPDF = (content, title) => {
    if (!window.jspdf) { alert('PDF library is still loading, please try again in a moment.'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 54;

    // Green header
    pdf.setFillColor(26, 58, 42);
    pdf.rect(0, 0, pageW, 72, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('times', 'bold');
    pdf.setFontSize(16);
    pdf.text('Iron & Light Johnson Academy', pageW / 2, 30, { align: 'center' });
    pdf.setFontSize(10);
    pdf.setTextColor(180, 160, 100);
    pdf.text('Faith · Knowledge · Strength', pageW / 2, 46, { align: 'center' });
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(11);
    pdf.text(title || 'Weekly Report', pageW / 2, 62, { align: 'center' });

    // Gold divider
    pdf.setDrawColor(180, 160, 100);
    pdf.setLineWidth(1);
    pdf.line(margin, 80, pageW - margin, 80);

    // Content
    pdf.setTextColor(44, 44, 44);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(content || '', pageW - margin * 2);
    let y = 96;
    lines.forEach(line => {
      if (y > pageH - 48) {
        pdf.addPage();
        y = 36;
        pdf.setFillColor(26, 58, 42);
        pdf.rect(0, pageH - 36, pageW, 36, 'F');
        pdf.setTextColor(180, 160, 100);
        pdf.setFontSize(8);
        pdf.text('Iron & Light Johnson Academy · Faith · Knowledge · Strength', pageW / 2, pageH - 16, { align: 'center' });
        pdf.setTextColor(44, 44, 44);
        pdf.setFontSize(11);
      }
      pdf.text(line, margin, y);
      y += 16;
    });

    // Footer on last page
    pdf.setFillColor(26, 58, 42);
    pdf.rect(0, pageH - 36, pageW, 36, 'F');
    pdf.setTextColor(180, 160, 100);
    pdf.setFontSize(8);
    pdf.text('Iron & Light Johnson Academy · Faith · Knowledge · Strength', pageW / 2, pageH - 16, { align: 'center' });

    pdf.save(`IronLight_${todayId}.pdf`);
  };

  // ── Archive as HTML ───────────────────────────────────────────────────────────
  const archiveAsHTML = async (content, label) => {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${label} — Iron & Light Johnson Academy</title><style>body{font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:2rem;color:#2c2c2c}h1{color:#1a3a2a}pre{white-space:pre-wrap;line-height:1.7}</style></head><body><h1>Iron &amp; Light Johnson Academy</h1><h2>${label}</h2><pre>${content}</pre></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IronLight_${todayId}.html`;
    a.click();
    URL.revokeObjectURL(url);
    await saveToArchive(html, label);
  };

  // ── Apply schedule from confirmation dialog ───────────────────────────────────
  const applyScheduleDialog = async () => {
    if (!confirmDialog) return;
    const checked = confirmDialog.rows.filter(r => r.checked);
    for (const row of checked) {
      // Use dot-notation paths so we don't overwrite sibling fields
      const path = `days.${row.day}.${row.student.toLowerCase()}.${row.subject.toLowerCase()}`;
      try {
        await updateDoc(doc(db, 'schedule', weekId), { [path]: row.lesson });
      } catch {
        // Document may not exist yet — create it first then update
        await setDoc(doc(db, 'schedule', weekId), { days: {} }, { merge: true });
        await updateDoc(doc(db, 'schedule', weekId), { [path]: row.lesson });
      }
    }
    setConfirmDialog(null);
    showToast(`${checked.length} lesson${checked.length !== 1 ? 's' : ''} added to schedule.`);
  };

  // ── ND Year-End PDF ───────────────────────────────────────────────────────────
  const generateNDReport = () => {
    const content = [
      `NORTH DAKOTA HOMESCHOOL ANNUAL REPORT`,
      `Iron & Light Johnson Academy`,
      appSettings.address || '',
      `School Year: August 25, 2025 – June 2026`,
      ``,
      `ATTENDANCE SUMMARY`,
      `Total Days Completed: ${totalDays} of 175 required`,
      `Total Hours Logged: ${totalHours.toFixed(1)} of 1025 required`,
      ``,
      `STUDENTS`,
      `• ${appSettings.studentName1 || 'Orion'} — Reading 3 / Math 3`,
      `• ${appSettings.studentName2 || 'Malachi'} — Reading 2 / Math 2`,
      ``,
      `SUBJECTS COVERED`,
      `• Language Arts / Reading`,
      `• Mathematics`,
      `• Science`,
      `• History / Social Studies`,
      `• Bible / Faith Studies`,
      ``,
      `I certify that the above information is accurate to the best of my knowledge.`,
      ``,
      `Signature: _________________________  Date: _______________`,
      ``,
      `Parent/Guardian of ${appSettings.studentName1 || 'Orion'} and ${appSettings.studentName2 || 'Malachi'}`
    ].join('\n');
    downloadPDF(content, 'Annual ND Compliance Report');
  };


  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderTodayView = () => {
    const effectiveDay = viewDayOverride || dayOfWeek;
    const isViewingToday = !viewDayOverride;
    const effectiveDayIdx = DAYS_OF_WEEK.indexOf(effectiveDay);
    const effectiveDate = isViewingToday ? new Date() : getWeekDateFor(effectiveDay);

    const daySchedule = weekSchedule?.[effectiveDay];
    const isNoSchool = !daySchedule || daySchedule?.note === 'No School';
    const isWeekend = ['Saturday', 'Sunday'].includes(dayOfWeek) && isViewingToday;

    // Day nav arrows (always shown in today view)
    const dayNavRow = (
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem'}}>
        <button
          className="p-btn p-btn-ghost p-btn-sm"
          disabled={effectiveDayIdx <= 0}
          onClick={() => setViewDayOverride(effectiveDayIdx === 1 ? null : DAYS_OF_WEEK[effectiveDayIdx - 1])}
        >← Prev</button>
        {!isViewingToday && (
          <button className="p-btn p-btn-outline p-btn-sm" onClick={() => setViewDayOverride(null)}>
            Today
          </button>
        )}
        <button
          className="p-btn p-btn-ghost p-btn-sm"
          disabled={effectiveDayIdx >= DAYS_OF_WEEK.length - 1}
          onClick={() => setViewDayOverride(DAYS_OF_WEEK[effectiveDayIdx + 1])}
        >Next →</button>
      </div>
    );

    // If viewing a future/past day (not today): full editable day log
    if (!isViewingToday) {
      const vDate = getWeekDateFor(effectiveDay);
      const vId = getDateId(vDate);
      const isPast = vDate < new Date(new Date().setHours(0,0,0,0));
      const vLog = viewedDayLog;
      const vFinalized = vLog?.finalized;
      const vStarted = !!vLog?.startedAt;
      const vIsNoSchool = weekSchedule?.[effectiveDay]?.note === 'No School' || (!weekSchedule?.[effectiveDay] && !vStarted);

      const saveViewedCheck = async (student, subject, checked) => {
        setViewedLessonChecks(p => ({...p,[`${student}_${subject}`]:checked}));
        await setDoc(doc(db, 'logs', vId), { lessons: { [student]: { [subject]: { done: checked } } }, startedAt: vLog?.startedAt || new Date() }, { merge: true });
      };
      const finalizeViewedDay = async () => {
        const hours = parseFloat(viewedHoursLogged) || 0;
        await setDoc(doc(db, 'logs', vId), { finalized: true, finalizedAt: new Date(), hoursLogged: hours, dayNotes: viewedDayNotes }, { merge: true });
        await setDoc(doc(db, 'compliance', 'nd'), { daysCompleted: (compliance.daysCompleted || 0) + 1, hoursLogged: (compliance.hoursLogged || 0) + hours }, { merge: true });
        showToast('Day finalized!');
      };
      const markViewedNoSchool = async () => {
        await setDoc(doc(db, 'schedule', weekId), { days: { [effectiveDay]: { note: 'No School' } } }, { merge: true });
        await setDoc(doc(db, 'logs', vId), { finalized: true, noSchool: true, finalizedAt: new Date() }, { merge: true });
        showToast(`${effectiveDay} marked as No School.`);
      };
      const unmarkViewedNoSchool = async () => {
        const updatedDays = { ...(weekSchedule || {}), [effectiveDay]: { ...(weekSchedule?.[effectiveDay] || {}), note: null } };
        await setDoc(doc(db, 'schedule', weekId), { days: { [effectiveDay]: { note: null } } }, { merge: true });
        showToast(`${effectiveDay} No School mark removed.`);
      };

      return (
        <div>
          {dayNavRow}
          <div className="p-date-header">
            <h2>{formatDateDisplay(vDate)}</h2>
            <div className="p-day-num" style={{color: vFinalized ? '#166534' : isPast ? '#dc2626' : '#b4a064'}}>
              {vFinalized ? (vLog?.noSchool ? 'No School' : '✓ Finalized') : isPast ? 'Incomplete' : 'Upcoming'}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{display:'flex',gap:'0.5rem',marginBottom:'1rem',flexWrap:'wrap'}}>
            {!vIsNoSchool && !vFinalized && (
              <button className="p-btn p-btn-ghost p-btn-sm" onClick={markViewedNoSchool}>Mark as No School</button>
            )}
            {(vIsNoSchool || vLog?.noSchool) && !vFinalized && (
              <button className="p-btn p-btn-ghost p-btn-sm" onClick={unmarkViewedNoSchool}>Remove No School</button>
            )}
          </div>

          {vIsNoSchool || vLog?.noSchool ? (
            <div className="p-no-school-banner">
              <strong>No School</strong>
              {vLog?.noSchool && <p style={{marginTop:'0.5rem',fontSize:'0.82rem',color:'#9ca3af'}}>Marked as no school — not counted in compliance.</p>}
            </div>
          ) : (
            <>
              {/* Lesson cards with checkboxes */}
              <div className="p-students-grid">
                {['orion', 'malachi'].map(student => {
                  const std = ['reading','math'];
                  const extra = Object.keys(daySchedule?.[student] || {}).filter(k => !std.includes(k) && typeof (daySchedule?.[student]?.[k]) === 'string' && daySchedule[student][k]);
                  const subjects = [...std, ...extra];
                  return (
                    <div key={student} className="p-student-card">
                      <div className="p-student-header">{student === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi'}</div>
                      <div className="p-student-body">
                        {subjects.map(subject => {
                          const lesson = daySchedule?.[student]?.[subject];
                          if (!lesson) return null;
                          const key = `${student}_${subject}`;
                          return (
                            <div key={subject} className="p-lesson-row">
                              <div className="p-lesson-check-row">
                                <input
                                  type="checkbox"
                                  checked={!!viewedLessonChecks[key]}
                                  onChange={e => saveViewedCheck(student, subject, e.target.checked)}
                                />
                                <div className="p-lesson-label">
                                  <div className="p-lesson-subject">{subject}</div>
                                  <div className="p-lesson-text">{lesson}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {subjects.length === 0 && <div style={{fontSize:'0.82rem',color:'#9ca3af',padding:'0.5rem 0'}}>No lessons scheduled</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hours + Notes */}
              <div className="p-card">
                <div className="p-field-row">
                  <div className="p-field" style={{flex:3}}>
                    <label>Day Notes</label>
                    <textarea
                      value={viewedDayNotes}
                      placeholder="Notes for this day..."
                      onChange={e => setViewedDayNotes(e.target.value)}
                      onBlur={async e => { await setDoc(doc(db, 'logs', vId), { dayNotes: e.target.value }, { merge: true }); }}
                    />
                  </div>
                  <div className="p-field" style={{flex:1}}>
                    <label>Hours Logged</label>
                    <input
                      type="number" step="0.5" min="0" max="24"
                      value={viewedHoursLogged}
                      onChange={e => setViewedHoursLogged(e.target.value)}
                      onBlur={async e => { await setDoc(doc(db, 'logs', vId), { hoursLogged: parseFloat(e.target.value) || 0 }, { merge: true }); }}
                    />
                  </div>
                </div>
              </div>

              {!vFinalized ? (
                <div style={{textAlign:'center',marginBottom:'1rem'}}>
                  <button className="p-btn p-btn-primary p-btn-lg" onClick={finalizeViewedDay}>
                    Finalize {effectiveDay}
                  </button>
                </div>
              ) : (
                <div style={{textAlign:'center',padding:'1rem',background:'#dcfce7',borderRadius:'10px',marginBottom:'1rem'}}>
                  <span style={{color:'#166534',fontWeight:600}}>✓ {effectiveDay} finalized</span>
                  <button
                    className="p-btn p-btn-ghost p-btn-sm"
                    style={{marginLeft:'1rem'}}
                    onClick={async () => { await setDoc(doc(db, 'logs', vId), { finalized: false }, { merge: true }); showToast('Finalization removed.'); }}
                  >Undo</button>
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    // ── Today view (actual today) ──────────────────────────────────────────────
    if (isWeekend || isNoSchool) {
      return (
        <div>
          {dayNavRow}
          <div className="p-date-header">
            <h2>{formatDateDisplay()}</h2>
            <div className="p-day-num">School Day #{getSchoolDayNumber()}</div>
          </div>
          <div className="p-no-school-banner">
            <div style={{fontSize:'2.5rem',marginBottom:'0.5rem'}}>{isWeekend ? '🏡' : '📖'}</div>
            <strong>{isWeekend ? 'Weekend' : 'No School Today'}</strong>
            <p style={{marginTop:'0.5rem',color:'#9ca3af',fontSize:'0.85rem'}}>Enjoy your rest — see you next school day!</p>
          </div>
        </div>
      );
    }

    if (!schoolDayStarted) {
      // Morning Mode
      return (
        <div>
          {dayNavRow}
          <div className="p-date-header">
            <h2>{formatDateDisplay()}</h2>
            <div className="p-day-num">School Day #{getSchoolDayNumber()}</div>
          </div>
          <div className="p-students-grid">
            {['orion', 'malachi'].map(student => {
              const std = ['reading','math'];
              const extra = Object.keys(daySchedule?.[student] || {}).filter(k => !std.includes(k) && typeof (daySchedule?.[student]?.[k]) === 'string' && daySchedule[student][k]);
              const subjects = [...std, ...extra];
              return (
                <div key={student} className="p-student-card">
                  <div className="p-student-header">{student === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi'}</div>
                  <div className="p-student-body">
                    {subjects.map(subject => {
                      const lesson = daySchedule?.[student]?.[subject];
                      if (!lesson) return null;
                      return (
                        <div key={subject} className="p-lesson-row">
                          <div className="p-lesson-subject">{subject}</div>
                          <div className="p-lesson-text" style={{fontSize:'0.85rem',marginTop:'0.15rem',color:'#6b7280'}}>
                            {lesson}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{textAlign:'center',marginTop:'1.25rem'}}>
            <button className="p-btn p-btn-green p-btn-lg" onClick={startSchoolDay}>
              ▶ Start School Day
            </button>
          </div>
        </div>
      );
    }

    // Logging Mode
    const incomplete = getIncompleteLessons();
    const allResolved = canFinalize();

    return (
      <div>
        {dayNavRow}
        <div className="p-date-header">
          <h2>{formatDateDisplay()}</h2>
          <div className="p-day-num">School Day #{getSchoolDayNumber()} &nbsp;·&nbsp; In session</div>
        </div>

        {/* Lesson cards */}
        <div className="p-students-grid">
          {['orion', 'malachi'].map(student => {
            const std = ['reading','math'];
            const extra = Object.keys(daySchedule?.[student] || {}).filter(k => !std.includes(k) && typeof (daySchedule?.[student]?.[k]) === 'string' && daySchedule[student][k]);
            const subjects = [...std, ...extra];
            return (
              <div key={student} className="p-student-card">
                <div className="p-student-header">{student === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi'}</div>
                <div className="p-student-body">
                  {subjects.map(subject => {
                    const key = `${student}_${subject}`;
                    const lesson = daySchedule?.[student]?.[subject];
                    if (!lesson) return null;
                    const logData = todayLog?.lessons?.[student]?.[subject] || {};
                    return (
                      <div key={subject} className="p-lesson-row">
                        <div className="p-lesson-check-row">
                          <input
                            type="checkbox"
                            checked={!!lessonChecks[key]}
                            onChange={e => { const v = e.target.checked; setLessonChecks(p => ({...p,[key]:v})); saveLessonCheck(student, subject, v); }}
                          />
                          <div className="p-lesson-label">
                            <div className="p-lesson-subject">{subject}</div>
                            <div className="p-lesson-text">
                              {lesson}
                              {logData.carried && <span className="p-badge-carried">carried</span>}
                              {logData.skipped && <span className="p-badge-skipped">skipped</span>}
                            </div>
                          </div>
                        </div>
                        <textarea
                          className="p-lesson-notes"
                          placeholder="Notes..."
                          value={lessonNotes[key] || ''}
                          onChange={e => setLessonNotes(p => ({...p,[key]:e.target.value}))}
                          onBlur={e => saveLessonNote(student, subject, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Extra Subjects */}
        <div className="p-card">
          <div className="p-card-title p-mb1">Extra Subjects</div>
          <div className="p-chips">
            {[
              ['science','Science'],['history','History'],['bible','Bible / Faith'],
              ['handwriting','Handwriting'],['grammar','English Grammar'],['spelling','Spelling'],
              ...((appSettings.customSubjects || []).map(s => [s.toLowerCase().replace(/\s+/g,'_'), s]))
            ].map(([key,label]) => (
              <button
                key={key}
                className={`p-chip${extraSubjects[key] ? ' active' : ''}`}
                onClick={() => { const v = !extraSubjects[key]; setExtraSubjects(p=>({...p,[key]:v})); saveExtraSubject(key,v); }}
              >{label}</button>
            ))}
          </div>
          {[
            ['science','Science'],['history','History'],['bible','Bible / Faith'],
            ['handwriting','Handwriting'],['grammar','English Grammar'],['spelling','Spelling'],
            ...((appSettings.customSubjects || []).map(s => [s.toLowerCase().replace(/\s+/g,'_'), s]))
          ].map(([key,label]) => extraSubjects[key] && (
            <div key={key} className="p-extra-panel">
              <strong style={{fontSize:'0.8rem',color:'#1a3a2a'}}>{label}</strong>
              <div style={{marginTop:'0.5rem'}}>
                <label>Topic / Lesson</label>
                <input
                  type="text"
                  value={extraDetails[key]?.topic || ''}
                  placeholder="What was covered?"
                  onChange={e => setExtraDetails(p=>({...p,[key]:{...p[key],topic:e.target.value}}))}
                  onBlur={e => saveExtraDetail(key, 'topic', e.target.value)}
                />
                <label>Observations</label>
                <textarea
                  value={extraDetails[key]?.observations || ''}
                  placeholder="Teacher notes..."
                  onChange={e => setExtraDetails(p=>({...p,[key]:{...p[key],observations:e.target.value}}))}
                  onBlur={e => saveExtraDetail(key, 'observations', e.target.value)}
                />
              </div>
            </div>
          ))}
          <div style={{display:'flex',gap:'0.5rem',marginTop:'0.5rem',alignItems:'center'}}>
            <input
              type="text"
              placeholder="Add subject..."
              value={newCustomSubject}
              onChange={e => setNewCustomSubject(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newCustomSubject.trim()) {
                  const updated = [...(appSettings.customSubjects || []), newCustomSubject.trim()];
                  setAppSettings(p => ({...p, customSubjects: updated}));
                  setDoc(doc(db, 'settings', 'app'), { customSubjects: updated }, { merge: true });
                  setNewCustomSubject('');
                }
              }}
              style={{flex:1,padding:'0.35rem 0.6rem',fontFamily:'inherit',fontSize:'0.8rem',border:'1px solid rgba(0,0,0,0.12)',borderRadius:'6px',outline:'none'}}
            />
            <button
              className="p-btn p-btn-outline p-btn-sm"
              onClick={() => {
                if (!newCustomSubject.trim()) return;
                const updated = [...(appSettings.customSubjects || []), newCustomSubject.trim()];
                setAppSettings(p => ({...p, customSubjects: updated}));
                setDoc(doc(db, 'settings', 'app'), { customSubjects: updated }, { merge: true });
                setNewCustomSubject('');
              }}
            >+ Add</button>
          </div>
        </div>

        {/* Day Notes + Hours */}
        <div className="p-card">
          <div className="p-field-row">
            <div className="p-field" style={{flex:3}}>
              <label>Day Notes</label>
              <textarea
                value={dayNotes}
                placeholder="General notes for today..."
                onChange={e => setDayNotes(e.target.value)}
                onBlur={e => saveDayNotes(e.target.value)}
              />
            </div>
            <div className="p-field" style={{flex:1}}>
              <label>Hours Logged</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={hoursLogged}
                onChange={e => setHoursLogged(e.target.value)}
                onBlur={e => saveHoursLogged(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Finalize */}
        {!todayLog?.finalized && (
          <div style={{textAlign:'center',marginBottom:'1rem'}}>
            <button className="p-btn p-btn-primary p-btn-lg" onClick={handleFinalizeClick}>
              Finalize Day
            </button>
          </div>
        )}
        {todayLog?.finalized && (
          <div style={{textAlign:'center',padding:'1rem',background:'#dcfce7',borderRadius:'10px',marginBottom:'1rem'}}>
            <span style={{color:'#166534',fontWeight:600}}>✓ Day finalized</span>
          </div>
        )}

        {/* Finalize panel */}
        {showFinalizePanel && incomplete.length > 0 && (
          <div className="p-finalize-panel">
            <div className="p-finalize-title">Resolve incomplete lessons before finalizing</div>
            {incomplete.map(item => {
              const resolved = resolutions[item.key];
              return (
                <div key={item.key} className="p-incomplete-item">
                  <p><strong>{item.student === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi'}</strong> — {item.subject}: {item.lesson}</p>
                  {resolved && resolved !== 'pending' ? (
                    <span style={{color:'#166534',fontSize:'0.82rem'}}>✓ {resolved === 'carry' ? 'Carried forward' : resolved === 'skip' ? 'Skipped' : 'Noted'}</span>
                  ) : (
                    <div className="p-resolution-btns">
                      <button className="p-btn p-btn-gold p-btn-sm" onClick={() => resolveLesson(item, 'carry')}>Carry Forward</button>
                      <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => resolveLesson(item, 'skip')}>Skip</button>
                      <button className="p-btn p-btn-outline p-btn-sm" onClick={() => resolveLesson(item, 'note')}>Note It</button>
                    </div>
                  )}
                </div>
              );
            })}
            {allResolved && (
              <button className="p-btn p-btn-primary p-btn-block" style={{marginTop:'0.75rem'}} onClick={finalizeDay}>
                Finalize Day Now
              </button>
            )}
          </div>
        )}
      </div>
    );
  };


  const renderWeekView = () => {
    const weekLabel = `Week ${weekId}`;
    const planAheadRef = React.createRef();

    const toggleDay = (day) => setExpandedDays(p => ({ ...p, [day]: !p[day] }));

    const getDayStatus = (day) => {
      const logKey = Object.keys(allLogs).find(k => {
        const d = new Date(k);
        return getDayOfWeek(d) === day && getWeekId(d) === weekId;
      });
      if (!logKey) return null;
      const log = allLogs[logKey];
      if (log?.finalized) return 'finalized';
      if (log?.startedAt) return 'started';
      return null;
    };

    return (
      <div>
        <div className="p-week-header">
          <div className="p-week-title">Week of {weekId}</div>
          <div className="p-week-actions">
            <button className="p-btn p-btn-outline p-btn-sm" onClick={() => { fileInputRef.current?.click(); setChatOpen(true); }}>
              Plan Ahead
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={e => { if (e.target.files?.length) { setChatInput(`I'm sending ${e.target.files.length} schedule image(s). Please extract the lesson schedule data and present it in a table format: Day | Student | Subject | Lesson Detail`); setChatOpen(true); } }} />
            <button className="p-btn p-btn-primary p-btn-sm" onClick={generateWeekReport} disabled={generatingReport}>
              {generatingReport ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
        </div>

        {DAYS_OF_WEEK.map(day => {
          const dayData = weekSchedule?.[day];
          const status = getDayStatus(day);
          const expanded = expandedDays[day];
          const logKey = Object.keys(allLogs).find(k => {
            const d = new Date(k);
            return getDayOfWeek(d) === day && getWeekId(d) === weekId;
          });
          const log = logKey ? allLogs[logKey] : null;

          return (
            <div key={day} className="p-day-card">
              <div className="p-day-card-header" onClick={() => toggleDay(day)}>
                <div>
                  <span className="p-day-name">{day}</span>
                  {status === 'finalized' && <span style={{marginLeft:'0.5rem',color:'#166534',fontSize:'0.8rem'}}>✓ Finalized</span>}
                  {status === 'started' && <span style={{marginLeft:'0.5rem',color:'#92400e',fontSize:'0.8rem'}}>○ In Progress</span>}
                </div>
                <span style={{color:'#9ca3af',fontSize:'0.85rem'}}>{expanded ? '▲' : '▼'}</span>
              </div>
              {expanded && (
                <div className="p-day-body">
                  {dayData?.note ? (
                    <p className="p-no-school">{dayData.note}</p>
                  ) : (
                    <>
                      {['orion','malachi'].map(student => {
                        const studentName = student === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi';
                        const std = ['reading','math'];
                        const extra = Object.keys(dayData?.[student] || {}).filter(k => !std.includes(k) && typeof (dayData?.[student]?.[k]) === 'string' && dayData[student][k]);
                        const subjects = [...std, ...extra];
                        return (
                          <div key={student} className="p-day-student">
                            <div className="p-day-student-name">{studentName}</div>
                            {subjects.map(subject => {
                              const lesson = dayData?.[student]?.[subject];
                              if (!lesson) return null;
                              const done = log?.lessons?.[student]?.[subject]?.done;
                              const carried = lesson.includes('[carried]');
                              return (
                                <div key={subject} className="p-day-lesson">
                                  <span className={done ? 'done' : 'undone'}>{done ? '✓' : '○'}</span>
                                  <span style={{fontSize:'0.75rem',fontWeight:600,textTransform:'uppercase',color:'#6b7280',minWidth:48}}>{subject}</span>
                                  <span>{lesson}</span>
                                  {carried && <span className="p-badge-carried">carried</span>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      <div className="p-pacing">
                        {['orion','malachi'].map(student => {
                          const studentName = student === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi';
                          const done = ['reading','math'].filter(s => log?.lessons?.[student]?.[s]?.done).length;
                          const total = ['reading','math'].filter(s => dayData?.[student]?.[s]).length;
                          const pct = total > 0 ? done / total : 0;
                          const label = pct === 1 ? 'On Track' : pct > 0.5 ? 'Ahead' : 'Behind';
                          const cls = pct === 1 ? 'p-pacing-on' : pct > 0.5 ? 'p-pacing-ahead' : 'p-pacing-behind';
                          return <span key={student} className={`p-pacing-badge ${cls}`}>{studentName}: {label}</span>;
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="p-card">
          <div className="p-field">
            <label>Weekly Notes</label>
            <textarea
              value={weekNotes || weekSchedule?.weekNotes || ''}
              placeholder="Notes for this week..."
              onChange={e => setWeekNotes(e.target.value)}
              onBlur={e => saveWeekNotes(e.target.value)}
            />
          </div>
        </div>

        {weekReport && (
          <div className="p-report-panel">
            <div className="p-card-title p-mb1">Weekly Report</div>
            <div className="p-report-content">{weekReport}</div>
            <div className="p-report-actions">
              <button className="p-btn p-btn-primary p-btn-sm" onClick={() => downloadPDF(weekReport, `Weekly Report — ${weekId}`)}>Download PDF</button>
              <button className="p-btn p-btn-outline p-btn-sm" onClick={() => archiveAsHTML(weekReport, `Week ${weekId}`)}>Archive as HTML</button>
              <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => saveToArchive(`<pre>${weekReport}</pre>`, `Week ${weekId}`)}>Save to Archive</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderHistoryView = () => {
    const days = totalDays;
    const hours = totalHours;
    const dayPct = Math.min(100, (days / 175) * 100);
    const hourPct = Math.min(100, (hours / 1025) * 100);
    const remaining = Math.max(0, 175 - days);

    return (
      <div>
        <div className="p-compliance-dashboard">
          <h2>ND Compliance Dashboard</h2>
          <div className="p-comp-stat">
            <div className="p-comp-label"><span>Days Completed</span><span>{days} / 175</span></div>
            <div className="p-comp-bar"><div className="p-comp-fill" style={{width:`${dayPct}%`}} /></div>
          </div>
          <div className="p-comp-stat">
            <div className="p-comp-label"><span>Hours Logged</span><span>{hours?.toFixed(1)} / 1025</span></div>
            <div className="p-comp-bar"><div className="p-comp-fill" style={{width:`${hourPct}%`}} /></div>
          </div>
          <div className="p-comp-meta">
            <span>School Year Start: Aug 25, 2025</span>
            <span>Current Day: #{getSchoolDayNumber()}</span>
            <span>Days Remaining: {remaining}</span>
            <span>Projected Finish: {calcProjectedFinish(days)}</span>
          </div>
        </div>

        <div className="p-section-title">Archive</div>
        {archiveList.length === 0 && <p className="p-empty">No archived reports yet. Generate a weekly report to create one.</p>}
        {archiveList.map(item => (
          <div key={item.id} className="p-archive-item">
            <div className="p-archive-header" onClick={() => setExpandedArchive(p => ({...p,[item.id]:!p[item.id]}))}>
              <div>
                <div className="p-archive-week">{item.weekLabel || item.id}</div>
                <div className="p-archive-date">{formatShortDate(item.id)}</div>
              </div>
              <span style={{color:'#9ca3af'}}>{expandedArchive[item.id] ? '▲' : '▼'}</span>
            </div>
            {expandedArchive[item.id] && (
              <div className="p-archive-body">
                <div className="p-archive-html" dangerouslySetInnerHTML={{__html: item.htmlContent || '<em>No content</em>'}} />
                <div className="p-archive-actions">
                  <button className="p-btn p-btn-outline p-btn-sm" onClick={() => {
                    const blob = new Blob([item.htmlContent], {type:'text/html'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `IronLight_${item.id}.html`; a.click();
                  }}>Download</button>
                  <button className="p-btn p-btn-danger p-btn-sm" onClick={() => deleteArchiveEntry(item.id)}>Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="p-section-title" style={{marginTop:'1.5rem'}}>Chat Logs</div>
        {chatLogs.length === 0 && <p className="p-empty">No chat logs yet.</p>}
        {chatLogs.map(log => (
          <div key={log.id} className="p-chat-log-item">
            <div className="p-chat-log-header" onClick={() => setExpandedChatLogs(p => ({...p,[log.id]:!p[log.id]}))}>
              <span style={{fontSize:'0.85rem',color:'#1a3a2a',fontWeight:600}}>{formatShortDate(log.id)}</span>
              <span style={{fontSize:'0.78rem',color:'#9ca3af'}}>{log.messages.length} messages {expandedChatLogs[log.id] ? '▲' : '▼'}</span>
            </div>
            {expandedChatLogs[log.id] && (
              <div className="p-chat-log-body">
                {log.messages.map((m, i) => (
                  <div key={i} className={`p-chat-log-msg ${m.role}`}>
                    <div className="p-chat-log-bubble">{m.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };


  const renderAttendanceCalendar = () => {
    const months = [];
    for (let m = 7; m <= 17; m++) {
      const y = m < 12 ? 2025 : 2026;
      const mo = m % 12;
      months.push({ year: y, month: mo });
    }
    const cur = months[calMonthIdx] || months[0];
    const monthName = new Date(cur.year, cur.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDay = new Date(cur.year, cur.month, 1).getDay();
    const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate();
    const today = new Date();

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const getLogForDay = (d) => {
      const key = `${cur.year}-${String(cur.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      return allLogs[key];
    };

    const getCellClass = (d) => {
      if (!d) return 'p-cal-day empty';
      const dt = new Date(cur.year, cur.month, d);
      const dow = dt.getDay();
      if (dow === 0 || dow === 6) return 'p-cal-day weekend';
      if (dt > today) return 'p-cal-day future';
      const log = getLogForDay(d);
      if (log?.finalized) return 'p-cal-day school';
      if (log?.startedAt) return 'p-cal-day started';
      return 'p-cal-day';
    };

    const monthDays = Object.keys(allLogs).filter(k => {
      const [y, m] = k.split('-');
      return parseInt(y) === cur.year && parseInt(m) - 1 === cur.month && allLogs[k]?.finalized;
    });
    const monthHours = monthDays.reduce((acc, k) => acc + (allLogs[k]?.hoursLogged || 0), 0);

    return (
      <div>
        <div className="p-cal-nav">
          <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setCalMonthIdx(p => Math.max(0, p-1))}>← Prev</button>
          <span className="p-cal-month">{monthName}</span>
          <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setCalMonthIdx(p => Math.min(months.length-1, p+1))}>Next →</button>
        </div>
        <div className="p-cal-grid">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="p-cal-dow">{d}</div>)}
          {cells.map((d, i) => (
            <div
              key={i}
              className={getCellClass(d)}
              onClick={() => { if (d && getLogForDay(d)) setCalPopup({ d, log: getLogForDay(d), dateStr: `${cur.year}-${String(cur.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }); }}
            >{d || ''}</div>
          ))}
        </div>
        <div className="p-cal-summary">{monthDays.length} school days · {monthHours.toFixed(1)} hours</div>
        {calPopup && (
          <div className="p-cal-popup" onClick={() => setCalPopup(null)}>
            <div className="p-cal-popup-card" onClick={e => e.stopPropagation()}>
              <h3>{formatShortDate(calPopup.dateStr)}</h3>
              <p style={{fontSize:'0.85rem',marginBottom:'0.4rem'}}><strong>Status:</strong> {calPopup.log?.finalized ? '✓ Finalized' : '○ In Progress'}</p>
              <p style={{fontSize:'0.85rem',marginBottom:'0.4rem'}}><strong>Hours:</strong> {calPopup.log?.hoursLogged || 0}</p>
              {calPopup.log?.dayNotes && <p style={{fontSize:'0.82rem',color:'#6b7280',marginTop:'0.4rem'}}>{calPopup.log.dayNotes}</p>}
              <button className="p-btn p-btn-ghost p-btn-sm" style={{marginTop:'0.75rem'}} onClick={() => setCalPopup(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPortfolios = () => {
    const student = portTab;
    const studentName = student === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi';
    const logs = Object.values(allLogs);
    const days = logs.filter(l => l?.finalized).length;
    const hours = logs.reduce((acc, l) => acc + (l?.hoursLogged || 0), 0);
    const mastered = memoryWorkItems.filter(i => (i.student === student || i.student === 'Both') && i.status === 'Mastered');
    const readingLessons = logs.flatMap(l => l?.lessons?.[student]?.reading?.done ? [l?.lessons?.[student]?.reading?.notes] : []).filter(Boolean);

    const exportHTML = () => {
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${studentName} — Portfolio</title><style>body{font-family:Georgia,serif;max-width:700px;margin:2rem auto;padding:2rem;color:#2c2c2c}h1{color:#1a3a2a;font-family:'Cinzel',serif}h2{color:#1e2d4a;border-bottom:1px solid #eee;padding-bottom:0.3rem}ul{line-height:1.8}</style></head><body><h1>${studentName} — Academic Portfolio</h1><h2>Iron &amp; Light Johnson Academy</h2><p><strong>Total School Days:</strong> ${days}<br><strong>Total Hours:</strong> ${hours.toFixed(1)}<br></p><h2>Memory Work Mastered</h2><ul>${mastered.map(i=>`<li>${i.reference} — ${i.text.slice(0,60)}…</li>`).join('')}</ul></body></html>`;
      const blob = new Blob([html], {type:'text/html'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${studentName}_Portfolio.html`; a.click();
    };

    return (
      <div>
        <div className="p-port-tabs">
          {['orion','malachi'].map(s => (
            <button key={s} className={`p-port-tab${portTab===s?' active':''}`} onClick={() => setPortTab(s)}>
              {s === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi'}
            </button>
          ))}
        </div>
        <div className="p-port-stat-row">
          <div className="p-port-stat"><div className="p-port-stat-val">{days}</div><div className="p-port-stat-label">Days</div></div>
          <div className="p-port-stat"><div className="p-port-stat-val">{hours.toFixed(0)}</div><div className="p-port-stat-label">Hours</div></div>
          <div className="p-port-stat"><div className="p-port-stat-val">{mastered.length}</div><div className="p-port-stat-label">Mastered</div></div>
        </div>
        {mastered.length > 0 && (
          <div className="p-card">
            <div className="p-card-title p-mb1">Memory Work Mastered ✦</div>
            {mastered.map((item, i) => (
              <div key={i} style={{fontSize:'0.85rem',borderBottom:'1px solid rgba(0,0,0,0.06)',padding:'0.4rem 0'}}>
                <span style={{color:'#b4a064',marginRight:'0.4rem'}}>✓</span>
                <strong>{item.reference}</strong> — {item.text.slice(0, 80)}{item.text.length > 80 ? '…' : ''}
              </div>
            ))}
          </div>
        )}
        {readingLessons.length > 0 && (
          <div className="p-card">
            <div className="p-card-title p-mb1">Reading Notes</div>
            {readingLessons.slice(0, 20).map((note, i) => (
              <div key={i} style={{fontSize:'0.82rem',color:'#6b7280',padding:'0.25rem 0',borderBottom:'1px solid rgba(0,0,0,0.05)'}}>{note}</div>
            ))}
          </div>
        )}
        <button className="p-btn p-btn-outline p-btn-sm" onClick={exportHTML} style={{marginTop:'0.5rem'}}>Export as HTML</button>
      </div>
    );
  };

  const renderMemoryWork = () => {
    const filtered = memoryWorkItems.filter(item => {
      if (memFilter.student !== 'All' && item.student !== memFilter.student) return false;
      if (memFilter.type !== 'All' && item.type !== memFilter.type) return false;
      if (memFilter.status !== 'All' && item.status !== memFilter.status) return false;
      return true;
    });

    const grouped = {};
    filtered.forEach(item => {
      const key = item.type || 'Other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    const handleSaveNew = async () => {
      await saveMemoryItem({ ...newMemItem, id: Date.now().toString(), dateAdded: new Date().toISOString() });
      setNewMemItem({ student: 'Both', type: 'Scripture', reference: '', text: '', status: 'Learning' });
      setShowMemForm(false);
    };

    const updateItemStatus = async (item, status) => {
      await saveMemoryItem({ ...item, status, ...(status === 'Mastered' ? { dateMastered: new Date().toISOString() } : {}) });
    };

    return (
      <div>
        <div className="p-row p-mb2">
          <div className="p-mem-filter">
            <select value={memFilter.student} onChange={e => setMemFilter(p => ({...p, student: e.target.value}))}>
              <option>All</option><option>Orion</option><option>Malachi</option><option>Both</option>
            </select>
            <select value={memFilter.type} onChange={e => setMemFilter(p => ({...p, type: e.target.value}))}>
              <option>All</option><option>Scripture</option><option>Catechism</option><option>Poem</option><option>Other</option>
            </select>
            <select value={memFilter.status} onChange={e => setMemFilter(p => ({...p, status: e.target.value}))}>
              <option>All</option><option>Learning</option><option>Reciting</option><option>Mastered</option>
            </select>
          </div>
          <button className="p-btn p-btn-green p-btn-sm" onClick={() => setShowMemForm(p => !p)}>+ Add Item</button>
        </div>

        {showMemForm && (
          <div className="p-card p-mb2">
            <div className="p-card-title p-mb1">New Memory Item</div>
            <div className="p-field-row">
              <div className="p-field"><label>Student</label>
                <select value={newMemItem.student} onChange={e => setNewMemItem(p => ({...p, student: e.target.value}))}>
                  <option>Both</option><option>Orion</option><option>Malachi</option>
                </select>
              </div>
              <div className="p-field"><label>Type</label>
                <select value={newMemItem.type} onChange={e => setNewMemItem(p => ({...p, type: e.target.value}))}>
                  <option>Scripture</option><option>Catechism</option><option>Poem</option><option>Other</option>
                </select>
              </div>
              <div className="p-field"><label>Status</label>
                <select value={newMemItem.status} onChange={e => setNewMemItem(p => ({...p, status: e.target.value}))}>
                  <option>Learning</option><option>Reciting</option><option>Mastered</option>
                </select>
              </div>
            </div>
            <div className="p-field"><label>Reference</label>
              <input type="text" value={newMemItem.reference} placeholder="e.g. Psalm 23:1" onChange={e => setNewMemItem(p => ({...p, reference: e.target.value}))} />
            </div>
            <div className="p-field"><label>Full Text</label>
              <textarea value={newMemItem.text} placeholder="Full text to memorize..." onChange={e => setNewMemItem(p => ({...p, text: e.target.value}))} />
            </div>
            <div className="p-gap">
              <button className="p-btn p-btn-primary p-btn-sm" onClick={handleSaveNew}>Save</button>
              <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setShowMemForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {Object.keys(grouped).length === 0 && <p className="p-empty">No memory work items. Add one above!</p>}
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="p-mem-group">
            <div className="p-mem-group-title">{type}</div>
            {items.map(item => {
              const expanded = expandedMemItems[item.id];
              const editing = editMemItem[item.id] || item;
              const statusCls = item.status?.toLowerCase() || 'learning';
              return (
                <div key={item.id} className="p-mem-item">
                  <div className="p-mem-item-header" onClick={() => setExpandedMemItems(p => ({...p,[item.id]:!p[item.id]}))}>
                    <div>
                      <div className="p-mem-ref">{item.reference || '(no reference)'}</div>
                      <div className="p-mem-preview">{item.text?.slice(0, 60)}{item.text?.length > 60 ? '…' : ''}</div>
                    </div>
                    <div className="p-mem-badges">
                      <span className={`p-mem-badge ${statusCls}`}>{item.status}</span>
                      <span className="p-mem-badge student">{item.student}</span>
                      {item.status === 'Mastered' && <span style={{color:'#b4a064'}}>✦</span>}
                    </div>
                  </div>
                  {expanded && (
                    <div className="p-mem-item-body">
                      <div className="p-mem-full-text">{item.text}</div>
                      <div className="p-field-row">
                        <div className="p-field"><label>Reference</label>
                          <input type="text" value={editing.reference || ''} onChange={e => setEditMemItem(p => ({...p,[item.id]:{...editing,reference:e.target.value}}))} />
                        </div>
                        <div className="p-field"><label>Status</label>
                          <select value={editing.status || item.status} onChange={e => setEditMemItem(p => ({...p,[item.id]:{...editing,status:e.target.value}}))}>
                            <option>Learning</option><option>Reciting</option><option>Mastered</option>
                          </select>
                        </div>
                      </div>
                      <div className="p-field"><label>Full Text</label>
                        <textarea value={editing.text || item.text} onChange={e => setEditMemItem(p => ({...p,[item.id]:{...editing,text:e.target.value}}))} />
                      </div>
                      <div className="p-gap">
                        <button className="p-btn p-btn-primary p-btn-sm" onClick={() => { saveMemoryItem({...item,...editing}); setExpandedMemItems(p=>({...p,[item.id]:false})); }}>Save Changes</button>
                        <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setExpandedMemItems(p=>({...p,[item.id]:false}))}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderNDCompliance = () => (
    <div>
      <div className="p-card">
        <div className="p-card-title p-mb1">Current Compliance Status</div>
        <p style={{fontSize:'0.875rem',marginBottom:'0.4rem'}}><strong>Days:</strong> {totalDays} / 175</p>
        <p style={{fontSize:'0.875rem',marginBottom:'0.4rem'}}><strong>Hours:</strong> {totalHours.toFixed(1)} / 1025</p>
        <p style={{fontSize:'0.875rem',marginBottom:'0.4rem'}}><strong>Projected Finish:</strong> {calcProjectedFinish(totalDays)}</p>
        <p style={{fontSize:'0.875rem'}}><strong>Remaining Days:</strong> {Math.max(0, 175 - totalDays)}</p>
      </div>
      <button className="p-btn p-btn-primary" onClick={generateNDReport}>Generate Year-End Report PDF</button>
      <p style={{fontSize:'0.78rem',color:'#6b7280',marginTop:'0.75rem'}}>Generates a formatted PDF suitable for North Dakota homeschool reporting requirements.</p>
    </div>
  );

  const renderSettings = () => (
    <div>
      <div className="p-settings-section">
        <h3>School Year</h3>
        <div className="p-field"><label>School Year Start</label>
          <input type="date" value={settingsForm.schoolYearStart || ''} onChange={e => setSettingsForm(p => ({...p, schoolYearStart: e.target.value}))} />
        </div>
        <div className="p-field"><label>Default Hours Per Day</label>
          <input type="number" step="0.5" min="0" max="24" value={settingsForm.defaultHoursPerDay || 5.5} onChange={e => setSettingsForm(p => ({...p, defaultHoursPerDay: parseFloat(e.target.value)}))} />
        </div>
        <div className="p-field"><label>Academy Address</label>
          <textarea value={settingsForm.address || ''} onChange={e => setSettingsForm(p => ({...p, address: e.target.value}))} placeholder="For ND reports..." style={{minHeight:56}} />
        </div>
      </div>

      <div className="p-settings-section">
        <h3>Students</h3>
        <div className="p-field-row">
          <div className="p-field"><label>Student 1</label>
            <input type="text" value={settingsForm.studentName1 || ''} onChange={e => setSettingsForm(p => ({...p, studentName1: e.target.value}))} placeholder="Orion" />
          </div>
          <div className="p-field"><label>Student 2</label>
            <input type="text" value={settingsForm.studentName2 || ''} onChange={e => setSettingsForm(p => ({...p, studentName2: e.target.value}))} placeholder="Malachi" />
          </div>
        </div>
      </div>

      <button className="p-btn p-btn-primary p-mb2" onClick={saveSettings}>Save Settings</button>

      <hr className="p-divider" />

      <div className="p-settings-section">
        <h3>ND Compliance Starting Values</h3>
        <p style={{fontSize:'0.8rem',color:'#6b7280',marginBottom:'0.75rem'}}>
          If you were already partway through the school year when you started using this app,
          enter your actual totals here so the compliance counter matches reality.
        </p>
        <div className="p-field-row">
          <div className="p-field">
            <label>Days Already Completed</label>
            <input
              type="number" min="0" max="175"
              value={settingsForm.baseDays ?? compliance.baseDays ?? 0}
              onChange={e => setSettingsForm(p => ({...p, baseDays: parseInt(e.target.value) || 0}))}
            />
          </div>
          <div className="p-field">
            <label>Hours Already Logged</label>
            <input
              type="number" min="0" step="0.5"
              value={settingsForm.baseHours ?? compliance.baseHours ?? 0}
              onChange={e => setSettingsForm(p => ({...p, baseHours: parseFloat(e.target.value) || 0}))}
            />
          </div>
        </div>
        <button className="p-btn p-btn-green p-btn-sm" onClick={async () => {
          await setDoc(doc(db, 'compliance', 'nd'), {
            baseDays: parseInt(settingsForm.baseDays) || 0,
            baseHours: parseFloat(settingsForm.baseHours) || 0
          }, { merge: true });
          showToast('Compliance starting values saved.');
        }}>Save Starting Values</button>
      </div>

      <hr className="p-divider" />

      <div className="p-danger-zone">
        <h3>Danger Zone</h3>
        <div className="p-gap" style={{marginTop:'0.75rem'}}>
          <button className="p-btn p-btn-danger p-btn-sm" onClick={resetWeekSchedule}>Reset Week Schedule</button>
          <button className="p-btn p-btn-danger p-btn-sm" onClick={clearTodayLog}>Clear Today's Log</button>
        </div>
      </div>

      <hr className="p-divider" />

      <button className="p-btn p-btn-outline" onClick={() => signOut(auth)}>Sign Out</button>
    </div>
  );


  // ── Confirmation Dialog ────────────────────────────────────────────────────────
  const renderConfirmDialog = () => {
    if (!confirmDialog) return null;
    const rows = confirmDialog.rows || [];
    return (
      <div className="p-modal-overlay" onClick={() => setConfirmDialog(null)}>
        <div className="p-modal" onClick={e => e.stopPropagation()}>
          <h2>Confirm Schedule Changes</h2>
          <p style={{fontSize:'0.82rem',color:'#6b7280',marginBottom:'0.75rem'}}>Review and check the items you want to apply. All items are selected by default.</p>
          <table className="p-modal-table">
            <thead><tr><th></th><th>Day</th><th>Student</th><th>Subject</th><th>Lesson</th></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td><input type="checkbox" checked={!!row.checked} onChange={e => setConfirmDialog(p => ({...p, rows: p.rows.map((r,j) => j===i ? {...r,checked:e.target.checked} : r)}))} /></td>
                  <td><select value={row.day} onChange={e => setConfirmDialog(p => ({...p, rows: p.rows.map((r,j) => j===i ? {...r,day:e.target.value} : r)}))}>
                    {DAYS_OF_WEEK.map(d => <option key={d}>{d}</option>)}
                  </select></td>
                  <td><select value={row.student} onChange={e => setConfirmDialog(p => ({...p, rows: p.rows.map((r,j) => j===i ? {...r,student:e.target.value} : r)}))}>
                    <option>Orion</option><option>Malachi</option><option>Both</option>
                  </select></td>
                  <td><select value={row.subject} onChange={e => setConfirmDialog(p => ({...p, rows: p.rows.map((r,j) => j===i ? {...r,subject:e.target.value} : r)}))}>
                    <option>Reading</option><option>Math</option><option>Science</option><option>History</option><option>Bible</option>
                  </select></td>
                  <td><input type="text" value={row.lesson} onChange={e => setConfirmDialog(p => ({...p, rows: p.rows.map((r,j) => j===i ? {...r,lesson:e.target.value} : r)}))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{display:'flex',gap:'0.5rem',marginBottom:'0.75rem'}}>
            <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setConfirmDialog(p => ({...p, rows: [...p.rows, {day:'Monday',student:'Orion',subject:'Reading',lesson:'',checked:true}]}))}>+ Add Row</button>
            <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setConfirmDialog(p => ({...p, rows: p.rows.slice(0,-1)}))}>Remove Row</button>
          </div>
          <div className="p-modal-actions">
            <button className="p-btn p-btn-ghost" onClick={() => setConfirmDialog(null)}>Cancel</button>
            <button className="p-btn p-btn-primary" onClick={applyScheduleDialog}>Apply to Schedule →</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────────
  if (authState === 'loading') return <LoadingScreen />;
  if (authState === 'unauthenticated') return <LoginScreen />;
  if (authState === 'denied') return <AccessDeniedScreen user={currentUser} />;

  // Total = base offset (days done before app) + days finalized in app
  const totalDays = (compliance.baseDays || 0) + (compliance.daysCompleted || 0);
  const totalHours = (compliance.baseHours || 0) + (compliance.hoursLogged || 0);
  const dayPct = Math.min(100, (totalDays / 175) * 100);
  const hourPct = Math.min(100, (totalHours / 1025) * 100);

  const subviewTitles = { attendance:'Attendance Calendar', portfolios:'Student Portfolios', memorywork:'Memory Work', compliance:'ND Compliance', settings:'Settings' };

  return (
    <div className="pw">
      <style>{styles}</style>

      {/* Top Bar */}
      <header className="p-topbar">
        <button className="p-topbar-menu-btn" onClick={() => setSideMenuOpen(true)} aria-label="Menu">☰</button>
        <div className="p-topbar-center">
          <div className="p-topbar-name">Iron &amp; Light Johnson Academy</div>
          <div className="p-topbar-tagline">Faith · Knowledge · Strength <span style={{opacity:0.6,marginLeft:'0.3rem'}}>{APP_VERSION}</span></div>
        </div>
        <div className="p-compliance-mini">
          <div className="p-cm-row">
            <span>{totalDays}/175</span>
            <div className="p-cm-bar"><div className="p-cm-fill" style={{width:`${dayPct}%`}} /></div>
          </div>
          <div className="p-cm-row">
            <span>{totalHours.toFixed(0)}/1025h</span>
            <div className="p-cm-bar"><div className="p-cm-fill" style={{width:`${hourPct}%`}} /></div>
          </div>
        </div>
      </header>

      {/* Tab Nav */}
      <nav className="p-tabnav">
        {[['today','Today'],['week','Week'],['history','History']].map(([id,label]) => (
          <button key={id} className={activeTab===id?'active':''} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="p-main">
        <div style={{marginBottom:'0.5rem'}}>
          <a href="/" className="p-home-link">← Home</a>
        </div>
        {activeTab === 'today' && renderTodayView()}
        {activeTab === 'week' && renderWeekView()}
        {activeTab === 'history' && renderHistoryView()}
      </main>

      {/* Side Menu Overlay */}
      {sideMenuOpen && <div className="p-overlay" onClick={() => setSideMenuOpen(false)} />}
      <aside className={`p-sidemenu${sideMenuOpen?' open':''}`}>
        <div className="p-sidemenu-header">
          <span className="p-sidemenu-title">Iron &amp; Light</span>
          <button className="p-sidemenu-close" onClick={() => setSideMenuOpen(false)}>✕</button>
        </div>
        <nav className="p-sidemenu-nav">
          {[
            ['attendance','📅','Attendance Calendar'],
            ['portfolios','📖','Student Portfolios'],
            ['memorywork','✝','Memory Work'],
            ['compliance','📊','ND Compliance'],
            ['settings','⚙','Settings'],
          ].map(([view,icon,label]) => (
            <button key={view} className="p-sidemenu-item" onClick={() => { setSideMenuView(view); setSideMenuOpen(false); }}>
              <span className="icon">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div style={{padding:'0.75rem 1.25rem',borderTop:'1px solid rgba(0,0,0,0.08)',fontSize:'0.72rem',color:'#9ca3af',display:'flex',justifyContent:'space-between'}}>
          <span>Iron &amp; Light Planner</span>
          <span style={{fontWeight:600,color:'#b4a064'}}>{APP_VERSION}</span>
        </div>
      </aside>

      {/* Side Menu Subviews */}
      {sideMenuView && (
        <div className="p-subview">
          <div className="p-subview-header">
            <button className="p-subview-back" onClick={() => setSideMenuView(null)}>← Back</button>
            <h2>{subviewTitles[sideMenuView]}</h2>
          </div>
          <div className="p-subview-body">
            {sideMenuView === 'attendance' && renderAttendanceCalendar()}
            {sideMenuView === 'portfolios' && renderPortfolios()}
            {sideMenuView === 'memorywork' && renderMemoryWork()}
            {sideMenuView === 'compliance' && renderNDCompliance()}
            {sideMenuView === 'settings' && renderSettings()}
          </div>
        </div>
      )}

      {/* AI Chat Drawer */}
      {!chatOpen && (
        <div className="p-chat-tab" onClick={() => { setChatOpen(true); setChatUnread(false); }}>
          <span className="p-chat-tab-label">
            AI Assistant ✦
            {chatUnread && <span className="p-chat-unread-dot" />}
          </span>
          <span style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.6)'}}>▲ Open</span>
        </div>
      )}
      {chatOpen && (
        <div className="p-chat-drawer">
          <div className="p-chat-handle" />
          <div className="p-chat-header">
            <h3>AI Assistant ✦</h3>
            <button className="p-chat-close" onClick={() => setChatOpen(false)}>▼</button>
          </div>
          <div className="p-chat-messages">
            {chatMessages.length === 0 && (
              <p style={{color:'#9ca3af',fontSize:'0.82rem',textAlign:'center',marginTop:'1rem'}}>
                Ask me about schedules, lessons, compliance, or anything else!
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`p-chat-msg ${msg.role}`}>
                <div className="p-chat-bubble">
                  {msg.role === 'assistant'
                    ? renderChatBubble(msg.text, () => handleApplyFromChat(msg.text))
                    : msg.text}
                </div>
                <span className="p-chat-ts">{formatTime(msg.timestamp)}</span>
              </div>
            ))}
            {chatLoading && (
              <div className="p-chat-msg assistant">
                <div className="p-chat-bubble">
                  <div className="p-dot-spin"><span/><span/><span/></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-chat-input-row">
            <textarea
              placeholder="Ask anything…"
              value={chatInput}
              rows={1}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }}
            />
            <button className="p-btn p-btn-primary p-btn-sm" onClick={() => sendChatMessage(chatInput)} disabled={chatLoading || !chatInput.trim()}>Send</button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {renderConfirmDialog()}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

