import React from 'react';
import { usePlanner } from './PlannerContext';
import { estimateSchoolDays } from './helpers';

export default function SetupWizard() {
  const {
    setupWizardOpen, setSetupWizardOpen,
    setupWizardStep, setSetupWizardStep,
    wizardData, setWizardData,
    calImporting, setCalImporting,
    calImportResult, setCalImportResult,
    calInputMode, setCalInputMode,
    calChatMessages, calChatLoading,
    calChatInput, setCalChatInput,
    calChatEndRef, calFileInputRef,
    sendCalendarMessage, saveWizardData,
  } = usePlanner();

  if (!setupWizardOpen) return null;

  const { extractFileContent } = usePlanner();

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
            <p style={{fontSize:'0.95rem',color:'var(--text-primary)',lineHeight:1.6}}>
              Welcome! Let's sync your planner with where you actually are in the school year — so your compliance numbers are accurate from day one.
            </p>
          </div>
          <div style={{background:'var(--bg-base)',borderRadius:10,padding:'1rem',fontSize:'0.85rem',color:'var(--forest)'}}>
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
            <div style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginTop:'0.3rem'}}>Used to estimate total hours from day count</div>
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
          <p style={{fontSize:'0.78rem',color:'var(--text-secondary)'}}>This appears on your annual compliance report. You can update it anytime in Settings.</p>
        </div>
      );
      case 5: return (
        <div>
          <p style={{fontSize:'0.875rem',color:'var(--text-primary)',marginBottom:'1rem',lineHeight:1.5}}>
            How many school days have you completed since {wizardData.schoolYearStart || '2025-08-25'}? This sets your compliance starting point.
          </p>
          {/* Mode tabs */}
          <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:'1.5px solid var(--forest)',marginBottom:'1rem'}}>
            {[['import','Import Calendar'],['estimate','Auto-Estimate'],['manual','Enter Manually']].map(([mode,label]) => (
              <button key={mode} onClick={() => { setCalInputMode(mode); setCalImportResult(null); }} style={{
                flex:1,border:'none',padding:'0.55rem 0.3rem',fontSize:'0.78rem',fontWeight:600,
                fontFamily:'inherit',cursor:'pointer',transition:'all 0.15s',
                background: calInputMode === mode ? 'var(--forest)' : 'var(--bg-card)',
                color: calInputMode === mode ? 'white' : 'var(--forest)',
              }}>{label}</button>
            ))}
          </div>

          {calInputMode === 'import' && (
            <div>
              {calChatMessages.length > 0 && (
                <div style={{
                  border:'1px solid var(--border)',borderRadius:10,
                  background:'var(--bg-base)',maxHeight:240,overflowY:'auto',
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
                        background:m.role==='user'?'var(--navy)':'var(--bg-card)',
                        color:m.role==='user'?'white':'var(--text-primary)',
                        border:m.role==='assistant'?'1px solid var(--border)':'none'
                      }}>{m.text}</div>
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

              {calImportResult && (
                <div style={{background:'var(--bg-base)',border:'1.5px solid var(--forest)',borderRadius:8,padding:'0.65rem 0.9rem',marginBottom:'0.75rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:'0.85rem',color:'var(--forest)',fontWeight:700}}>{calImportResult.days} days selected</span>
                  <button className="p-btn p-btn-ghost p-btn-sm" style={{color:'var(--text-secondary)'}} onClick={() => setCalImportResult(null)}>Change</button>
                </div>
              )}

              <div style={{display:'flex',gap:'0.4rem',alignItems:'flex-end'}}>
                <button
                  title="Attach file or photo"
                  style={{background:'none',border:'1.5px solid var(--border)',borderRadius:8,padding:'0.45rem 0.6rem',cursor:'pointer',fontSize:'1.1rem',minHeight:40,flexShrink:0}}
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
                  style={{flex:1,fontFamily:'inherit',fontSize:'0.85rem',border:'1.5px solid var(--border)',borderRadius:8,padding:'0.45rem 0.6rem',resize:'none',outline:'none',minHeight:40,background:'var(--bg-card)',color:'var(--text-primary)'}}
                  onChange={e => setCalChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); if (calChatInput.trim()) sendCalendarMessage(calChatInput); } }}
                />
                <button className="p-btn p-btn-primary p-btn-sm" style={{flexShrink:0}}
                  disabled={calChatLoading || !calChatInput.trim()}
                  onClick={() => sendCalendarMessage(calChatInput)}>Send</button>
              </div>
              <p style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:'0.4rem'}}>Attach any file type — PDF, image, HTML, ICS. Then chat to refine the count.</p>
            </div>
          )}

          {calInputMode === 'estimate' && (
            <div>
              <p style={{fontSize:'0.82rem',color:'var(--text-secondary)',marginBottom:'0.75rem'}}>
                Counts every Monday–Friday from your school year start through today. No holidays are excluded — adjust manually if needed.
              </p>
              <button className="p-btn p-btn-outline p-btn-block" onClick={handleEstimate}>
                Calculate Mon–Fri Days
              </button>
              {calImportResult && (
                <div style={{background:'var(--bg-base)',border:'1.5px solid var(--forest)',borderRadius:10,padding:'1rem',marginTop:'1rem'}}>
                  <div style={{fontSize:'1.5rem',fontWeight:700,color:'var(--forest)'}}>{calImportResult.days} days</div>
                  <div style={{fontSize:'0.8rem',color:'var(--text-secondary)',marginTop:'0.2rem'}}>≈ {calImportResult.hours} hours at {wizardData.defaultHoursPerDay || 5.5}h/day</div>
                  <div style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginTop:'0.5rem'}}>Adjust manually if needed — holidays are not excluded.</div>
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
          <p style={{fontSize:'0.875rem',color:'var(--text-secondary)',marginBottom:'1rem'}}>Review your setup and tap Finish to save.</p>
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
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.5rem 0.75rem',background:'var(--bg-base)',borderRadius:8,fontSize:'0.85rem'}}>
                <span style={{color:'var(--text-secondary)',fontWeight:600}}>{label}</span>
                <span style={{color:'var(--forest)',fontWeight:700}}>{String(val)}</span>
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
        <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'1rem'}}>
          {Array.from({length:totalSteps}).map((_,i) => (
            <div key={i} style={{
              flex:1,height:4,borderRadius:2,
              background: i < setupWizardStep ? 'var(--forest)' : 'var(--border)',
              transition:'background 0.3s'
            }} />
          ))}
        </div>
        <div style={{fontSize:'0.7rem',color:'var(--text-secondary)',textAlign:'right',marginBottom:'0.75rem'}}>Step {setupWizardStep} of {totalSteps}</div>

        <h2 style={{marginBottom:'1.25rem'}}>{stepTitles[setupWizardStep]}</h2>

        {stepContent()}

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
}
