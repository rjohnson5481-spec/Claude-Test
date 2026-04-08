// ─── Pure Helper Functions ──────────────────────────────────────────────────────
import { SCHOOL_YEAR_START } from './constants.js';

export function getWeekId(date) {
  const d = date ? new Date(date) : new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-${String(week).padStart(2, '0')}`;
}

export function getTodayId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getDayOfWeek(date) {
  const d = date ? new Date(date) : new Date();
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
}

export function getSchoolDayNumber() {
  const today = new Date();
  let count = 0;
  let d = new Date(SCHOOL_YEAR_START);
  while (d <= today) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export function formatDateDisplay(date) {
  return (date ? new Date(date) : new Date()).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

export function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(+y, +m-1, +d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function getYesterdayId() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getWeekDateFor(dayName) {
  const today = new Date();
  const dows = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const diff = dows.indexOf(dayName) - today.getDay();
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d;
}

export function getDateId(date) {
  const d = date ? new Date(date) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function calcProjectedFinish(daysCompleted) {
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

export function getWeekIdWithOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset * 7);
  return getWeekId(d);
}

export function getWeekLabel(weekId) {
  const [year, week] = weekId.split('-').map(Number);
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay();
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + ((8 - dayOfWeek) % 7 || 7) - 6);
  const monday = new Date(firstMonday);
  monday.setDate(firstMonday.getDate() + (week - 1) * 7);
  return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getWeekOffsetForDate(dateStr) {
  const targetWeekId = getWeekId(new Date(dateStr + 'T00:00:00'));
  for (let o = -60; o <= 8; o++) {
    if (getWeekIdWithOffset(o) === targetWeekId) return o;
  }
  return 0;
}

export function estimateSchoolDays(startDateStr) {
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
