import React from 'react';
import { db } from '../../firebase.js';
import { doc, setDoc } from 'firebase/firestore';
import { usePlanner } from './PlannerContext';
import { DAYS_OF_WEEK } from './constants';
import { formatDateDisplay, getSchoolDayNumber, getWeekDateFor, getDateId } from './helpers';

export default function TodayView() {
  const {
    specificDate, setSpecificDate, viewDayOverride, setViewDayOverride,
    setSideMenuView, setSideMenuOpen, setActiveTab,
    weekSchedule, appSettings, todayLog, compliance,
    lessonChecks, setLessonChecks, lessonNotes, setLessonNotes,
    hoursLogged, setHoursLogged, dayNotes, setDayNotes,
    extraSubjects, setExtraSubjects, extraDetails, setExtraDetails,
    showFinalizePanel, setShowFinalizePanel, resolutions,
    newCustomSubject, setNewCustomSubject,
    viewedDayLog, viewedLessonChecks, setViewedLessonChecks,
    viewedHoursLogged, setViewedHoursLogged, viewedDayNotes, setViewedDayNotes,
    schoolDayStarted, weekId, todayId, dayOfWeek,
    saveLessonCheck, saveLessonNote, saveHoursLogged, saveDayNotes,
    saveExtraSubject, saveExtraDetailFull,
    handleFinalizeClick, getIncompleteLessons, canFinalize, resolveLesson, finalizeDay,
    startSchoolDay, showToast,
  } = usePlanner();

  // Back-to-calendar banner
  const calBackBanner = specificDate ? (
    <button className="p-btn p-btn-ghost p-btn-sm" style={{marginBottom:'0.75rem'}}
      onClick={() => { setSpecificDate(null); setViewDayOverride(null); setSideMenuView('attendance'); setSideMenuOpen(true); }}>
      ← Back to Calendar
    </button>
  ) : null;

  const effectiveDay = viewDayOverride || dayOfWeek;
  const isViewingToday = !viewDayOverride;
  const effectiveDayIdx = DAYS_OF_WEEK.indexOf(effectiveDay);
  const daySchedule = weekSchedule?.[effectiveDay];
  const isNoSchool = !daySchedule || daySchedule?.note === 'No School';
  const isWeekend = ['Saturday', 'Sunday'].includes(dayOfWeek) && isViewingToday;

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

  // Viewing a past/future weekday (not actual today)
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
      await setDoc(doc(db, 'schedule', weekId), { days: { [effectiveDay]: { note: null } } }, { merge: true });
      showToast(`${effectiveDay} No School mark removed.`);
    };

    return (
      <div>
        {calBackBanner}
        {dayNavRow}
        <div className="p-date-header">
          <h2>{formatDateDisplay(vDate)}</h2>
          <div className="p-day-num" style={{color: vFinalized ? '#166534' : isPast ? '#dc2626' : 'var(--gold)'}}>
            {vFinalized ? (vLog?.noSchool ? 'No School' : '✓ Finalized') : isPast ? 'Incomplete' : 'Upcoming'}
          </div>
        </div>

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
            {vLog?.noSchool && <p style={{marginTop:'0.5rem',fontSize:'0.82rem',color:'var(--text-muted)'}}>Marked as no school — not counted in compliance.</p>}
          </div>
        ) : (
          <>
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
                      {subjects.length === 0 && <div style={{fontSize:'0.82rem',color:'var(--text-muted)',padding:'0.5rem 0'}}>No lessons scheduled</div>}
                    </div>
                  </div>
                );
              })}
            </div>

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

  // Weekend or No School
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
          <p style={{marginTop:'0.5rem',color:'var(--text-muted)',fontSize:'0.85rem'}}>Enjoy your rest — see you next school day!</p>
        </div>
      </div>
    );
  }

  // Morning Mode (school day not yet started)
  if (!schoolDayStarted) {
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
                        <div className="p-lesson-text" style={{fontSize:'0.85rem',marginTop:'0.15rem',color:'var(--text-secondary)'}}>
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

  const addCustomSubject = async () => {
    if (!newCustomSubject.trim()) return;
    const updated = [...(appSettings.customSubjects || []), newCustomSubject.trim()];
    setNewCustomSubject('');
    // optimistically update via setAppSettings is not available in context — use Firestore which triggers snapshot
    await setDoc(doc(db, 'settings', 'app'), { customSubjects: updated }, { merge: true });
  };
  const removeCustomSubject = async (name) => {
    const updated = (appSettings.customSubjects || []).filter(s => s !== name);
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
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem'}}>
          <div className="p-card-title">Additional Learning</div>
          <span style={{fontSize:'0.7rem',color:'#b4933a',fontWeight:600,background:'#fef3c7',padding:'0.2rem 0.6rem',borderRadius:'999px',letterSpacing:'0.04em'}}>LOGGED TODAY</span>
        </div>

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
          {newCustomSubject !== null && (
            <div style={{display:'flex',gap:'0.4rem',alignItems:'center'}}>
              <input
                type="text"
                placeholder="New subject..."
                value={newCustomSubject}
                onChange={e => setNewCustomSubject(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomSubject(); if (e.key === 'Escape') setNewCustomSubject(''); }}
                autoFocus
                style={{width:'110px',padding:'0.3rem 0.5rem',fontFamily:'inherit',fontSize:'0.8rem',border:'1.5px solid var(--forest)',borderRadius:'999px',outline:'none',background:'var(--bg-card)',color:'var(--text-primary)'}}
              />
              <button className="p-btn p-btn-green p-btn-sm" style={{borderRadius:'999px',padding:'0.3rem 0.7rem'}} onClick={addCustomSubject}>Add</button>
              <button className="p-btn p-btn-ghost p-btn-sm" style={{borderRadius:'999px',padding:'0.3rem 0.5rem'}} onClick={() => setNewCustomSubject('')}>✕</button>
            </div>
          )}
          <button
            className="p-chip"
            style={{background:'transparent',borderStyle:'dashed',color:'var(--text-secondary)'}}
            onClick={() => setNewCustomSubject(newCustomSubject === '' ? '' : '')}
          >+ Add</button>
        </div>

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
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.65rem',flexWrap:'wrap',gap:'0.5rem'}}>
                <strong style={{fontSize:'0.85rem',color:'var(--forest)'}}>{label}</strong>
                <div style={{display:'flex',gap:'0.3rem'}}>
                  {[s1, s2, 'Both'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setExtraDetails(p=>({...p,[key]:{...p[key],student:opt}}))}
                      style={{
                        padding:'0.25rem 0.65rem',fontSize:'0.75rem',fontFamily:'inherit',
                        fontWeight:600,borderRadius:'999px',cursor:'pointer',border:'1.5px solid',
                        transition:'all 0.12s',
                        background: student===opt ? 'var(--forest)' : 'transparent',
                        color: student===opt ? 'white' : 'var(--forest)',
                        borderColor:'var(--forest)'
                      }}
                    >{opt}</button>
                  ))}
                </div>
              </div>
              <label>Topic / Lesson</label>
              <input
                type="text"
                value={det.topic || ''}
                placeholder="What was covered?"
                onChange={e => setExtraDetails(p=>({...p,[key]:{...p[key],topic:e.target.value}}))}
              />
              <label>Observations</label>
              <textarea
                value={det.observations || ''}
                placeholder="Teacher notes..."
                onChange={e => setExtraDetails(p=>({...p,[key]:{...p[key],observations:e.target.value}}))}
              />
              <div style={{textAlign:'right',marginTop:'0.5rem'}}>
                <button className="p-btn p-btn-green p-btn-sm" onClick={saveAll}>Save {label}</button>
              </div>
            </div>
          );
        })}
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
}
