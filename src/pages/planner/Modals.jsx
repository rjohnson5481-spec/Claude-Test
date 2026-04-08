import React from 'react';
import { db } from '../../firebase.js';
import { doc, setDoc } from 'firebase/firestore';
import { usePlanner } from './PlannerContext';
import { DAYS_OF_WEEK, SEED_SCHEDULE } from './constants';
import { formatShortDate, getWeekOffsetForDate, getWeekIdWithOffset } from './helpers';

export function AttendanceCalendar() {
  const {
    allLogs, compliance, appSettings,
    calMonthIdx, setCalMonthIdx, calPopup, setCalPopup,
    setWeekOffset, setViewDayOverride, setSpecificDate,
    setActiveTab, setSideMenuView, setSideMenuOpen,
    showToast,
  } = usePlanner();

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

  const trackingStart = (() => {
    if (appSettings.trackingStartDate) return new Date(appSettings.trackingStartDate + 'T00:00:00');
    const logDates = Object.keys(allLogs).sort();
    if (logDates.length > 0) return new Date(logDates[0] + 'T00:00:00');
    return today;
  })();
  trackingStart.setHours(0,0,0,0);
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
    if (dt < schoolStart) return 'future';
    const log = allLogs[dateKey(d)];
    if (!log) return dt < missingFrom ? 'preapp' : 'missing';
    if (log.noSchool || log.note === 'No School') return 'noschool';
    if (log.sickDay) return 'sick';
    if (log.dayOff) return 'off';
    if (log.finalized) return 'school';
    if (log.startedAt) return 'started';
    return 'missing';
  };

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
    const update = type === 'sick'     ? { finalized: true, sickDay: true, startedAt: new Date(), hoursLogged: parseFloat(appSettings.defaultHoursPerDay) || 5.5 }
                 : type === 'off'      ? { finalized: true, dayOff: true, noSchool: false }
                 : type === 'noschool' ? { finalized: true, noSchool: true, startedAt: new Date() }
                 : {};
    await setDoc(doc(db, 'logs', dateStr), update, { merge: true });
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
    setSpecificDate(dateStr);
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
      <div className="p-cal-nav">
        <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setCalMonthIdx(p => Math.max(0, p-1))}>← Prev</button>
        <span className="p-cal-month">{monthName}</span>
        <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setCalMonthIdx(p => Math.min(months.length-1, p+1))}>Next →</button>
      </div>

      <div className="p-cal-legend">
        {[['#dcfce7','Finalized'],['#fef3c7','In Progress'],['#dbeafe','Sick Day'],['#f3f4f6','No School / Day Off'],['#fee2e2','Needs Attention'],...((compliance.baseDays||0) > 0 ? [['#e5e7eb','Pre-app (via baseDays)']] : [])].map(([color, label]) => (
          <div key={label} className="p-cal-legend-item">
            <div className="p-cal-legend-dot" style={{background:color, border:'1px solid rgba(0,0,0,0.1)'}} />
            <span>{label}</span>
          </div>
        ))}
      </div>

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

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem',flexWrap:'wrap',gap:'0.5rem'}}>
        <div style={{fontSize:'0.78rem',color:'var(--text-secondary)'}}>
          <strong style={{color:'var(--forest)'}}>{monthSchoolDays.length}</strong> school days · <strong style={{color:'var(--forest)'}}>{monthHours.toFixed(1)}</strong> hours
        </div>
        {monthMissing > 0 && (
          <div style={{fontSize:'0.75rem',background:'#fee2e2',color:'#991b1b',padding:'0.2rem 0.6rem',borderRadius:999,fontWeight:600}}>
            {monthMissing} day{monthMissing !== 1 ? 's' : ''} need attention
          </div>
        )}
      </div>

      {calPopup && (
        <div className="p-cal-popup" onClick={() => setCalPopup(null)}>
          <div className="p-cal-popup-card" onClick={e => e.stopPropagation()} style={{maxWidth:320}}>
            <h3 style={{marginBottom:'0.6rem'}}>{formatShortDate(calPopup.dateStr)}</h3>
            {calPopup.missing ? (
              <>
                <p style={{fontSize:'0.82rem',color:'var(--text-secondary)',marginBottom:'1rem'}}>This weekday has no log entry. What happened?</p>
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
                  {calPopup.log?.dayNotes && <p style={{fontSize:'0.82rem',color:'var(--text-secondary)'}}>{calPopup.log.dayNotes}</p>}
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
}

export function NewWeekModal() {
  const { newWeekModal, setNewWeekModal, weekOffset, weekId } = usePlanner();
  if (!newWeekModal) return null;
  const wId = newWeekModal;
  const prevWeekId = getWeekIdWithOffset(weekOffset - 1);

  const handleFresh = async () => {
    await setDoc(doc(db, 'schedule', wId), { days: SEED_SCHEDULE }, { merge: true });
    setNewWeekModal(null);
  };
  const handleCopy = async () => {
    const { getDoc } = await import('firebase/firestore');
    const prev = await getDoc(doc(db, 'schedule', prevWeekId));
    const days = prev.exists() ? prev.data().days || {} : SEED_SCHEDULE;
    await setDoc(doc(db, 'schedule', wId), { days }, { merge: true });
    setNewWeekModal(null);
  };

  return (
    <div className="p-modal-overlay" onClick={() => setNewWeekModal(null)}>
      <div className="p-modal" onClick={e => e.stopPropagation()} style={{maxWidth:360}}>
        <h2>New Week</h2>
        <p style={{fontSize:'0.875rem',color:'var(--text-secondary)',marginBottom:'1.25rem'}}>No schedule found for this week. How would you like to start?</p>
        <div style={{display:'flex',flexDirection:'column',gap:'0.75rem'}}>
          <button className="p-btn p-btn-primary p-btn-block" onClick={handleFresh}>Start Fresh (seed schedule)</button>
          <button className="p-btn p-btn-outline p-btn-block" onClick={handleCopy}>Copy from Previous Week</button>
          <button className="p-btn p-btn-ghost p-btn-block" onClick={() => setNewWeekModal(null)}>Leave Empty (plan via AI)</button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog() {
  const { confirmDialog, setConfirmDialog, applyScheduleDialog } = usePlanner();
  if (!confirmDialog) return null;
  const rows = confirmDialog.rows || [];

  return (
    <div className="p-modal-overlay" onClick={() => setConfirmDialog(null)}>
      <div className="p-modal" onClick={e => e.stopPropagation()}>
        <h2>Confirm Schedule Changes</h2>
        <p style={{fontSize:'0.82rem',color:'var(--text-secondary)',marginBottom:'0.75rem'}}>Review and check the items you want to apply. All items are selected by default.</p>
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
}
