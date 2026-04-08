import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth, googleProvider } from '../firebase.js';
import {
  doc, setDoc, updateDoc, onSnapshot, collection, query, orderBy,
  getDocs, deleteDoc, arrayUnion, getDoc
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

// ─── Constants ────────────────────────────────────────────────────────────────
const APP_VERSION = 'v2.5';
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


function getWeekIdWithOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset * 7);
  return getWeekId(d);
}

function getWeekLabel(weekId) {
  // Parse year-week and return "Week of Mon DD"
  const [year, week] = weekId.split('-').map(Number);
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay();
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + ((8 - dayOfWeek) % 7 || 7) - 6);
  const monday = new Date(firstMonday);
  monday.setDate(firstMonday.getDate() + (week - 1) * 7);
  return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Calendar Import Helpers ─────────────────────────────────────────────────
async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return window.pdfjsLib;
}

// Returns { type: 'image', base64, mimeType } for images, or { type: 'text', text } for everything else
async function extractFileContent(file) {
  const name = file.name.toLowerCase();
  const mime = file.type || '';
  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(name);
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');

  if (isImage) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        const base64 = dataUrl.split(',')[1];
        res({ type: 'image', base64, mimeType: mime || 'image/jpeg' });
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  }

  if (isPdf) {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return { type: 'text', text };
  }

  // HTML, ICS, CSV, TXT, or any other text-based file
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      const raw = e.target.result;
      let text = raw;
      // If it looks like HTML, strip style/script and extract visible text
      if (/<html|<body|<div|<table/i.test(raw)) {
        const tmp = document.createElement('div');
        const cleaned = raw
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        tmp.innerHTML = cleaned;
        text = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
      }
      res({ type: 'text', text });
    };
    reader.onerror = rej;
    reader.readAsText(file);
  });
}

function getWeekOffsetForDate(dateStr) {
  const targetWeekId = getWeekId(new Date(dateStr + 'T00:00:00'));
  for (let o = -60; o <= 8; o++) {
    if (getWeekIdWithOffset(o) === targetWeekId) return o;
  }
  return 0;
}

function estimateSchoolDays(startDateStr) {
  const start = new Date(startDateStr || '2025-08-25');
  const today = new Date();
  today.setHours(0,0,0,0);
  let count = 0;
  const d = new Date(start);
  d.setHours(0,0,0,0);
  while (d <= today) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.pw { font-family: 'Lora', Georgia, serif; background: #f8f7f5; color: #1c1c1e; min-height: 100vh; position: relative; }
.pw *, .pw *::before, .pw *::after { box-sizing: border-box; }

/* Loading / Login */
.p-fullscreen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8f7f5; flex-direction: column; gap: 1.5rem; padding: 2rem; }
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
.p-btn { display: inline-flex; align-items: center; gap: 0.4rem; border: none; border-radius: 10px; padding: 0.65rem 1.1rem; font-family: 'Lora', serif; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; text-decoration: none; min-height: 44px; }
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
.p-topbar { position: sticky; top: 0; z-index: 100; background: white; border-bottom: 1px solid rgba(0,0,0,0.08); display: flex; align-items: center; padding: 0.5rem 1rem; gap: 0.75rem; min-height: 52px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.p-topbar-menu-btn { background: none; border: none; cursor: pointer; color: #1a3a2a; font-size: 1.4rem; padding: 0.4rem; line-height: 1; min-height: 44px; display: flex; align-items: center; }
.p-topbar-center { flex: 1; text-align: center; }
.p-topbar-name { font-family: 'Cinzel', serif; font-size: 0.9rem; font-weight: 700; color: #1a3a2a; line-height: 1.2; }
.p-topbar-tagline { font-size: 0.6rem; color: #b4a064; letter-spacing: 0.1em; }
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
.p-main { padding: 1rem; padding-bottom: 130px; max-width: 900px; margin: 0 auto; }

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
.p-card { background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 1.25rem; margin-bottom: 1rem; border: 1px solid rgba(0,0,0,0.05); }
.p-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.p-card-title { font-family: 'Cinzel', serif; font-size: 0.95rem; font-weight: 600; color: #1a3a2a; }

/* Section headers */
.p-section-title { font-family: 'Cinzel', serif; font-size: 0.95rem; font-weight: 600; color: #1a3a2a; margin-bottom: 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid rgba(0,0,0,0.08); }
.p-date-header { text-align: center; margin-bottom: 1.25rem; }
.p-date-header h2 { font-family: 'Cinzel', serif; font-size: 1.1rem; color: #1a3a2a; }
.p-date-header .p-day-num { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }

/* TODAY: lesson rows */
.p-students-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
@media (max-width: 640px) { .p-students-grid { grid-template-columns: 1fr; } }
.p-student-card { background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.05); overflow: hidden; }
.p-student-header { background: #1a3a2a; color: white; padding: 0.75rem 1rem; font-family: 'Cinzel', serif; font-size: 0.875rem; font-weight: 600; }
.p-student-body { padding: 0.9rem; }
.p-lesson-row { margin-bottom: 0.85rem; }
.p-lesson-check-row { display: flex; align-items: flex-start; gap: 0.7rem; }
.p-lesson-check-row input[type=checkbox] { margin-top: 3px; width: 18px; height: 18px; accent-color: #1a3a2a; flex-shrink: 0; cursor: pointer; }
.p-lesson-label { font-size: 0.9rem; line-height: 1.5; flex: 1; }
.p-lesson-subject { font-weight: 700; color: #1a3a2a; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; }
.p-lesson-text { color: #1c1c1e; }
.p-lesson-notes { width: 100%; margin-top: 0.4rem; padding: 0.4rem 0.6rem; font-family: 'Lora', serif; font-size: 0.8rem; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; resize: vertical; min-height: 48px; background: #f9f8f6; outline: none; }
.p-lesson-notes:focus { border-color: #1a3a2a; }
.p-badge-carried { background: #b4a064; color: white; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 999px; margin-left: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em; }
.p-badge-skipped { background: #6b7280; color: white; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 999px; margin-left: 0.35rem; }

/* Extra subjects */
.p-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.p-chip { border: 1.5px solid #1a3a2a; color: #1a3a2a; background: transparent; border-radius: 999px; padding: 0.45rem 1rem; font-size: 0.85rem; font-family: 'Lora', serif; cursor: pointer; transition: all 0.15s; font-weight: 600; min-height: 38px; }
.p-chip.active { background: #1a3a2a; color: white; }
.p-chip:hover { background: #1a3a2a; color: white; }
.p-extra-panel { background: #f8f7f5; border-radius: 12px; padding: 0.9rem; margin-top: 0.5rem; margin-bottom: 0.75rem; }
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
.p-day-card { background: white; border-radius: 14px; margin-bottom: 0.75rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.05); overflow: hidden; border-left: 3px solid #e5e7eb; }
.p-day-card.finalized { border-left-color: #1a3a2a; }
.p-day-card.started { border-left-color: #b4933a; }
.p-day-card-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; cursor: pointer; user-select: none; min-height: 52px; }
.p-day-card-header:hover { background: #f9f8f7; }
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
.p-cal-day.school { background: #dcfce7; color: #166534; font-weight: 600; cursor: pointer; }
.p-cal-day.school:hover { background: #bbf7d0; }
.p-cal-day.started { background: #fef3c7; color: #92400e; cursor: pointer; }
.p-cal-day.started:hover { background: #fde68a; }
.p-cal-day.noschool { background: #f3f4f6; color: #9ca3af; text-decoration: line-through; }
.p-cal-day.sick { background: #dbeafe; color: #1e40af; font-weight: 600; cursor: pointer; }
.p-cal-day.sick:hover { background: #bfdbfe; }
.p-cal-day.off { background: #f3f4f6; color: #6b7280; cursor: pointer; }
.p-cal-day.missing { background: #fee2e2; color: #991b1b; font-weight: 600; cursor: pointer; }
.p-cal-day.missing:hover { background: #fecaca; }
.p-cal-day.preapp { background: #f3f4f6; color: #c4c4c4; font-style: italic; }
.p-cal-legend { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
.p-cal-legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; color: #6b7280; }
.p-cal-legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
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
  const [calMonthIdx, setCalMonthIdx] = useState(() => {
    // Start at current month relative to school year (Aug 2025 = index 0)
    const now = new Date();
    return Math.max(0, (now.getFullYear() - 2025) * 12 + now.getMonth() - 7);
  });
  const [calPopup, setCalPopup] = useState(null); // { dateStr, log, missing }

  // Specific date view (from calendar tap)
  const [specificDate, setSpecificDate] = useState(null); // YYYY-MM-DD
  const [specificDateLog, setSpecificDateLog] = useState(null);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const [newWeekModal, setNewWeekModal] = useState(null);

  // Inline editing
  const [editingLesson, setEditingLesson] = useState(null);

  // Photo import
  const [pendingImages, setPendingImages] = useState([]);

  // Setup Wizard
  const [setupWizardOpen, setSetupWizardOpen] = useState(false);
  const [setupWizardStep, setSetupWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({});
  const [calImporting, setCalImporting] = useState(false);
  const [calImportResult, setCalImportResult] = useState(null);
  const [calInputMode, setCalInputMode] = useState('import'); // 'import' | 'estimate' | 'manual'
  const [calChatMessages, setCalChatMessages] = useState([]);
  const [calChatInput, setCalChatInput] = useState('');
  const [calChatLoading, setCalChatLoading] = useState(false);
  const calChatEndRef = useRef(null);
  const calFileInputRef = useRef(null);

  // Toast
  const [toast, setToast] = useState(null);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const todayId = getTodayId();
  const weekId = getWeekIdWithOffset(weekOffset);
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
        setWeekSchedule(null);
        setNewWeekModal(weekId);
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

  // ── Load specific date log when navigating from calendar ─────────────────────
  useEffect(() => {
    if (!specificDate || authState !== 'authorized') { setSpecificDateLog(null); return; }
    // Try allLogs first, fall back to Firestore fetch
    if (allLogs[specificDate] !== undefined) {
      setSpecificDateLog(allLogs[specificDate] || {});
    } else {
      getDoc(doc(db, 'logs', specificDate)).then(snap => setSpecificDateLog(snap.data() || {}));
    }
  }, [specificDate, authState, allLogs]);

  // ── Auto-trigger setup wizard for new users ───────────────────────────────────
  useEffect(() => {
    if (authState !== 'authorized') return;
    // Show wizard if no compliance data has ever been set (truly fresh install)
    if (compliance.baseDays === undefined && compliance.daysCompleted === 0 && Object.keys(allLogs).length === 0) {
      setSetupWizardOpen(true);
      setSetupWizardStep(1);
      setWizardData({
        schoolYearStart: appSettings.schoolYearStart || '2025-08-25',
        defaultHoursPerDay: appSettings.defaultHoursPerDay || 5.5,
        studentName1: appSettings.studentName1 || 'Orion',
        studentName2: appSettings.studentName2 || 'Malachi',
        address: appSettings.address || '',
        baseDays: 0,
        baseHours: 0,
      });
    }
  }, [authState, compliance.baseDays, compliance.daysCompleted, allLogs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const saveExtraDetailFull = useCallback(async (key, details) => {
    await setDoc(doc(db, 'logs', todayId), { extraDetails: { [key]: details } }, { merge: true });
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

    // Capture and clear pending images
    const imagesToSend = pendingImages.slice();
    setPendingImages([]);

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

      // Build last message with optional images
      const lastMsg = imagesToSend.length > 0
        ? {
            role: 'user',
            content: [
              ...imagesToSend.map(img => ({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.base64 } })),
              { type: 'text', text }
            ]
          }
        : { role: 'user', content: text };
      context.push(lastMsg);

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

  // ── Calendar AI parser ────────────────────────────────────────────────────────
  const parseCalendarWithAI = async (text, startDateStr) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const token = await user.getIdToken();
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const prompt = `You are a school calendar analyzer. Count the number of school days (Monday–Friday only, excluding any day labeled No School, Holiday, Break, Vacation, or similar) in the provided calendar from ${startDateStr || '2025-08-25'} through ${today}. Reply with EXACTLY one line in this format:\nSCHOOL_DAYS: <number>\n\nCalendar text:\n${text.slice(0, 6000)}`;
    const resp = await fetch('/.netlify/functions/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ system: 'You are a school calendar analyzer. Be precise and return only the requested format.', messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    const aiText = data.content?.[0]?.text || '';
    const match = aiText.match(/SCHOOL_DAYS:\s*(\d+)/i);
    if (match) return parseInt(match[1], 10);
    throw new Error('Could not parse day count from calendar. AI response: ' + aiText.slice(0, 200));
  };

  // ── Save wizard data to Firestore ─────────────────────────────────────────────
  const saveWizardData = async (data) => {
    const settingsUpdate = {};
    if (data.schoolYearStart) settingsUpdate.schoolYearStart = data.schoolYearStart;
    if (data.defaultHoursPerDay != null) settingsUpdate.defaultHoursPerDay = parseFloat(data.defaultHoursPerDay);
    if (data.studentName1) settingsUpdate.studentName1 = data.studentName1;
    if (data.studentName2) settingsUpdate.studentName2 = data.studentName2;
    if (data.address != null) settingsUpdate.address = data.address;
    // Extra students beyond 2
    if (data.extraStudents?.length > 0) {
      data.extraStudents.forEach((name, i) => {
        if (name.trim()) settingsUpdate[`studentName${i + 3}`] = name.trim();
      });
    }
    // Save today as tracking start — days before this won't be flagged as missing
    settingsUpdate.trackingStartDate = getTodayId();
    if (Object.keys(settingsUpdate).length > 0) {
      await setDoc(doc(db, 'settings', 'app'), settingsUpdate, { merge: true });
    }
    const baseDays = parseInt(data.baseDays) || 0;
    const baseHours = parseFloat(data.baseHours) || 0;
    await setDoc(doc(db, 'compliance', 'nd'), { baseDays, baseHours }, { merge: true });
    showToast('Setup complete! Your tracker is now synced.');
  };

  // ── Calendar chat (wizard step 5) ─────────────────────────────────────────────
  const sendCalendarMessage = async (text, fileContent = null) => {
    const user = auth.currentUser;
    if (!user || calChatLoading) return;
    setCalChatLoading(true);

    const startDate = wizardData.schoolYearStart || '2025-08-25';
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Build user message for display
    const userMsg = { role: 'user', text: text || (fileContent ? `[Uploaded file]` : ''), fileContent };
    setCalChatMessages(prev => [...prev, userMsg]);
    setCalChatInput('');
    setTimeout(() => calChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      const token = await user.getIdToken();
      const calSystem = `You are a school calendar analyzer helping count school days for Iron & Light Johnson Academy. The school year started ${startDate}. Today is ${today}. Count Monday–Friday days only, excluding any days labeled No School, Holiday, Break, Vacation, or similar. When you have a confident count, always include the line "SCHOOL_DAYS: N" somewhere in your response. Ask clarifying questions if needed. Be concise and friendly.`;

      // Build context from previous messages
      const context = calChatMessages.slice(-8).map(m => ({
        role: m.role,
        content: m.role === 'user' && m.fileContent?.type === 'image'
          ? [{ type: 'image', source: { type: 'base64', media_type: m.fileContent.mimeType, data: m.fileContent.base64 } }, { type: 'text', text: m.text || 'Please analyze this calendar.' }]
          : m.text
      }));

      // Build new user message
      let newContent;
      if (fileContent?.type === 'image') {
        newContent = [
          { type: 'image', source: { type: 'base64', media_type: fileContent.mimeType, data: fileContent.base64 } },
          { type: 'text', text: text || `Please analyze this calendar and count school days from ${startDate} to today.` }
        ];
      } else if (fileContent?.type === 'text') {
        newContent = `${text || `Count school days from ${startDate} to today.`}\n\nCalendar content:\n${fileContent.text.slice(0, 8000)}`;
      } else {
        newContent = text;
      }
      context.push({ role: 'user', content: newContent });

      const resp = await fetch('/.netlify/functions/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ system: calSystem, messages: context })
      });
      const data = await resp.json();
      const aiText = data.content?.[0]?.text || 'Sorry, I could not process that.';

      // Extract day count if present
      const match = aiText.match(/SCHOOL_DAYS:\s*(\d+)/i);
      const detectedDays = match ? parseInt(match[1], 10) : null;

      setCalChatMessages(prev => [...prev, { role: 'assistant', text: aiText, detectedDays }]);
      setTimeout(() => calChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setCalChatMessages(prev => [...prev, { role: 'assistant', text: 'Error: ' + err.message }]);
    } finally {
      setCalChatLoading(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderTodayView = () => {
    // Back-to-calendar banner (set when navigating here from attendance calendar)
    const calBackBanner = specificDate ? (
      <button className="p-btn p-btn-ghost p-btn-sm" style={{marginBottom:'0.75rem'}}
        onClick={() => { setSpecificDate(null); setViewDayOverride(null); setSideMenuView('attendance'); setSideMenuOpen(true); }}>
        ← Back to Calendar
      </button>
    ) : null;

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
          {calBackBanner}
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
        {(() => {
          const addCustomSubject = async () => {
            if (!newCustomSubject.trim()) return;
            const updated = [...(appSettings.customSubjects || []), newCustomSubject.trim()];
            setNewCustomSubject('');
            setAppSettings(p => ({...p, customSubjects: updated}));
            await setDoc(doc(db, 'settings', 'app'), { customSubjects: updated }, { merge: true });
          };
          const removeCustomSubject = async (name) => {
            const updated = (appSettings.customSubjects || []).filter(s => s !== name);
            setAppSettings(p => ({...p, customSubjects: updated}));
            await setDoc(doc(db, 'settings', 'app'), { customSubjects: updated }, { merge: true });
          };
          const standardSubjects = [
            ['science','Science'],['history','History'],['bible','Bible / Faith'],
            ['handwriting','Handwriting'],['grammar','English Grammar'],['spelling','Spelling'],
          ];
          const customSubjects = (appSettings.customSubjects || []).map(s => [s.toLowerCase().replace(/\s+/g,'_'), s]);
          const allSubjects = [...standardSubjects, ...customSubjects];
          const activeSubjects = allSubjects.filter(([key]) => extraSubjects[key]);

          return (
            <div className="p-card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem'}}>
                <div className="p-card-title">Additional Learning</div>
                <span style={{fontSize:'0.7rem',color:'#b4933a',fontWeight:600,background:'#fef3c7',padding:'0.2rem 0.6rem',borderRadius:'999px',letterSpacing:'0.04em'}}>LOGGED TODAY</span>
              </div>

              {/* Chips row */}
              <div className="p-chips" style={{marginBottom:'0.75rem'}}>
                {allSubjects.map(([key, label]) => (
                  <button
                    key={key}
                    className={`p-chip${extraSubjects[key] ? ' active' : ''}`}
                    onClick={() => { const v = !extraSubjects[key]; setExtraSubjects(p=>({...p,[key]:v})); saveExtraSubject(key,v); }}
                    style={{position:'relative'}}
                  >
                    {label}
                    {customSubjects.find(([k])=>k===key) && (
                      <span
                        style={{marginLeft:'0.35rem',opacity:0.7,fontSize:'0.7rem'}}
                        onClick={e => { e.stopPropagation(); removeCustomSubject(label); }}
                      >✕</span>
                    )}
                  </button>
                ))}
                {/* Add custom subject inline */}
                {newCustomSubject !== null && (
                  <div style={{display:'flex',gap:'0.4rem',alignItems:'center'}}>
                    <input
                      type="text"
                      placeholder="New subject..."
                      value={newCustomSubject}
                      onChange={e => setNewCustomSubject(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCustomSubject(); if (e.key === 'Escape') setNewCustomSubject(''); }}
                      autoFocus
                      style={{width:'110px',padding:'0.3rem 0.5rem',fontFamily:'inherit',fontSize:'0.8rem',border:'1.5px solid #1a3a2a',borderRadius:'999px',outline:'none'}}
                    />
                    <button className="p-btn p-btn-green p-btn-sm" style={{borderRadius:'999px',padding:'0.3rem 0.7rem'}} onClick={addCustomSubject}>Add</button>
                    <button className="p-btn p-btn-ghost p-btn-sm" style={{borderRadius:'999px',padding:'0.3rem 0.5rem'}} onClick={() => setNewCustomSubject('')}>✕</button>
                  </div>
                )}
                <button
                  className="p-chip"
                  style={{background:'transparent',borderStyle:'dashed',color:'#6b7280'}}
                  onClick={() => setNewCustomSubject(newCustomSubject === '' ? '' : '')}
                >+ Add</button>
              </div>

              {/* Active subject detail panels — all below chips */}
              {activeSubjects.map(([key, label]) => {
                const det = extraDetails[key] || {};
                const student = det.student || 'Both';
                const s1 = appSettings.studentName1 || 'Orion';
                const s2 = appSettings.studentName2 || 'Malachi';
                const saveAll = async () => {
                  await saveExtraDetailFull(key, det);
                  showToast(`${label} saved.`);
                };
                return (
                  <div key={key} className="p-extra-panel" style={{marginBottom:'0.75rem'}}>
                    {/* Panel header: label + student selector */}
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.65rem',flexWrap:'wrap',gap:'0.5rem'}}>
                      <strong style={{fontSize:'0.85rem',color:'#1a3a2a'}}>{label}</strong>
                      <div style={{display:'flex',gap:'0.3rem'}}>
                        {[s1, s2, 'Both'].map(opt => (
                          <button
                            key={opt}
                            onClick={() => setExtraDetails(p=>({...p,[key]:{...p[key],student:opt}}))}
                            style={{
                              padding:'0.25rem 0.65rem',fontSize:'0.75rem',fontFamily:'inherit',
                              fontWeight:600,borderRadius:'999px',cursor:'pointer',border:'1.5px solid',
                              transition:'all 0.12s',
                              background: student===opt ? '#1a3a2a' : 'transparent',
                              color: student===opt ? 'white' : '#1a3a2a',
                              borderColor:'#1a3a2a'
                            }}
                          >{opt}</button>
                        ))}
                      </div>
                    </div>

                    {/* Topic field */}
                    <label>Topic / Lesson</label>
                    <input
                      type="text"
                      value={det.topic || ''}
                      placeholder="What was covered?"
                      onChange={e => setExtraDetails(p=>({...p,[key]:{...p[key],topic:e.target.value}}))}
                    />

                    {/* Observations field */}
                    <label>Observations</label>
                    <textarea
                      value={det.observations || ''}
                      placeholder="Teacher notes..."
                      onChange={e => setExtraDetails(p=>({...p,[key]:{...p[key],observations:e.target.value}}))}
                    />

                    {/* Save button */}
                    <div style={{textAlign:'right',marginTop:'0.5rem'}}>
                      <button
                        className="p-btn p-btn-green p-btn-sm"
                        onClick={saveAll}
                      >Save {label}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

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
          <div style={{textAlign:'center',padding:'1rem',background:'#dcfce7',borderRadius:'12px',marginBottom:'1rem',display:'flex',alignItems:'center',justifyContent:'center',gap:'1rem',flexWrap:'wrap'}}>
            <span style={{color:'#166534',fontWeight:600}}>✓ Day finalized</span>
            <button
              className="p-btn p-btn-outline p-btn-sm"
              style={{borderColor:'#166534',color:'#166534'}}
              onClick={async () => {
                await setDoc(doc(db, 'logs', todayId), { finalized: false }, { merge: true });
                showToast('Day unfinalized — make your edits.');
              }}
            >Unfinalize</button>
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
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem',flex:1}}>
            <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setWeekOffset(p => p - 1)}>← Prev</button>
            <div style={{flex:1,textAlign:'center'}}>
              <div className="p-week-title">Week of {getWeekLabel(weekId)}</div>
              {weekOffset !== 0 && <div style={{fontSize:'0.72rem',color:'#b4933a'}}>{weekOffset < 0 ? 'Past week' : 'Future week'}</div>}
            </div>
            <button className="p-btn p-btn-ghost p-btn-sm" disabled={weekOffset >= 8} onClick={() => setWeekOffset(p => p + 1)}>Next →</button>
          </div>
          <div className="p-week-actions">
            {weekOffset !== 0 && (
              <button className="p-btn p-btn-outline p-btn-sm" onClick={() => setWeekOffset(0)}>Today's Week</button>
            )}
            <button className="p-btn p-btn-outline p-btn-sm" onClick={() => { fileInputRef.current?.click(); setChatOpen(true); }}>
              Plan Ahead
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={async e => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              const toBase64 = f => new Promise((res, rej) => {
                if (f.size > 5 * 1024 * 1024) { rej(new Error('Image too large (max 5MB)')); return; }
                const r = new FileReader();
                r.onload = () => res({ base64: r.result.split(',')[1], type: f.type || 'image/jpeg', name: f.name });
                r.onerror = rej;
                r.readAsDataURL(f);
              });
              try {
                const imgs = await Promise.all(files.slice(0, 3).map(toBase64));
                setPendingImages(imgs);
                setChatInput('Please extract the lesson schedule from this image and present it as a table: Day | Student | Subject | Lesson. Then offer to apply it using the [APPLY_DATA] format.');
                setChatOpen(true);
              } catch (err) {
                showToast('Image error: ' + err.message);
              }
              e.target.value = '';
            }} />
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

          // Compute left border accent based on status
          const borderAccent = status === 'finalized' ? '3px solid #1a3a2a' : status === 'started' ? '3px solid #f59e0b' : '3px solid #e5e7eb';

          return (
            <div key={day} className="p-day-card" style={{borderLeft: borderAccent}}>
              <div className="p-day-card-header" onClick={() => toggleDay(day)}>
                <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flex:1}}>
                  <span className="p-day-name">{day}</span>
                  {status === 'finalized' && <span style={{color:'#166534',fontSize:'0.8rem'}}>✓ Finalized</span>}
                  {status === 'started' && <span style={{color:'#92400e',fontSize:'0.8rem'}}>○ In Progress</span>}
                </div>
                <button
                  className="p-btn p-btn-ghost p-btn-sm"
                  style={{fontSize:'0.72rem',padding:'0.2rem 0.5rem'}}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const isNoSchool = dayData?.note === 'No School';
                    await setDoc(doc(db, 'schedule', weekId), {
                      days: { [day]: isNoSchool ? {} : { note: 'No School' } }
                    }, { merge: true });
                  }}
                >{dayData?.note === 'No School' ? 'Undo No School' : 'No School'}</button>
                <span style={{color:'#9ca3af',fontSize:'0.85rem',marginLeft:'0.5rem'}}>{expanded ? '▲' : '▼'}</span>
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
                                  {editingLesson?.day === day && editingLesson?.student === student && editingLesson?.subject === subject ? (
                                    <input
                                      autoFocus
                                      style={{flex:1,font:'inherit',fontSize:'0.83rem',border:'1px solid #1a3a2a',borderRadius:'5px',padding:'0.2rem 0.4rem',outline:'none'}}
                                      value={editingLesson.value}
                                      onChange={e => setEditingLesson(p => ({...p, value: e.target.value}))}
                                      onBlur={async () => {
                                        const path = `days.${day}.${student}.${subject}`;
                                        await updateDoc(doc(db, 'schedule', weekId), { [path]: editingLesson.value }).catch(async () => {
                                          await setDoc(doc(db, 'schedule', weekId), { days: {} }, { merge: true });
                                          await updateDoc(doc(db, 'schedule', weekId), { [path]: editingLesson.value });
                                        });
                                        setEditingLesson(null);
                                      }}
                                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
                                    />
                                  ) : (
                                    <span
                                      style={{flex:1,cursor:'text'}}
                                      title="Tap to edit"
                                      onClick={() => setEditingLesson({ day, student, subject, value: lesson })}
                                    >{lesson}</span>
                                  )}
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
    const cur = months[Math.min(calMonthIdx, months.length - 1)] || months[0];
    const monthName = new Date(cur.year, cur.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDay = new Date(cur.year, cur.month, 1).getDay();
    const daysInMonth = new Date(cur.year, cur.month + 1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);
    const schoolStart = new Date(appSettings.schoolYearStart || '2025-08-25'); schoolStart.setHours(0,0,0,0);

    // Days before trackingStartDate are "pre-app" (covered by baseDays) — don't flag as missing.
    // Fall back to earliest log entry date, then today, if trackingStartDate not set.
    const trackingStart = (() => {
      if (appSettings.trackingStartDate) return new Date(appSettings.trackingStartDate + 'T00:00:00');
      const logDates = Object.keys(allLogs).sort();
      if (logDates.length > 0) return new Date(logDates[0] + 'T00:00:00');
      return today;
    })();
    trackingStart.setHours(0,0,0,0);
    // The calendar only flags missing from the later of schoolStart and trackingStart
    const missingFrom = trackingStart > schoolStart ? trackingStart : schoolStart;

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const dateKey = (d) => `${cur.year}-${String(cur.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    const getDayStatus = (d) => {
      if (!d) return 'empty';
      const dt = new Date(cur.year, cur.month, d); dt.setHours(0,0,0,0);
      const dow = dt.getDay();
      if (dow === 0 || dow === 6) return 'weekend';
      if (dt > today) return 'future';
      if (dt < schoolStart) return 'future'; // before school year
      const log = allLogs[dateKey(d)];
      if (!log) return dt < missingFrom ? 'preapp' : 'missing';
      if (log.noSchool || log.note === 'No School') return 'noschool';
      if (log.sickDay) return 'sick';
      if (log.dayOff) return 'off';
      if (log.finalized) return 'school';
      if (log.startedAt) return 'started';
      return 'missing';
    };

    const statusLabel = { school:'Finalized', started:'In Progress', noschool:'No School', sick:'Sick Day', off:'Day Off', missing:'Needs attention' };

    const openDay = (d) => {
      const key = dateKey(d);
      const dt = new Date(cur.year, cur.month, d); dt.setHours(0,0,0,0);
      if (dt > today) return;
      if (dt < schoolStart || getDayStatus(d) === 'preapp') return;
      const dow = new Date(cur.year, cur.month, d).getDay();
      if (dow === 0 || dow === 6) return;
      const status = getDayStatus(d);
      if (status === 'missing') {
        setCalPopup({ dateStr: key, missing: true });
      } else {
        setCalPopup({ dateStr: key, log: allLogs[key], missing: false });
      }
    };

    const markDay = async (dateStr, type) => {
      const update = type === 'sick'    ? { finalized: true, sickDay: true, startedAt: new Date(), hoursLogged: parseFloat(appSettings.defaultHoursPerDay) || 5.5 }
                   : type === 'off'     ? { finalized: true, dayOff: true, noSchool: false }
                   : type === 'noschool'? { finalized: true, noSchool: true, startedAt: new Date() }
                   : {};
      await setDoc(doc(db, 'logs', dateStr), update, { merge: true });
      // Refresh allLogs for this date
      setAllLogs(p => ({ ...p, [dateStr]: { ...(p[dateStr] || {}), ...update } }));
      // Sick day still counts toward compliance
      if (type === 'sick') {
        await setDoc(doc(db, 'compliance', 'nd'), {
          daysCompleted: (compliance.daysCompleted || 0) + 1,
          hoursLogged: (compliance.hoursLogged || 0) + (parseFloat(appSettings.defaultHoursPerDay) || 5.5)
        }, { merge: true });
      }
      setCalPopup(null);
      showToast(`Day marked as ${type === 'sick' ? 'Sick Day' : type === 'off' ? 'Day Off' : 'No School'}.`);
    };

    const navigateToDay = (dateStr) => {
      const dt = new Date(dateStr + 'T00:00:00');
      const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dt.getDay()];
      const offset = getWeekOffsetForDate(dateStr);
      setWeekOffset(offset);
      setViewDayOverride(dayName);
      setSpecificDate(dateStr); // just used for the back-button banner
      setActiveTab('today');
      setSideMenuView(null);
      setSideMenuOpen(false);
      setCalPopup(null);
    };

    const monthSchoolDays = Object.keys(allLogs).filter(k => {
      const [y, m] = k.split('-');
      return parseInt(y) === cur.year && parseInt(m) - 1 === cur.month && allLogs[k]?.finalized && !allLogs[k]?.noSchool && !allLogs[k]?.dayOff;
    });
    const monthHours = monthSchoolDays.reduce((acc, k) => acc + (allLogs[k]?.hoursLogged || 0), 0);
    const monthMissing = cells.filter(d => d && getDayStatus(d) === 'missing').length;

    return (
      <div>
        {/* Navigation */}
        <div className="p-cal-nav">
          <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setCalMonthIdx(p => Math.max(0, p-1))}>← Prev</button>
          <span className="p-cal-month">{monthName}</span>
          <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setCalMonthIdx(p => Math.min(months.length-1, p+1))}>Next →</button>
        </div>

        {/* Legend */}
        <div className="p-cal-legend">
          {[['#dcfce7','Finalized'],['#fef3c7','In Progress'],['#dbeafe','Sick Day'],['#f3f4f6','No School / Day Off'],['#fee2e2','Needs Attention'],...((compliance.baseDays||0) > 0 ? [['#e5e7eb','Pre-app (via baseDays)']] : [])].map(([color, label]) => (
            <div key={label} className="p-cal-legend-item">
              <div className="p-cal-legend-dot" style={{background:color, border:'1px solid rgba(0,0,0,0.1)'}} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="p-cal-grid">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="p-cal-dow">{d}</div>)}
          {cells.map((d, i) => {
            const status = getDayStatus(d);
            return (
              <div key={i} className={`p-cal-day${status !== 'empty' ? ' ' + status : ''}`} onClick={() => d && openDay(d)}>
                {d || ''}
              </div>
            );
          })}
        </div>

        {/* Monthly summary */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.5rem'}}>
          <div style={{fontSize:'0.78rem',color:'#6b7280'}}>
            <strong style={{color:'#1a3a2a'}}>{monthSchoolDays.length}</strong> school days · <strong style={{color:'#1a3a2a'}}>{monthHours.toFixed(1)}</strong> hours
          </div>
          {monthMissing > 0 && (
            <div style={{fontSize:'0.75rem',background:'#fee2e2',color:'#991b1b',padding:'0.2rem 0.6rem',borderRadius:999,fontWeight:600}}>
              {monthMissing} day{monthMissing !== 1 ? 's' : ''} need attention
            </div>
          )}
        </div>

        {/* Popup */}
        {calPopup && (
          <div className="p-cal-popup" onClick={() => setCalPopup(null)}>
            <div className="p-cal-popup-card" onClick={e => e.stopPropagation()} style={{maxWidth:320}}>
              <h3 style={{marginBottom:'0.6rem'}}>{formatShortDate(calPopup.dateStr)}</h3>

              {calPopup.missing ? (
                <>
                  <p style={{fontSize:'0.82rem',color:'#6b7280',marginBottom:'1rem'}}>This weekday has no log entry. What happened?</p>
                  <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                    <button className="p-btn p-btn-primary p-btn-block" onClick={() => navigateToDay(calPopup.dateStr)}>Log this day →</button>
                    <button className="p-btn p-btn-outline p-btn-block" style={{borderColor:'#3b82f6',color:'#1e40af'}} onClick={() => markDay(calPopup.dateStr,'sick')}>Sick Day</button>
                    <button className="p-btn p-btn-outline p-btn-block" onClick={() => markDay(calPopup.dateStr,'off')}>Unplanned Day Off</button>
                    <button className="p-btn p-btn-ghost p-btn-block" onClick={() => markDay(calPopup.dateStr,'noschool')}>No School (planned)</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{display:'flex',flexDirection:'column',gap:'0.3rem',marginBottom:'0.75rem'}}>
                    <p style={{fontSize:'0.85rem'}}><strong>Status:</strong> {calPopup.log?.sickDay ? '🤒 Sick Day' : calPopup.log?.dayOff ? '📅 Day Off' : calPopup.log?.noSchool ? '🚫 No School' : calPopup.log?.finalized ? '✓ Finalized' : '○ In Progress'}</p>
                    {calPopup.log?.hoursLogged > 0 && <p style={{fontSize:'0.85rem'}}><strong>Hours:</strong> {calPopup.log.hoursLogged}</p>}
                    {calPopup.log?.dayNotes && <p style={{fontSize:'0.82rem',color:'#6b7280'}}>{calPopup.log.dayNotes}</p>}
                  </div>
                  <div style={{display:'flex',gap:'0.5rem'}}>
                    <button className="p-btn p-btn-primary p-btn-sm" onClick={() => navigateToDay(calPopup.dateStr)}>Open Day →</button>
                    <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setCalPopup(null)}>Close</button>
                  </div>
                </>
              )}
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
      <div style={{marginBottom:'1.25rem'}}>
        <button className="p-btn p-btn-outline p-btn-sm" onClick={() => {
          setWizardData({
            schoolYearStart: settingsForm.schoolYearStart || appSettings.schoolYearStart || '2025-08-25',
            defaultHoursPerDay: settingsForm.defaultHoursPerDay || appSettings.defaultHoursPerDay || 5.5,
            studentName1: settingsForm.studentName1 || appSettings.studentName1 || 'Orion',
            studentName2: settingsForm.studentName2 || appSettings.studentName2 || 'Malachi',
            address: settingsForm.address || appSettings.address || '',
            baseDays: compliance.baseDays ?? 0,
            baseHours: compliance.baseHours ?? 0,
          });
          setSetupWizardStep(1);
          setCalImportResult(null);
          setSetupWizardOpen(true);
        }}>
          Launch Setup Wizard
        </button>
        <p style={{fontSize:'0.75rem',color:'#6b7280',marginTop:'0.4rem'}}>Re-run the guided setup to update compliance starting values or import a calendar.</p>
      </div>
      <hr className="p-divider" style={{marginTop:0}} />
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


  // ── New Week Modal ─────────────────────────────────────────────────────────────
  const renderNewWeekModal = () => {
    if (!newWeekModal) return null;
    const wId = newWeekModal;
    const prevWeekId = getWeekIdWithOffset(weekOffset - 1);
    const handleFresh = async () => {
      await setDoc(doc(db, 'schedule', wId), { days: SEED_SCHEDULE }, { merge: true });
      setNewWeekModal(null);
    };
    const handleCopy = async () => {
      const prev = await getDoc(doc(db, 'schedule', prevWeekId));
      const days = prev.exists() ? prev.data().days || {} : SEED_SCHEDULE;
      await setDoc(doc(db, 'schedule', wId), { days }, { merge: true });
      setNewWeekModal(null);
    };
    return (
      <div className="p-modal-overlay" onClick={() => setNewWeekModal(null)}>
        <div className="p-modal" onClick={e => e.stopPropagation()} style={{maxWidth:360}}>
          <h2>New Week</h2>
          <p style={{fontSize:'0.875rem',color:'#6b7280',marginBottom:'1.25rem'}}>No schedule found for this week. How would you like to start?</p>
          <div style={{display:'flex',flexDirection:'column',gap:'0.75rem'}}>
            <button className="p-btn p-btn-primary p-btn-block" onClick={handleFresh}>Start Fresh (seed schedule)</button>
            <button className="p-btn p-btn-outline p-btn-block" onClick={handleCopy}>Copy from Previous Week</button>
            <button className="p-btn p-btn-ghost p-btn-block" onClick={() => setNewWeekModal(null)}>Leave Empty (plan via AI)</button>
          </div>
        </div>
      </div>
    );
  };

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

  // ── Setup Wizard ──────────────────────────────────────────────────────────────
  const renderSetupWizard = () => {
    if (!setupWizardOpen) return null;
    const totalSteps = 6;
    const setField = (key, val) => setWizardData(p => ({...p, [key]: val}));


    const handleEstimate = () => {
      const days = estimateSchoolDays(wizardData.schoolYearStart);
      const hours = days * (parseFloat(wizardData.defaultHoursPerDay) || 5.5);
      setCalImportResult({ days, hours: Math.round(hours * 10) / 10, source: 'estimate' });
      setField('baseDays', days);
      setField('baseHours', Math.round(hours * 10) / 10);
    };

    const canNext = () => {
      if (setupWizardStep === 5) return (wizardData.baseDays >= 0);
      return true;
    };

    const handleFinish = async () => {
      await saveWizardData(wizardData);
      setSetupWizardOpen(false);
    };

    const stepContent = () => {
      switch (setupWizardStep) {
        case 1: return (
          <div>
            <div style={{textAlign:'center',marginBottom:'1.5rem'}}>
              <div style={{fontSize:'2.5rem',marginBottom:'0.5rem'}}>🏫</div>
              <p style={{fontSize:'0.95rem',color:'#2c2c2c',lineHeight:1.6}}>
                Welcome! Let's sync your planner with where you actually are in the school year — so your compliance numbers are accurate from day one.
              </p>
            </div>
            <div style={{background:'#f4f9f6',borderRadius:10,padding:'1rem',fontSize:'0.85rem',color:'#1a3a2a'}}>
              <strong>We'll set up:</strong>
              <ul style={{marginTop:'0.4rem',paddingLeft:'1.25rem',lineHeight:2}}>
                <li>School year start date</li>
                <li>Student names</li>
                <li>Days already completed (via calendar import or estimate)</li>
              </ul>
            </div>
          </div>
        );
        case 2: return (
          <div>
            <div className="p-field">
              <label>School Year Start Date</label>
              <input type="date" value={wizardData.schoolYearStart || '2025-08-25'}
                onChange={e => setField('schoolYearStart', e.target.value)} />
            </div>
            <div className="p-field">
              <label>Default School Hours Per Day</label>
              <input type="number" step="0.5" min="0" max="24"
                value={wizardData.defaultHoursPerDay || 5.5}
                onChange={e => setField('defaultHoursPerDay', e.target.value)} />
              <div style={{fontSize:'0.75rem',color:'#6b7280',marginTop:'0.3rem'}}>Used to estimate total hours from day count</div>
            </div>
          </div>
        );
        case 3: {
          const extraStudents = wizardData.extraStudents || [];
          return (
            <div>
              <div className="p-field-row">
                <div className="p-field">
                  <label>Student 1 Name</label>
                  <input type="text" value={wizardData.studentName1 || ''} placeholder="e.g. Orion"
                    onChange={e => setField('studentName1', e.target.value)} />
                </div>
                <div className="p-field">
                  <label>Student 2 Name</label>
                  <input type="text" value={wizardData.studentName2 || ''} placeholder="e.g. Malachi"
                    onChange={e => setField('studentName2', e.target.value)} />
                </div>
              </div>
              {extraStudents.map((name, i) => (
                <div key={i} style={{display:'flex',gap:'0.5rem',alignItems:'center',marginBottom:'0.5rem'}}>
                  <div className="p-field" style={{flex:1,margin:0}}>
                    <label>Student {i + 3} Name</label>
                    <input type="text" value={name} placeholder={`e.g. Student ${i + 3}`}
                      onChange={e => {
                        const updated = [...extraStudents];
                        updated[i] = e.target.value;
                        setField('extraStudents', updated);
                      }} />
                  </div>
                  <button className="p-btn p-btn-ghost p-btn-sm" style={{marginTop:'1.2rem',color:'#dc2626'}}
                    onClick={() => setField('extraStudents', extraStudents.filter((_,j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="p-btn p-btn-outline p-btn-sm" style={{marginTop:'0.5rem'}}
                onClick={() => setField('extraStudents', [...extraStudents, ''])}>
                + Add Student
              </button>
            </div>
          );
        }
        case 4: return (
          <div>
            <div className="p-field">
              <label>Academy Address (for ND reports)</label>
              <textarea value={wizardData.address || ''} placeholder="123 Main St, City, ND 58001"
                onChange={e => setField('address', e.target.value)}
                style={{minHeight:72}} />
            </div>
            <p style={{fontSize:'0.78rem',color:'#6b7280'}}>This appears on your annual compliance report. You can update it anytime in Settings.</p>
          </div>
        );
        case 5: return (
          <div>
            <p style={{fontSize:'0.875rem',color:'#2c2c2c',marginBottom:'1rem',lineHeight:1.5}}>
              How many school days have you completed since {wizardData.schoolYearStart || '2025-08-25'}? This sets your compliance starting point.
            </p>
            {/* Mode tabs */}
            <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:'1.5px solid #1a3a2a',marginBottom:'1rem'}}>
              {[['import','Import Calendar'],['estimate','Auto-Estimate'],['manual','Enter Manually']].map(([mode,label]) => (
                <button key={mode} onClick={() => { setCalInputMode(mode); setCalImportResult(null); }} style={{
                  flex:1,border:'none',padding:'0.55rem 0.3rem',fontSize:'0.78rem',fontWeight:600,
                  fontFamily:"'Lora',serif",cursor:'pointer',transition:'all 0.15s',
                  background: calInputMode === mode ? '#1a3a2a' : 'white',
                  color: calInputMode === mode ? 'white' : '#1a3a2a',
                }}>{label}</button>
              ))}
            </div>

            {calInputMode === 'import' && (
              <div>
                {/* Chat messages */}
                {calChatMessages.length > 0 && (
                  <div style={{
                    border:'1px solid rgba(0,0,0,0.1)',borderRadius:10,
                    background:'#f9f8f6',maxHeight:240,overflowY:'auto',
                    padding:'0.75rem',marginBottom:'0.75rem',
                    display:'flex',flexDirection:'column',gap:'0.5rem'
                  }}>
                    {calChatMessages.map((m, i) => (
                      <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.role==='user'?'flex-end':'flex-start'}}>
                        {m.fileContent?.type === 'image' && m.role === 'user' && (
                          <img src={`data:${m.fileContent.mimeType};base64,${m.fileContent.base64}`}
                            alt="uploaded" style={{maxWidth:120,maxHeight:80,borderRadius:6,marginBottom:4,objectFit:'cover'}} />
                        )}
                        <div style={{
                          maxWidth:'88%',padding:'0.5rem 0.75rem',borderRadius:10,fontSize:'0.82rem',lineHeight:1.5,
                          background:m.role==='user'?'#1e2d4a':'white',
                          color:m.role==='user'?'white':'#2c2c2c',
                          border:m.role==='assistant'?'1px solid rgba(0,0,0,0.08)':'none'
                        }}>{m.text}</div>
                        {/* "Use N days" button when AI detects a count */}
                        {m.role === 'assistant' && m.detectedDays != null && (
                          <button className="p-btn p-btn-green p-btn-sm" style={{marginTop:'0.3rem'}}
                            onClick={() => {
                              const hrs = Math.round(m.detectedDays * (parseFloat(wizardData.defaultHoursPerDay) || 5.5) * 10) / 10;
                              setField('baseDays', m.detectedDays);
                              setField('baseHours', hrs);
                              setCalImportResult({ days: m.detectedDays, hours: hrs, source: 'ai' });
                            }}>
                            Use {m.detectedDays} days
                          </button>
                        )}
                      </div>
                    ))}
                    {calChatLoading && (
                      <div style={{display:'flex',gap:4,padding:'0.4rem 0.6rem'}}>
                        <div className="p-dot-spin"><span/><span/><span/></div>
                      </div>
                    )}
                    <div ref={calChatEndRef} />
                  </div>
                )}

                {/* Confirmed result */}
                {calImportResult && (
                  <div style={{background:'#f4f9f6',border:'1.5px solid #1a3a2a',borderRadius:8,padding:'0.65rem 0.9rem',marginBottom:'0.75rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:'0.85rem',color:'#1a3a2a',fontWeight:700}}>{calImportResult.days} days selected</span>
                    <button className="p-btn p-btn-ghost p-btn-sm" style={{color:'#6b7280'}} onClick={() => setCalImportResult(null)}>Change</button>
                  </div>
                )}

                {/* Input row */}
                <div style={{display:'flex',gap:'0.4rem',alignItems:'flex-end'}}>
                  <button
                    title="Attach file or photo"
                    style={{background:'none',border:'1.5px solid rgba(0,0,0,0.15)',borderRadius:8,padding:'0.45rem 0.6rem',cursor:'pointer',fontSize:'1.1rem',minHeight:40,flexShrink:0}}
                    onClick={() => calFileInputRef.current?.click()}
                    disabled={calChatLoading}
                  >📎</button>
                  <input ref={calFileInputRef} type="file" style={{display:'none'}}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';
                      const content = await extractFileContent(file);
                      await sendCalendarMessage(calChatInput || `Please analyze this calendar file (${file.name}) and count school days from ${wizardData.schoolYearStart || '2025-08-25'} to today, excluding holidays and breaks.`, content);
                      setCalChatInput('');
                    }}
                  />
                  <textarea
                    placeholder={calChatMessages.length === 0 ? 'Ask about your calendar, or attach a file above…' : 'Follow up or correct the count…'}
                    value={calChatInput}
                    rows={1}
                    style={{flex:1,fontFamily:"'Lora',serif",fontSize:'0.85rem',border:'1.5px solid rgba(0,0,0,0.12)',borderRadius:8,padding:'0.45rem 0.6rem',resize:'none',outline:'none',minHeight:40}}
                    onChange={e => setCalChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); if (calChatInput.trim()) sendCalendarMessage(calChatInput); } }}
                  />
                  <button className="p-btn p-btn-primary p-btn-sm" style={{flexShrink:0}}
                    disabled={calChatLoading || !calChatInput.trim()}
                    onClick={() => sendCalendarMessage(calChatInput)}>Send</button>
                </div>
                <p style={{fontSize:'0.72rem',color:'#9ca3af',marginTop:'0.4rem'}}>Attach any file type — PDF, image, HTML, ICS. Then chat to refine the count.</p>
              </div>
            )}

            {calInputMode === 'estimate' && (
              <div>
                <p style={{fontSize:'0.82rem',color:'#6b7280',marginBottom:'0.75rem'}}>
                  Counts every Monday–Friday from your school year start through today. No holidays are excluded — adjust manually if needed.
                </p>
                <button className="p-btn p-btn-outline p-btn-block" onClick={handleEstimate}>
                  Calculate Mon–Fri Days
                </button>
                {calImportResult && (
                  <div style={{background:'#f4f9f6',border:'1.5px solid #1a3a2a',borderRadius:10,padding:'1rem',marginTop:'1rem'}}>
                    <div style={{fontSize:'1.5rem',fontWeight:700,color:'#1a3a2a'}}>{calImportResult.days} days</div>
                    <div style={{fontSize:'0.8rem',color:'#6b7280',marginTop:'0.2rem'}}>≈ {calImportResult.hours} hours at {wizardData.defaultHoursPerDay || 5.5}h/day</div>
                    <div style={{fontSize:'0.75rem',color:'#6b7280',marginTop:'0.5rem'}}>Adjust manually if needed — holidays are not excluded.</div>
                  </div>
                )}
              </div>
            )}

            {calInputMode === 'manual' && (
              <div>
                <div className="p-field-row">
                  <div className="p-field">
                    <label>Days Already Completed</label>
                    <input type="number" min="0" max="175"
                      value={wizardData.baseDays ?? 0}
                      onChange={e => setField('baseDays', parseInt(e.target.value) || 0)} />
                  </div>
                  <div className="p-field">
                    <label>Hours Already Logged</label>
                    <input type="number" min="0" step="0.5"
                      value={wizardData.baseHours ?? 0}
                      onChange={e => setField('baseHours', parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
        case 6: return (
          <div>
            <p style={{fontSize:'0.875rem',color:'#6b7280',marginBottom:'1rem'}}>Review your setup and tap Finish to save.</p>
            <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
              {[
                ['School Year Start', wizardData.schoolYearStart || '2025-08-25'],
                ['Hours Per Day', wizardData.defaultHoursPerDay || 5.5],
                ['Student 1', wizardData.studentName1 || 'Orion'],
                ['Student 2', wizardData.studentName2 || 'Malachi'],
                ['Address', wizardData.address || '(not set)'],
                ['Days to credit', wizardData.baseDays ?? 0],
                ['Hours to credit', wizardData.baseHours ?? 0],
              ].map(([label, val]) => (
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.5rem 0.75rem',background:'#f9f8f6',borderRadius:8,fontSize:'0.85rem'}}>
                  <span style={{color:'#6b7280',fontWeight:600}}>{label}</span>
                  <span style={{color:'#1a3a2a',fontWeight:700}}>{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        );
        default: return null;
      }
    };

    const stepTitles = ['','Welcome','School Year','Students','Address','Days Completed','Review & Save'];

    return (
      <div className="p-modal-overlay">
        <div className="p-modal" style={{maxWidth:440}} onClick={e => e.stopPropagation()}>
          {/* Progress */}
          <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'1rem'}}>
            {Array.from({length:totalSteps}).map((_,i) => (
              <div key={i} style={{
                flex:1,height:4,borderRadius:2,
                background: i < setupWizardStep ? '#1a3a2a' : '#edecea',
                transition:'background 0.3s'
              }} />
            ))}
          </div>
          <div style={{fontSize:'0.7rem',color:'#6b7280',textAlign:'right',marginBottom:'0.75rem'}}>Step {setupWizardStep} of {totalSteps}</div>

          <h2 style={{marginBottom:'1.25rem'}}>{stepTitles[setupWizardStep]}</h2>

          {stepContent()}

          {/* Navigation */}
          <div style={{display:'flex',justifyContent:'space-between',marginTop:'1.5rem',gap:'0.5rem'}}>
            <button className="p-btn p-btn-ghost"
              onClick={() => setupWizardStep > 1 ? setSetupWizardStep(p => p - 1) : setSetupWizardOpen(false)}>
              {setupWizardStep === 1 ? 'Skip' : '← Back'}
            </button>
            {setupWizardStep < totalSteps
              ? <button className="p-btn p-btn-primary" disabled={!canNext()} onClick={() => setSetupWizardStep(p => p + 1)}>Next →</button>
              : <button className="p-btn p-btn-green" onClick={handleFinish}>Finish & Save</button>
            }
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
          <div className="p-topbar-tagline">Faith · Knowledge · Strength <span style={{opacity:0.7,marginLeft:'0.3rem'}}>{APP_VERSION}</span></div>
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
        <div className="p-chat-tab" style={{bottom:'calc(56px + env(safe-area-inset-bottom, 0px))'}} onClick={() => { setChatOpen(true); setChatUnread(false); }}>
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
            {pendingImages.length > 0 && (
              <div style={{display:'flex',gap:'0.5rem',padding:'0.5rem 0.75rem',borderTop:'1px solid rgba(0,0,0,0.07)',flexWrap:'wrap'}}>
                {pendingImages.map((img,i) => (
                  <div key={i} style={{position:'relative'}}>
                    <img src={`data:${img.type};base64,${img.base64}`} alt="" style={{width:56,height:56,objectFit:'cover',borderRadius:8,border:'1px solid rgba(0,0,0,0.12)'}} />
                    <button onClick={() => setPendingImages(p => p.filter((_,j)=>j!==i))} style={{position:'absolute',top:-6,right:-6,background:'#dc2626',color:'white',border:'none',borderRadius:'50%',width:18,height:18,fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
                  </div>
                ))}
              </div>
            )}
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

      {/* Bottom Navigation */}
      <nav style={{position:'fixed',bottom:0,left:0,right:0,zIndex:100,background:'white',borderTop:'1px solid rgba(0,0,0,0.08)',display:'flex',padding:'0.5rem 0 env(safe-area-inset-bottom,0)'}}>
        {[['today','TODAY','📅'],['week','WEEK','📋'],['history','HISTORY','📊']].map(([id,label,icon]) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSpecificDate(null); }}
            style={{
              flex:1,border:'none',background:'none',padding:'0.4rem 0.5rem',
              cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:'0.1rem',
              minHeight:44,fontFamily:"'Lora',serif",fontSize:'0.7rem',fontWeight:600,letterSpacing:'0.05em',
              color: activeTab === id ? '#1a3a2a' : '#6b7280',
              transition:'color 0.15s'
            }}
          >
            <span style={{fontSize:'1.1rem'}}>{icon}</span>
            <span>{label}</span>
            {activeTab === id && <span style={{width:4,height:4,borderRadius:'50%',background:'#1a3a2a',marginTop:1}} />}
          </button>
        ))}
      </nav>

      {/* Confirmation Dialog */}
      {renderConfirmDialog()}

      {/* New Week Modal */}
      {renderNewWeekModal()}

      {/* Setup Wizard */}
      {renderSetupWizard()}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

