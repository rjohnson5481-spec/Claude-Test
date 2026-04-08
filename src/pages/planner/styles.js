// ─── Parchment & Forest Design System ─────────────────────────────────────────
export const styles = `
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap');

:root {
  --bg-base: #f5f0e8;
  --bg-card: #ffffff;
  --bg-card-warm: #fdf8f0;
  --forest: #2d5a3d;
  --forest-dark: #1e3d2a;
  --forest-light: #4a7c5c;
  --gold: #8a6a20;
  --gold-light: #c4973a;
  --navy: #1e2d4a;
  --text-primary: #1a1a1a;
  --text-secondary: #5a5a5a;
  --text-muted: #9a9a9a;
  --border: rgba(0,0,0,0.08);
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.10);
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;
}
[data-mode="dark"] {
  --bg-base: #1a1f1b;
  --bg-card: #242a25;
  --bg-card-warm: #2a2f2b;
  --forest: #4a7c5c;
  --gold: #c4973a;
  --text-primary: #f0ede6;
  --text-secondary: #b0ada6;
  --text-muted: #707570;
  --border: rgba(255,255,255,0.08);
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.3);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.pw { font-family: 'Lexend', sans-serif; background: var(--bg-base); color: var(--text-primary); min-height: 100vh; position: relative; }
.pw *, .pw *::before, .pw *::after { box-sizing: border-box; }

/* Loading / Login */
.p-fullscreen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-base); flex-direction: column; gap: 1.5rem; padding: 2rem; }
.p-login-card { background: var(--bg-card); border-radius: var(--radius-md); box-shadow: var(--shadow-md); padding: 2.5rem 2rem; text-align: center; max-width: 380px; width: 100%; }
.p-school-hero { font-family: 'Lexend', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--forest); margin-bottom: 0.35rem; }
.p-tagline-hero { color: var(--gold); font-size: 0.85rem; letter-spacing: 0.12em; margin-bottom: 1.75rem; }
.p-login-title { font-size: 1rem; color: var(--text-secondary); margin-bottom: 1.5rem; }
.p-spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--forest); border-radius: 50%; animation: pspin 0.8s linear infinite; }
@keyframes pspin { to { transform: rotate(360deg); } }
.p-dot-spin { display: inline-flex; gap: 4px; align-items: center; }
.p-dot-spin span { width: 7px; height: 7px; border-radius: 50%; background: var(--navy); animation: pdot 1.2s ease-in-out infinite; }
.p-dot-spin span:nth-child(2) { animation-delay: 0.2s; }
.p-dot-spin span:nth-child(3) { animation-delay: 0.4s; }
@keyframes pdot { 0%,80%,100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }

/* Buttons */
.p-btn { display: inline-flex; align-items: center; gap: 0.4rem; border: none; border-radius: var(--radius-sm); padding: 0.65rem 1.1rem; font-family: 'Lexend', sans-serif; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; text-decoration: none; min-height: 44px; }
.p-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.p-btn-primary { background: var(--navy); color: white; }
.p-btn-primary:hover:not(:disabled) { background: #162139; }
.p-btn-green { background: var(--forest); color: white; }
.p-btn-green:hover:not(:disabled) { background: var(--forest-dark); }
.p-btn-gold { background: var(--gold); color: white; }
.p-btn-gold:hover:not(:disabled) { background: var(--gold-light); }
.p-btn-outline { background: transparent; color: var(--forest); border: 1.5px solid var(--forest); }
.p-btn-outline:hover:not(:disabled) { background: var(--forest); color: white; }
.p-btn-ghost { background: transparent; color: var(--text-secondary); border: none; padding: 0.4rem 0.7rem; }
.p-btn-ghost:hover { background: var(--border); color: var(--text-primary); }
.p-btn-danger { background: #dc2626; color: white; }
.p-btn-danger:hover:not(:disabled) { background: #b91c1c; }
.p-btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; min-height: 36px; }
.p-btn-lg { padding: 0.75rem 1.5rem; font-size: 1rem; }
.p-btn-block { width: 100%; justify-content: center; }
.p-google-btn { background: var(--bg-card); color: var(--text-primary); border: 1.5px solid var(--border); font-size: 0.95rem; padding: 0.75rem 1.5rem; border-radius: var(--radius-sm); }
.p-google-btn:hover { background: var(--bg-card-warm); box-shadow: var(--shadow-sm); }

/* Top Bar */
.p-topbar { position: sticky; top: 0; z-index: 100; background: var(--forest); color: white; display: flex; align-items: center; padding: 0 1rem; gap: 0.75rem; height: 60px; box-shadow: var(--shadow-md); }
.p-topbar-menu-btn { background: none; border: none; cursor: pointer; color: white; font-size: 1.4rem; padding: 0.4rem; line-height: 1; min-height: 44px; display: flex; align-items: center; }
.p-topbar-center { flex: 1; text-align: center; }
.p-topbar-name { font-family: 'Lexend', sans-serif; font-size: 0.9rem; font-weight: 700; color: white; line-height: 1.2; }
.p-topbar-tagline { font-size: 0.6rem; color: rgba(255,255,255,0.7); letter-spacing: 0.1em; }
.p-compliance-mini { text-align: right; font-size: 0.7rem; color: rgba(255,255,255,0.85); min-width: 90px; }
.p-compliance-mini .p-cm-row { display: flex; align-items: center; gap: 0.35rem; margin-bottom: 2px; white-space: nowrap; }
.p-cm-bar { height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; flex: 1; overflow: hidden; }
.p-cm-fill { height: 100%; background: var(--gold-light); border-radius: 2px; transition: width 0.5s ease; }

/* Tab Nav */
.p-tabnav { display: flex; background: var(--bg-card); border-bottom: 1px solid var(--border); position: sticky; top: 60px; z-index: 99; }
.p-tabnav button { flex: 1; border: none; background: none; padding: 0.65rem 0.5rem; font-family: 'Lexend', sans-serif; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 2.5px solid transparent; transition: all 0.15s; letter-spacing: 0.05em; text-transform: uppercase; }
.p-tabnav button.active { color: var(--forest); border-bottom-color: var(--forest); }
.p-tabnav button:hover:not(.active) { color: var(--text-primary); background: var(--bg-card-warm); }

/* Main content */
.p-main { padding: 1rem; padding-bottom: 130px; max-width: 900px; margin: 0 auto; }

/* Side Menu */
.p-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; }
.p-sidemenu { position: fixed; top: 0; left: 0; bottom: 0; width: 280px; background: var(--bg-card); z-index: 201; transform: translateX(-100%); transition: transform 0.25s ease; display: flex; flex-direction: column; box-shadow: 4px 0 24px rgba(0,0,0,0.15); }
.p-sidemenu.open { transform: translateX(0); }
.p-sidemenu-header { background: var(--forest); color: white; padding: 1.25rem 1rem; display: flex; align-items: center; justify-content: space-between; }
.p-sidemenu-title { font-family: 'Lexend', sans-serif; font-size: 1rem; font-weight: 600; }
.p-sidemenu-close { background: none; border: none; color: white; font-size: 1.3rem; cursor: pointer; line-height: 1; }
.p-sidemenu-nav { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
.p-sidemenu-item { display: flex; align-items: center; gap: 0.75rem; width: 100%; border: none; background: none; padding: 0.85rem 1.25rem; font-family: 'Lexend', sans-serif; font-size: 0.9rem; cursor: pointer; color: var(--text-primary); transition: background 0.15s; text-align: left; }
.p-sidemenu-item:hover { background: var(--bg-base); }
.p-sidemenu-item span.icon { font-size: 1.1rem; width: 24px; }

/* Subview */
.p-subview { position: fixed; inset: 0; background: var(--bg-base); z-index: 300; display: flex; flex-direction: column; overflow: hidden; }
.p-subview-header { background: var(--forest); color: white; padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.75rem; }
.p-subview-header h2 { font-family: 'Lexend', sans-serif; font-size: 1rem; flex: 1; }
.p-subview-back { background: none; border: none; color: white; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
.p-subview-body { flex: 1; overflow-y: auto; padding: 1.25rem 1rem; }

/* Cards */
.p-card { background: var(--bg-card); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 1.25rem; margin-bottom: 1rem; border: 1px solid var(--border); }
.p-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.p-card-title { font-family: 'Lexend', sans-serif; font-size: 0.95rem; font-weight: 600; color: var(--forest); }

/* Section headers */
.p-section-title { font-family: 'Lexend', sans-serif; font-size: 0.95rem; font-weight: 600; color: var(--forest); margin-bottom: 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--border); }
.p-date-header { text-align: center; margin-bottom: 1.25rem; }
.p-date-header h2 { font-family: 'Lexend', sans-serif; font-size: 1.1rem; color: var(--forest); }
.p-date-header .p-day-num { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem; }

/* TODAY: lesson rows */
.p-students-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
@media (max-width: 640px) { .p-students-grid { grid-template-columns: 1fr; } }
.p-student-card { background: var(--bg-card); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); border: 1px solid var(--border); overflow: hidden; }
.p-student-header { background: var(--forest); color: white; padding: 0.75rem 1rem; font-family: 'Lexend', sans-serif; font-size: 0.875rem; font-weight: 600; }
.p-student-body { padding: 0.9rem; }
.p-lesson-row { margin-bottom: 0.85rem; }
.p-lesson-check-row { display: flex; align-items: flex-start; gap: 0.7rem; }
.p-lesson-check-row input[type=checkbox] { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--forest); flex-shrink: 0; cursor: pointer; }
.p-lesson-label { font-size: 0.9rem; line-height: 1.5; flex: 1; }
.p-lesson-subject { font-weight: 700; color: var(--forest); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; }
.p-lesson-text { color: var(--text-primary); }
.p-lesson-notes { width: 100%; margin-top: 0.4rem; padding: 0.4rem 0.6rem; font-family: 'Lexend', sans-serif; font-size: 0.8rem; border: 1px solid var(--border); border-radius: var(--radius-sm); resize: vertical; min-height: 48px; background: var(--bg-base); outline: none; color: var(--text-primary); }
.p-lesson-notes:focus { border-color: var(--forest); }
.p-badge-carried { background: var(--gold); color: white; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 999px; margin-left: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em; }
.p-badge-skipped { background: var(--text-muted); color: white; font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 999px; margin-left: 0.35rem; }

/* Extra subjects */
.p-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem; }
.p-chip { border: 1.5px solid var(--forest); color: var(--forest); background: transparent; border-radius: 999px; padding: 0.45rem 1rem; font-size: 0.85rem; font-family: 'Lexend', sans-serif; cursor: pointer; transition: all 0.15s; font-weight: 600; min-height: 38px; }
.p-chip.active { background: var(--forest); color: white; }
.p-chip:hover { background: var(--forest); color: white; }
.p-extra-panel { background: var(--bg-base); border-radius: var(--radius-sm); padding: 0.9rem; margin-top: 0.5rem; margin-bottom: 0.75rem; }
.p-extra-panel label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.2rem; text-transform: uppercase; letter-spacing: 0.05em; }
.p-extra-panel input, .p-extra-panel textarea { width: 100%; padding: 0.4rem 0.6rem; font-family: 'Lexend', sans-serif; font-size: 0.85rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); outline: none; margin-bottom: 0.5rem; color: var(--text-primary); }
.p-extra-panel textarea { min-height: 56px; resize: vertical; }
.p-extra-panel input:focus, .p-extra-panel textarea:focus { border-color: var(--forest); }

/* Day notes / hours */
.p-field { margin-bottom: 0.85rem; }
.p-field label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.05em; }
.p-field input, .p-field textarea, .p-field select { width: 100%; padding: 0.55rem 0.75rem; font-family: 'Lexend', sans-serif; font-size: 0.9rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card); outline: none; color: var(--text-primary); }
.p-field input:focus, .p-field textarea:focus, .p-field select:focus { border-color: var(--forest); box-shadow: 0 0 0 2px rgba(45,90,61,0.12); }
.p-field textarea { resize: vertical; min-height: 72px; }
.p-field-row { display: flex; gap: 0.75rem; }
.p-field-row .p-field { flex: 1; }

/* Finalize */
.p-finalize-panel { background: #fff8f0; border: 1.5px solid #f59e0b; border-radius: var(--radius-sm); padding: 1.25rem; margin-top: 1rem; }
.p-finalize-title { font-family: 'Lexend', sans-serif; font-size: 0.875rem; font-weight: 600; color: #92400e; margin-bottom: 1rem; }
.p-incomplete-item { background: var(--bg-card); border-radius: var(--radius-sm); padding: 0.75rem; margin-bottom: 0.75rem; border: 1px solid var(--border); }
.p-incomplete-item p { font-size: 0.85rem; margin-bottom: 0.6rem; }
.p-resolution-btns { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.p-resolution-btns button { font-size: 0.78rem; padding: 0.3rem 0.65rem; }

/* WEEK view */
.p-week-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
.p-week-title { font-family: 'Lexend', sans-serif; font-size: 1.05rem; font-weight: 600; color: var(--forest); }
.p-week-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.p-day-card { background: var(--bg-card); border-radius: var(--radius-sm); margin-bottom: 0.75rem; box-shadow: var(--shadow-sm); border: 1px solid var(--border); overflow: hidden; border-left: 3px solid var(--border); }
.p-day-card.finalized { border-left-color: var(--forest); }
.p-day-card.started { border-left-color: #f59e0b; }
.p-day-card-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; cursor: pointer; user-select: none; min-height: 52px; }
.p-day-card-header:hover { background: var(--bg-base); }
.p-day-name { font-family: 'Lexend', sans-serif; font-size: 0.875rem; font-weight: 600; color: var(--forest); }
.p-day-status { font-size: 0.8rem; }
.p-day-body { padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
.p-day-student { margin-bottom: 0.6rem; }
.p-day-student-name { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-secondary); margin-bottom: 0.25rem; }
.p-day-lesson { font-size: 0.83rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.2rem; }
.p-day-lesson .done { color: var(--forest); }
.p-day-lesson .undone { color: var(--text-muted); }
.p-pacing { display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; }
.p-pacing-badge { font-size: 0.72rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 999px; }
.p-pacing-on { background: #dcfce7; color: #166534; }
.p-pacing-ahead { background: #dbeafe; color: #1e40af; }
.p-pacing-behind { background: #fee2e2; color: #991b1b; }
.p-no-school { font-size: 0.85rem; color: var(--text-secondary); font-style: italic; padding: 0.25rem 0; }

/* Report */
.p-report-panel { background: var(--bg-card); border-radius: var(--radius-sm); box-shadow: var(--shadow-sm); padding: 1.25rem; margin-top: 1rem; }
.p-report-content { font-size: 0.875rem; line-height: 1.7; white-space: pre-wrap; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1rem; background: var(--bg-base); max-height: 400px; overflow-y: auto; color: var(--text-primary); }
.p-report-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; }

/* HISTORY */
.p-compliance-dashboard { background: var(--forest); color: white; border-radius: var(--radius-sm); padding: 1.25rem; margin-bottom: 1rem; }
.p-compliance-dashboard h2 { font-family: 'Lexend', sans-serif; font-size: 0.9rem; margin-bottom: 1rem; color: var(--gold-light); letter-spacing: 0.08em; }
.p-comp-stat { margin-bottom: 0.85rem; }
.p-comp-label { display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.35rem; }
.p-comp-bar { height: 8px; background: rgba(255,255,255,0.15); border-radius: 4px; overflow: hidden; }
.p-comp-fill { height: 100%; background: var(--gold-light); border-radius: 4px; transition: width 0.7s ease; }
.p-comp-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.75rem; font-size: 0.78rem; color: rgba(255,255,255,0.75); }
.p-archive-item { background: var(--bg-card); border-radius: var(--radius-sm); margin-bottom: 0.75rem; box-shadow: var(--shadow-sm); border: 1px solid var(--border); overflow: hidden; }
.p-archive-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; cursor: pointer; }
.p-archive-header:hover { background: var(--bg-base); }
.p-archive-week { font-family: 'Lexend', sans-serif; font-size: 0.85rem; font-weight: 600; color: var(--forest); }
.p-archive-date { font-size: 0.78rem; color: var(--text-secondary); }
.p-archive-body { border-top: 1px solid var(--border); padding: 1rem; }
.p-archive-html { font-size: 0.82rem; max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.75rem; background: var(--bg-base); }
.p-archive-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }

/* Chat logs */
.p-chat-log-item { background: var(--bg-card); border-radius: var(--radius-sm); margin-bottom: 0.75rem; border: 1px solid var(--border); overflow: hidden; }
.p-chat-log-header { display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 1rem; cursor: pointer; }
.p-chat-log-header:hover { background: var(--bg-base); }
.p-chat-log-body { border-top: 1px solid var(--border); padding: 0.75rem; max-height: 250px; overflow-y: auto; }
.p-chat-log-msg { margin-bottom: 0.5rem; }
.p-chat-log-msg.user { text-align: right; }
.p-chat-log-bubble { display: inline-block; padding: 0.4rem 0.75rem; border-radius: 10px; font-size: 0.8rem; max-width: 85%; text-align: left; }
.p-chat-log-msg.user .p-chat-log-bubble { background: var(--navy); color: white; }
.p-chat-log-msg.assistant .p-chat-log-bubble { background: var(--bg-base); color: var(--text-primary); }

/* AI Chat Drawer */
.p-chat-tab { position: fixed; bottom: 0; left: 0; right: 0; background: var(--navy); color: white; z-index: 150; cursor: pointer; padding: 0.7rem 1.25rem; display: flex; align-items: center; justify-content: space-between; user-select: none; }
.p-chat-tab-label { font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
.p-chat-unread-dot { width: 8px; height: 8px; background: var(--gold-light); border-radius: 50%; display: inline-block; }
.p-chat-drawer { position: fixed; bottom: 0; left: 0; right: 0; height: 55vh; background: var(--bg-card); z-index: 151; display: flex; flex-direction: column; box-shadow: 0 -4px 24px rgba(0,0,0,0.15); transform: translateY(0); }
.p-chat-drawer.hidden { display: none; }
.p-chat-handle { width: 40px; height: 4px; background: var(--border); border-radius: 2px; margin: 8px auto; }
.p-chat-header { background: var(--navy); color: white; padding: 0.6rem 1rem; display: flex; align-items: center; justify-content: space-between; }
.p-chat-header h3 { font-family: 'Lexend', sans-serif; font-size: 0.875rem; }
.p-chat-close { background: none; border: none; color: white; font-size: 1.1rem; cursor: pointer; }
.p-chat-messages { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
.p-chat-msg { display: flex; flex-direction: column; }
.p-chat-msg.user { align-items: flex-end; }
.p-chat-msg.assistant { align-items: flex-start; }
.p-chat-bubble { max-width: 82%; padding: 0.55rem 0.9rem; border-radius: 12px; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; }
.p-chat-msg.user .p-chat-bubble { background: var(--navy); color: white; border-bottom-right-radius: 4px; }
.p-chat-msg.assistant .p-chat-bubble { background: var(--bg-base); color: var(--text-primary); border-bottom-left-radius: 4px; }
.p-chat-ts { font-size: 0.68rem; color: var(--text-muted); margin-top: 2px; }
.p-chat-input-row { padding: 0.65rem 0.75rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem; align-items: flex-end; }
.p-chat-input-row textarea { flex: 1; font-family: 'Lexend', sans-serif; font-size: 0.875rem; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.5rem 0.65rem; resize: none; outline: none; min-height: 40px; max-height: 100px; background: var(--bg-card); color: var(--text-primary); }
.p-chat-input-row textarea:focus { border-color: var(--navy); }

/* Attendance Calendar */
.p-cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.p-cal-month { font-family: 'Lexend', sans-serif; font-size: 0.95rem; color: var(--forest); }
.p-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-bottom: 0.5rem; }
.p-cal-dow { text-align: center; font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); padding: 0.2rem; text-transform: uppercase; }
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
.p-cal-legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; color: var(--text-secondary); }
.p-cal-legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.p-cal-day.weekend { color: var(--text-muted); }
.p-cal-day.future { color: var(--border); }
.p-cal-day.empty { }
.p-cal-day:hover:not(.future):not(.weekend):not(.empty) { opacity: 0.75; }
.p-cal-summary { font-size: 0.78rem; color: var(--text-secondary); text-align: right; margin-bottom: 1.5rem; }
.p-cal-popup { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); z-index: 400; padding: 1rem; }
.p-cal-popup-card { background: var(--bg-card); border-radius: var(--radius-sm); padding: 1.25rem; max-width: 320px; width: 100%; }
.p-cal-popup-card h3 { font-family: 'Lexend', sans-serif; font-size: 0.9rem; color: var(--forest); margin-bottom: 0.75rem; }

/* Memory Work */
.p-mem-filter { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
.p-mem-filter select { font-family: 'Lexend', sans-serif; font-size: 0.8rem; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.3rem 0.5rem; background: var(--bg-card); outline: none; color: var(--text-primary); }
.p-mem-group { margin-bottom: 1.25rem; }
.p-mem-group-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin-bottom: 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--border); }
.p-mem-item { background: var(--bg-card); border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 0.5rem; overflow: hidden; }
.p-mem-item-header { padding: 0.65rem 0.85rem; cursor: pointer; display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
.p-mem-item-header:hover { background: var(--bg-base); }
.p-mem-ref { font-weight: 600; font-size: 0.83rem; color: var(--navy); }
.p-mem-preview { font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem; }
.p-mem-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; flex-shrink: 0; }
.p-mem-badge { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; border-radius: 999px; text-transform: uppercase; }
.p-mem-badge.learning { background: #dbeafe; color: #1e40af; }
.p-mem-badge.reciting { background: #fef3c7; color: #92400e; }
.p-mem-badge.mastered { background: #dcfce7; color: #166534; }
.p-mem-badge.student { background: #f3e8ff; color: #6b21a8; }
.p-mem-item-body { border-top: 1px solid var(--border); padding: 0.75rem 0.85rem; }
.p-mem-full-text { font-size: 0.83rem; line-height: 1.6; background: var(--bg-base); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; margin-bottom: 0.75rem; }

/* Portfolio */
.p-port-tabs { display: flex; margin-bottom: 1rem; border-bottom: 2px solid var(--border); }
.p-port-tab { border: none; background: none; padding: 0.6rem 1.25rem; font-family: 'Lexend', sans-serif; font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -2px; transition: all 0.15s; }
.p-port-tab.active { color: var(--forest); border-bottom-color: var(--forest); }
.p-port-stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
.p-port-stat { background: var(--bg-card); border-radius: var(--radius-sm); padding: 0.75rem; text-align: center; border: 1px solid var(--border); }
.p-port-stat-val { font-family: 'Lexend', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--forest); }
.p-port-stat-label { font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }

/* Settings */
.p-settings-section { margin-bottom: 1.5rem; }
.p-settings-section h3 { font-family: 'Lexend', sans-serif; font-size: 0.875rem; color: var(--forest); margin-bottom: 0.75rem; }
.p-danger-zone { background: #fff5f5; border: 1.5px solid #fca5a5; border-radius: var(--radius-sm); padding: 1rem; }
.p-danger-zone h3 { color: #dc2626; }

/* Confirmation Dialog */
.p-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.p-modal { background: var(--bg-card); border-radius: var(--radius-md); max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto; padding: 1.5rem; }
.p-modal h2 { font-family: 'Lexend', sans-serif; font-size: 1rem; color: var(--forest); margin-bottom: 1rem; }
.p-modal-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 1rem; }
.p-modal-table th { background: var(--forest); color: white; padding: 0.5rem 0.6rem; text-align: left; font-weight: 600; }
.p-modal-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); color: var(--text-primary); }
.p-modal-table tr:nth-child(even) td { background: var(--bg-base); }
.p-modal-table input, .p-modal-table select { width: 100%; font-family: 'Lexend', sans-serif; font-size: 0.82rem; border: 1px solid var(--border); border-radius: 4px; padding: 0.25rem 0.4rem; background: var(--bg-card); color: var(--text-primary); }
.p-modal-actions { display: flex; gap: 0.6rem; justify-content: flex-end; flex-wrap: wrap; }

/* Toast */
.p-toast { position: fixed; top: 1rem; right: 1rem; background: var(--forest); color: white; border-radius: var(--radius-sm); padding: 0.75rem 1.1rem; font-size: 0.875rem; z-index: 1000; box-shadow: var(--shadow-md); animation: ptoast 0.2s ease; }
@keyframes ptoast { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

/* Home link */
.p-home-link { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; color: var(--text-secondary); text-decoration: none; padding: 0.4rem 0; }
.p-home-link:hover { color: var(--forest); }

/* Misc */
.p-divider { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.p-empty { text-align: center; color: var(--text-secondary); font-size: 0.875rem; padding: 2rem 1rem; }
.p-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.p-text-sm { font-size: 0.8rem; color: var(--text-secondary); }
.p-text-gold { color: var(--gold); }
.p-text-green { color: var(--forest); }
.p-mb1 { margin-bottom: 0.5rem; }
.p-mb2 { margin-bottom: 1rem; }
.p-gap { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.p-no-school-banner { background: var(--bg-base); border-radius: var(--radius-sm); padding: 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.9rem; }
`;
