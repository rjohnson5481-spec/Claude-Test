import React from 'react';
import { usePlanner } from './PlannerContext';
import { getSchoolDayNumber, calcProjectedFinish, formatShortDate } from './helpers';

export default function HistoryView() {
  const {
    compliance, archiveList, chatLogs,
    expandedArchive, setExpandedArchive,
    expandedChatLogs, setExpandedChatLogs,
    deleteArchiveEntry, totalDays, totalHours,
  } = usePlanner();

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
            <span style={{color:'var(--text-muted)'}}>{expandedArchive[item.id] ? '▲' : '▼'}</span>
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
            <span style={{fontSize:'0.85rem',color:'var(--forest)',fontWeight:600}}>{formatShortDate(log.id)}</span>
            <span style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{log.messages.length} messages {expandedChatLogs[log.id] ? '▲' : '▼'}</span>
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
}
