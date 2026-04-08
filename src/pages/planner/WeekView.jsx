import React from 'react';
import { db } from '../../firebase.js';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { usePlanner } from './PlannerContext';
import { DAYS_OF_WEEK } from './constants';
import { getDayOfWeek, getWeekId, getWeekLabel } from './helpers';

export default function WeekView() {
  const {
    weekSchedule, weekOffset, setWeekOffset, allLogs, appSettings,
    expandedDays, setExpandedDays, editingLesson, setEditingLesson,
    weekNotes, setWeekNotes, weekReport, generatingReport,
    weekId, fileInputRef, setPendingImages, setChatInput, setChatOpen,
    generateWeekReport, downloadPDF, archiveAsHTML, saveToArchive, saveWeekNotes,
    showToast,
  } = usePlanner();

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
            {weekOffset !== 0 && <div style={{fontSize:'0.72rem',color:'var(--gold)'}}>
              {weekOffset < 0 ? 'Past week' : 'Future week'}
            </div>}
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
        const borderAccent = status === 'finalized' ? '3px solid var(--forest)' : status === 'started' ? '3px solid #f59e0b' : '3px solid var(--border)';

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
              <span style={{color:'var(--text-muted)',fontSize:'0.85rem',marginLeft:'0.5rem'}}>{expanded ? '▲' : '▼'}</span>
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
                                <span style={{fontSize:'0.75rem',fontWeight:600,textTransform:'uppercase',color:'var(--text-secondary)',minWidth:48}}>{subject}</span>
                                {editingLesson?.day === day && editingLesson?.student === student && editingLesson?.subject === subject ? (
                                  <input
                                    autoFocus
                                    style={{flex:1,font:'inherit',fontSize:'0.83rem',border:'1px solid var(--forest)',borderRadius:'5px',padding:'0.2rem 0.4rem',outline:'none',background:'var(--bg-card)',color:'var(--text-primary)'}}
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
}
