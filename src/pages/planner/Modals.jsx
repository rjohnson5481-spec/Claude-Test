import React from 'react';
import { db } from '../../firebase.js';
import { doc, setDoc } from 'firebase/firestore';
import { usePlanner } from './PlannerContext';
import { DAYS_OF_WEEK, SEED_SCHEDULE } from './constants';
import { formatShortDate, getWeekOffsetForDate, getWeekIdWithOffset, getDayOfWeek } from './helpers';

export function AttendanceCalendar() {
  const {
    allLogs, compliance, appSettings,
    calMonthIdx, setCalMonthIdx, calPopup, setCalPopup,
    setWeekOffset, setViewDayOverride, setSpecificDate,
    setActiveTab, setSideMenuView, setSideMenuOpen,
    setSickDayShiftOffer, showToast,
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
    // Offer to shift remaining lessons forward for sick/off days
    if (type === 'sick' || type === 'off') {
      const dayName = getDayOfWeek(new Date(dateStr + 'T12:00:00'));
      if (DAYS_OF_WEEK.includes(dayName)) {
        setSickDayShiftOffer({ dateStr, dayName });
      }
    }
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

// ── Shift Days Modal (standalone from WeekView) ───────────────────────────────
export function ShiftDaysModal() {
  const { shiftDaysModal, setShiftDaysModal, weekSchedule, shiftSchedule } = usePlanner();
  const [fromDay, setFromDay] = React.useState('Monday');
  const [numDays, setNumDays] = React.useState(1);

  React.useEffect(() => {
    if (shiftDaysModal) {
      setFromDay(shiftDaysModal.fromDay || 'Monday');
      setNumDays(shiftDaysModal.numDays || 1);
    }
  }, [shiftDaysModal]);

  if (!shiftDaysModal) return null;

  const fromIdx = DAYS_OF_WEEK.indexOf(fromDay);
  const sourceDays = DAYS_OF_WEEK.slice(fromIdx);
  const preview = sourceDays.map((day, i) => {
    const targetIdx = fromIdx + i + numDays;
    const target = targetIdx < 5 ? DAYS_OF_WEEK[targetIdx] : `${DAYS_OF_WEEK[targetIdx - 5]} (next week)`;
    const hasLessons = weekSchedule?.[day] && !weekSchedule[day].note;
    return { day, target, hasLessons };
  }).filter(p => p.hasLessons);

  return (
    <div className="p-modal-overlay" onClick={() => setShiftDaysModal(null)}>
      <div className="p-modal" onClick={e => e.stopPropagation()} style={{maxWidth:380}}>
        <h2>Shift Schedule Forward</h2>
        <p style={{fontSize:'0.82rem',color:'var(--text-secondary)',marginBottom:'1rem'}}>
          Move lessons from a given day forward by N school days.
        </p>
        <div className="p-field-row" style={{marginBottom:'1rem'}}>
          <div className="p-field">
            <label>Starting from</label>
            <select value={fromDay} onChange={e => setFromDay(e.target.value)}>
              {DAYS_OF_WEEK.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="p-field">
            <label>Shift by (days)</label>
            <input type="number" min="1" max="4" value={numDays}
              onChange={e => setNumDays(Math.max(1, Math.min(4, parseInt(e.target.value) || 1)))} />
          </div>
        </div>
        {preview.length > 0 && (
          <div className="p-card" style={{marginBottom:'1rem',background:'var(--bg-card-warm)'}}>
            <div style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text-secondary)',marginBottom:'0.4rem'}}>Preview</div>
            {preview.map(({day, target}) => (
              <div key={day} style={{fontSize:'0.83rem',padding:'0.2rem 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text-muted)'}}>{day}</span>
                <span style={{margin:'0 0.4rem',color:'var(--forest)'}}>→</span>
                <span style={{fontWeight:500}}>{target}</span>
                {target.includes('next week') && <span style={{marginLeft:'0.4rem',fontSize:'0.75rem',color:'var(--gold)'}}>⚠ confirm</span>}
              </div>
            ))}
            {preview.length === 0 && <div style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>No lessons to shift in that range.</div>}
          </div>
        )}
        <div className="p-modal-actions">
          <button className="p-btn p-btn-ghost" onClick={() => setShiftDaysModal(null)}>Cancel</button>
          <button className="p-btn p-btn-primary" onClick={() => shiftSchedule(fromDay, numDays)}>
            Shift Schedule →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shift Overflow Dialog (confirm next-week write) ───────────────────────────
export function ShiftOverflowDialog() {
  const { shiftOverflowDialog, setShiftOverflowDialog, shiftSchedule } = usePlanner();
  if (!shiftOverflowDialog) return null;
  const { currentWeekUpdates, overflow } = shiftOverflowDialog;

  const handleConfirm = () => shiftSchedule(null, null, true);
  // Re-apply with confirmedOverflow=true using stored updates
  const handleConfirmDirect = async () => {
    const { db } = await import('../../firebase.js');
    const { doc, setDoc, updateDoc } = await import('firebase/firestore');
    const { pendingWeekId, overflow: ov } = shiftOverflowDialog;
    // Apply current week
    await setDoc(doc(db, 'schedule', pendingWeekId), {}, { merge: true });
    for (const [path, val] of Object.entries(currentWeekUpdates)) {
      await updateDoc(doc(db, 'schedule', pendingWeekId), { [path]: val });
    }
    // Apply next week
    const nextWeekIdWithOffset = (wid) => {
      // Parse weekId "YYYY-WW" and add 1 week
      const [y, w] = wid.split('-').map(Number);
      const d = new Date(y, 0, 1 + (w - 1) * 7);
      d.setDate(d.getDate() + 7);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const nw = Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
      return `${d.getFullYear()}-${String(nw).padStart(2, '0')}`;
    };
    const nextWid = nextWeekIdWithOffset(pendingWeekId);
    for (const { day, data } of ov) {
      await setDoc(doc(db, 'schedule', nextWid), { days: { [day]: data } }, { merge: true });
    }
    setShiftOverflowDialog(null);
  };

  return (
    <div className="p-modal-overlay" onClick={() => setShiftOverflowDialog(null)}>
      <div className="p-modal" onClick={e => e.stopPropagation()} style={{maxWidth:360}}>
        <h2>Overflow to Next Week</h2>
        <p style={{fontSize:'0.82rem',color:'var(--text-secondary)',marginBottom:'0.75rem'}}>
          These lessons would move into next week's schedule:
        </p>
        <div className="p-card" style={{marginBottom:'1rem',background:'var(--bg-card-warm)'}}>
          {overflow.map(({ day, data }, i) => {
            const subjects = data ? Object.entries(data).flatMap(([student, subjs]) =>
              typeof subjs === 'object' && subjs && !subjs.note
                ? Object.entries(subjs).map(([sub]) => `${student.charAt(0).toUpperCase() + student.slice(1)}: ${sub}`)
                : []
            ) : [];
            return (
              <div key={i} style={{padding:'0.3rem 0',borderBottom:'1px solid var(--border)',fontSize:'0.83rem'}}>
                <span style={{fontWeight:600,color:'var(--forest)'}}>{day}</span>
                {subjects.length > 0 && <span style={{color:'var(--text-secondary)',marginLeft:'0.4rem'}}>({subjects.join(', ')})</span>}
              </div>
            );
          })}
        </div>
        <div className="p-modal-actions">
          <button className="p-btn p-btn-ghost" onClick={() => setShiftOverflowDialog(null)}>Cancel Shift</button>
          <button className="p-btn p-btn-primary" onClick={handleConfirmDirect}>Confirm &amp; Apply →</button>
        </div>
      </div>
    </div>
  );
}

// ── Sick Day Shift Offer (appears after marking sick/off) ─────────────────────
export function SickDayShiftOffer() {
  const { sickDayShiftOffer, setSickDayShiftOffer, shiftSchedule } = usePlanner();
  if (!sickDayShiftOffer) return null;
  const { dayName } = sickDayShiftOffer;

  return (
    <div className="p-modal-overlay" onClick={() => setSickDayShiftOffer(null)}>
      <div className="p-modal" onClick={e => e.stopPropagation()} style={{maxWidth:340}}>
        <h2>Shift Lessons Forward?</h2>
        <p style={{fontSize:'0.875rem',color:'var(--text-secondary)',marginBottom:'1.25rem'}}>
          Move <strong>{dayName}'s</strong> lessons and the rest of this week forward by 1 school day?
        </p>
        <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
          <button className="p-btn p-btn-primary p-btn-block" onClick={() => shiftSchedule(dayName, 1)}>
            Yes, Shift 1 Day →
          </button>
          <button className="p-btn p-btn-ghost p-btn-block" onClick={() => setSickDayShiftOffer(null)}>
            Skip — I'll handle it manually
          </button>
        </div>
      </div>
    </div>
  );
}
