import React from 'react';
import { db } from '../../firebase.js';
import { doc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase.js';
import { usePlanner } from './PlannerContext';
import { calcProjectedFinish } from './helpers';

export function PortfoliosView() {
  const {
    portTab, setPortTab, allLogs, appSettings, memoryWorkItems,
  } = usePlanner();

  const student = portTab;
  const studentName = student === 'orion' ? appSettings.studentName1 || 'Orion' : appSettings.studentName2 || 'Malachi';
  const logs = Object.values(allLogs);
  const days = logs.filter(l => l?.finalized).length;
  const hours = logs.reduce((acc, l) => acc + (l?.hoursLogged || 0), 0);
  const mastered = memoryWorkItems.filter(i => (i.student === student || i.student === 'Both') && i.status === 'Mastered');
  const readingLessons = logs.flatMap(l => l?.lessons?.[student]?.reading?.done ? [l?.lessons?.[student]?.reading?.notes] : []).filter(Boolean);

  const exportHTML = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${studentName} — Portfolio</title><style>body{font-family:Georgia,serif;max-width:700px;margin:2rem auto;padding:2rem;color:#2c2c2c}h1{color:#1a3a2a}h2{color:#1e2d4a;border-bottom:1px solid #eee;padding-bottom:0.3rem}ul{line-height:1.8}</style></head><body><h1>${studentName} — Academic Portfolio</h1><h2>Iron &amp; Light Johnson Academy</h2><p><strong>Total School Days:</strong> ${days}<br><strong>Total Hours:</strong> ${hours.toFixed(1)}<br></p><h2>Memory Work Mastered</h2><ul>${mastered.map(i=>`<li>${i.reference} — ${i.text.slice(0,60)}…</li>`).join('')}</ul></body></html>`;
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
            <div key={i} style={{fontSize:'0.85rem',borderBottom:'1px solid var(--border)',padding:'0.4rem 0'}}>
              <span style={{color:'var(--gold)',marginRight:'0.4rem'}}>✓</span>
              <strong>{item.reference}</strong> — {item.text.slice(0, 80)}{item.text.length > 80 ? '…' : ''}
            </div>
          ))}
        </div>
      )}
      {readingLessons.length > 0 && (
        <div className="p-card">
          <div className="p-card-title p-mb1">Reading Notes</div>
          {readingLessons.slice(0, 20).map((note, i) => (
            <div key={i} style={{fontSize:'0.82rem',color:'var(--text-secondary)',padding:'0.25rem 0',borderBottom:'1px solid var(--border)'}}>{note}</div>
          ))}
        </div>
      )}
      <button className="p-btn p-btn-outline p-btn-sm" onClick={exportHTML} style={{marginTop:'0.5rem'}}>Export as HTML</button>
    </div>
  );
}

export function MemoryWorkView() {
  const {
    memoryWorkItems, memFilter, setMemFilter,
    showMemForm, setShowMemForm, newMemItem, setNewMemItem,
    expandedMemItems, setExpandedMemItems, editMemItem, setEditMemItem,
    saveMemoryItem,
  } = usePlanner();

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
                    {item.status === 'Mastered' && <span style={{color:'var(--gold)'}}>✦</span>}
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
}

export function NDComplianceView() {
  const { totalDays, totalHours, generateNDReport } = usePlanner();
  return (
    <div>
      <div className="p-card">
        <div className="p-card-title p-mb1">Current Compliance Status</div>
        <p style={{fontSize:'0.875rem',marginBottom:'0.4rem'}}><strong>Days:</strong> {totalDays} / 175</p>
        <p style={{fontSize:'0.875rem',marginBottom:'0.4rem'}}><strong>Hours:</strong> {totalHours.toFixed(1)} / 1025</p>
        <p style={{fontSize:'0.875rem',marginBottom:'0.4rem'}}><strong>Projected Finish:</strong> {calcProjectedFinish(totalDays)}</p>
        <p style={{fontSize:'0.875rem'}}><strong>Remaining Days:</strong> {Math.max(0, 175 - totalDays)}</p>
      </div>
      <button className="p-btn p-btn-primary" onClick={generateNDReport}>Generate Year-End Report PDF</button>
      <p style={{fontSize:'0.78rem',color:'var(--text-secondary)',marginTop:'0.75rem'}}>Generates a formatted PDF suitable for North Dakota homeschool reporting requirements.</p>
    </div>
  );
}

export function SettingsView() {
  const {
    settingsForm, setSettingsForm, appSettings, compliance,
    saveSettings, resetWeekSchedule, clearTodayLog, showToast,
    setWizardData, setSetupWizardStep, setCalImportResult, setSetupWizardOpen,
  } = usePlanner();

  return (
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
        <p style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginTop:'0.4rem'}}>Re-run the guided setup to update compliance starting values or import a calendar.</p>
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
        <p style={{fontSize:'0.8rem',color:'var(--text-secondary)',marginBottom:'0.75rem'}}>
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
}
