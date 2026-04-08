import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth, googleProvider } from '../firebase.js';
import {
  doc, setDoc, updateDoc, onSnapshot, collection,
  getDocs, deleteDoc, arrayUnion, getDoc
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { PlannerContext } from './planner/PlannerContext';
import { styles } from './planner/styles';
import { APP_VERSION, ALLOWED_EMAILS, DAYS_OF_WEEK, CHAT_SYSTEM_PROMPT, SEED_SCHEDULE } from './planner/constants';
import {
  getTodayId, getWeekId, getDayOfWeek, getWeekIdWithOffset, getWeekDateFor,
  getDateId, getYesterdayId, formatTime
} from './planner/helpers';
import { extractFileContent } from './planner/fileHelpers';
import { LoadingScreen, LoginScreen, AccessDeniedScreen, Toast, renderChatBubble } from './planner/screens';
import TodayView from './planner/TodayView';
import WeekView from './planner/WeekView';
import HistoryView from './planner/HistoryView';
import SetupWizard from './planner/SetupWizard';
import { PortfoliosView, MemoryWorkView, NDComplianceView, SettingsView } from './planner/SideMenuViews';
import { AttendanceCalendar, NewWeekModal, ConfirmDialog, ShiftDaysModal, ShiftOverflowDialog, SickDayShiftOffer } from './planner/Modals';

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

  // Schedule shifting
  const [shiftDaysModal, setShiftDaysModal] = useState(null);       // { fromDay, numDays }
  const [shiftOverflowDialog, setShiftOverflowDialog] = useState(null); // { currentWeekUpdates, overflow, pendingWeekId }
  const [sickDayShiftOffer, setSickDayShiftOffer] = useState(null); // { dateStr, dayName }

  // Toast
  const [toast, setToast] = useState(null);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatFileInputRef = useRef(null);

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

  // ── Shift schedule forward ────────────────────────────────────────────────────
  const shiftSchedule = async (fromDay, numDays, confirmedOverflow = false) => {
    if (!weekSchedule) return;
    const fromIdx = DAYS_OF_WEEK.indexOf(fromDay);
    if (fromIdx === -1) return;
    const sourceDays = DAYS_OF_WEEK.slice(fromIdx);
    const sourceData = {};
    sourceDays.forEach(d => { sourceData[d] = weekSchedule[d] || null; });

    const currentWeekUpdates = {};
    const overflow = [];

    // Clear the vacated leading slots (nothing lands on them)
    for (let i = 0; i < Math.min(numDays, sourceDays.length); i++) {
      currentWeekUpdates[`days.${sourceDays[i]}`] = {};
    }

    // Assign each source day to its shifted target
    sourceDays.forEach((day, i) => {
      const targetIdx = fromIdx + i + numDays;
      if (targetIdx < 5) {
        currentWeekUpdates[`days.${DAYS_OF_WEEK[targetIdx]}`] = sourceData[day] || {};
      } else {
        const nextIdx = targetIdx - 5;
        if (nextIdx < 5 && sourceData[day]) {
          overflow.push({ day: DAYS_OF_WEEK[nextIdx], data: sourceData[day] });
        }
      }
    });

    // If overflow exists and not yet confirmed, pause and show dialog
    if (overflow.length > 0 && !confirmedOverflow) {
      setShiftOverflowDialog({ currentWeekUpdates, overflow, pendingWeekId: weekId });
      return;
    }

    // Apply current-week updates
    await setDoc(doc(db, 'schedule', weekId), {}, { merge: true });
    for (const [path, val] of Object.entries(currentWeekUpdates)) {
      await updateDoc(doc(db, 'schedule', weekId), { [path]: val });
    }

    // Apply next-week overflow
    if (overflow.length > 0) {
      const nextWeekId = getWeekIdWithOffset(weekOffset + 1);
      for (const { day, data } of overflow) {
        await setDoc(doc(db, 'schedule', nextWeekId), { days: { [day]: data } }, { merge: true });
      }
    }

    setShiftDaysModal(null);
    setSickDayShiftOffer(null);
    setShiftOverflowDialog(null);
    showToast(`Schedule shifted forward ${numDays} day${numDays !== 1 ? 's' : ''}.`);
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  // ── Main render ────────────────────────────────────────────────────────────────
  if (authState === 'loading') return <LoadingScreen />;
  if (authState === 'unauthenticated') return <LoginScreen />;
  if (authState === 'denied') return <AccessDeniedScreen user={currentUser} />;

  const totalDays = (compliance.baseDays || 0) + (compliance.daysCompleted || 0);
  const totalHours = (compliance.baseHours || 0) + (compliance.hoursLogged || 0);
  const dayPct = Math.min(100, (totalDays / 175) * 100);
  const hourPct = Math.min(100, (totalHours / 1025) * 100);
  const subviewTitles = { attendance:'Attendance Calendar', portfolios:'Student Portfolios', memorywork:'Memory Work', compliance:'ND Compliance', settings:'Settings' };

  const contextValue = {
    currentUser, authState,
    activeTab, setActiveTab, sideMenuOpen, setSideMenuOpen, sideMenuView, setSideMenuView,
    weekOffset, setWeekOffset, viewDayOverride, setViewDayOverride, specificDate, setSpecificDate,
    todayLog, schoolDayStarted,
    lessonChecks, setLessonChecks, lessonNotes, setLessonNotes,
    hoursLogged, setHoursLogged, dayNotes, setDayNotes,
    extraSubjects, setExtraSubjects, extraDetails, setExtraDetails,
    showFinalizePanel, setShowFinalizePanel, resolutions,
    newCustomSubject, setNewCustomSubject,
    viewedDayLog, viewedLessonChecks, setViewedLessonChecks,
    viewedHoursLogged, setViewedHoursLogged, viewedDayNotes, setViewedDayNotes,
    weekSchedule, compliance, appSettings, allLogs,
    weekReport, generatingReport, weekNotes, setWeekNotes, expandedDays, setExpandedDays,
    editingLesson, setEditingLesson,
    archiveList, chatLogs, expandedArchive, setExpandedArchive, expandedChatLogs, setExpandedChatLogs,
    memoryWorkItems, memFilter, setMemFilter, showMemForm, setShowMemForm,
    newMemItem, setNewMemItem, expandedMemItems, setExpandedMemItems, editMemItem, setEditMemItem,
    portTab, setPortTab,
    settingsForm, setSettingsForm,
    calMonthIdx, setCalMonthIdx, calPopup, setCalPopup,
    newWeekModal, setNewWeekModal, confirmDialog, setConfirmDialog,
    setupWizardOpen, setSetupWizardOpen, setupWizardStep, setSetupWizardStep,
    wizardData, setWizardData, calImporting, setCalImporting,
    calImportResult, setCalImportResult, calInputMode, setCalInputMode,
    calChatMessages, setCalChatMessages, calChatInput, setCalChatInput, calChatLoading,
    chatEndRef, chatFileInputRef, fileInputRef, calChatEndRef, calFileInputRef,
    chatOpen, setChatOpen, chatMessages, setChatMessages, chatInput, setChatInput,
    chatLoading, chatUnread, setChatUnread, pendingImages, setPendingImages,
    todayId, weekId, dayOfWeek, totalDays, totalHours,
    saveLessonCheck, saveLessonNote, saveHoursLogged, saveDayNotes,
    saveExtraSubject, saveExtraDetailFull,
    startSchoolDay, finalizeDay, handleFinalizeClick, getIncompleteLessons, resolveLesson, canFinalize,
    saveMemoryItem, saveSettings, deleteArchiveEntry, saveToArchive,
    resetWeekSchedule, clearTodayLog, saveWeekNotes,
    handleApplyFromChat, sendChatMessage, generateWeekReport,
    downloadPDF, archiveAsHTML, applyScheduleDialog, generateNDReport,
    parseCalendarWithAI, saveWizardData, sendCalendarMessage, extractFileContent,
    shiftDaysModal, setShiftDaysModal,
    shiftOverflowDialog, setShiftOverflowDialog,
    sickDayShiftOffer, setSickDayShiftOffer,
    shiftSchedule,
    showToast,
  };

  return (
    <PlannerContext.Provider value={contextValue}>
      <div className="pw">
        <style>{styles}</style>

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

        <main className="p-main">
          <div style={{marginBottom:'0.5rem'}}><a href="/" className="p-home-link">← Home</a></div>
          {activeTab === 'today' && <TodayView />}
          {activeTab === 'week' && <WeekView />}
          {activeTab === 'history' && <HistoryView />}
        </main>

        {sideMenuOpen && <div className="p-overlay" onClick={() => setSideMenuOpen(false)} />}
        <aside className={`p-sidemenu${sideMenuOpen?' open':''}`}>
          <div className="p-sidemenu-header">
            <span className="p-sidemenu-title">Iron &amp; Light</span>
            <button className="p-sidemenu-close" onClick={() => setSideMenuOpen(false)}>✕</button>
          </div>
          <nav className="p-sidemenu-nav">
            {[['attendance','📅','Attendance Calendar'],['portfolios','📖','Student Portfolios'],['memorywork','✝','Memory Work'],['compliance','📊','ND Compliance'],['settings','⚙','Settings']].map(([view,icon,label]) => (
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

        {sideMenuView && (
          <div className="p-subview">
            <div className="p-subview-header">
              <button className="p-subview-back" onClick={() => setSideMenuView(null)}>← Back</button>
              <h2>{subviewTitles[sideMenuView]}</h2>
            </div>
            <div className="p-subview-body">
              {sideMenuView === 'attendance' && <AttendanceCalendar />}
              {sideMenuView === 'portfolios' && <PortfoliosView />}
              {sideMenuView === 'memorywork' && <MemoryWorkView />}
              {sideMenuView === 'compliance' && <NDComplianceView />}
              {sideMenuView === 'settings' && <SettingsView />}
            </div>
          </div>
        )}

        {!chatOpen && (
          <div className="p-chat-tab" style={{bottom:'calc(56px + env(safe-area-inset-bottom, 0px))'}} onClick={() => { setChatOpen(true); setChatUnread(false); }}>
            <span className="p-chat-tab-label">AI Assistant ✦{chatUnread && <span className="p-chat-unread-dot" />}</span>
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
                <p style={{color:'#9ca3af',fontSize:'0.82rem',textAlign:'center',marginTop:'1rem'}}>Ask me about schedules, lessons, compliance, or anything else!</p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`p-chat-msg ${msg.role}`}>
                  <div className="p-chat-bubble">
                    {msg.role === 'assistant' ? renderChatBubble(msg.text, () => handleApplyFromChat(msg.text)) : msg.text}
                  </div>
                  <span className="p-chat-ts">{formatTime(msg.timestamp)}</span>
                </div>
              ))}
              {chatLoading && (
                <div className="p-chat-msg assistant"><div className="p-chat-bubble"><div className="p-dot-spin"><span/><span/><span/></div></div></div>
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
              <input ref={chatFileInputRef} type="file" style={{display:'none'}}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = '';
                  const content = await extractFileContent(file);
                  if (content.type === 'image') {
                    setPendingImages(p => [...p, { base64: content.base64, type: content.mimeType }]);
                  } else {
                    setChatInput(prev => `[Attached: ${file.name}]\n${content.text.slice(0, 6000)}\n\n` + prev);
                  }
                }}
              />
              <button title="Attach file or photo"
                style={{background:'none',border:'1.5px solid rgba(255,255,255,0.25)',borderRadius:8,padding:'0.4rem 0.55rem',cursor:'pointer',fontSize:'1.1rem',minHeight:40,flexShrink:0,color:'white'}}
                onClick={() => chatFileInputRef.current?.click()} disabled={chatLoading}>📎</button>
              <textarea placeholder="Ask anything…" value={chatInput} rows={1}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); } }}
              />
              <button className="p-btn p-btn-primary p-btn-sm" onClick={() => sendChatMessage(chatInput)} disabled={chatLoading || !chatInput.trim()}>Send</button>
            </div>
          </div>
        )}

        <nav style={{position:'fixed',bottom:0,left:0,right:0,zIndex:100,background:'var(--bg-card)',borderTop:'1px solid var(--border)',display:'flex',padding:'0.5rem 0 env(safe-area-inset-bottom,0)'}}>
          {[['today','TODAY','📅'],['week','WEEK','📋'],['history','HISTORY','📊']].map(([id,label,icon]) => (
            <button key={id} onClick={() => { setActiveTab(id); setSpecificDate(null); }}
              style={{flex:1,border:'none',background:'none',padding:'0.4rem 0.5rem',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:'0.1rem',minHeight:44,fontFamily:"'Lexend',sans-serif",fontSize:'0.7rem',fontWeight:600,letterSpacing:'0.05em',color:activeTab===id?'var(--forest)':'var(--text-muted)',transition:'color 0.15s'}}>
              <span style={{fontSize:'1.1rem'}}>{icon}</span>
              <span>{label}</span>
              {activeTab === id && <span style={{width:4,height:4,borderRadius:'50%',background:'var(--forest)',marginTop:1}} />}
            </button>
          ))}
        </nav>

        <ConfirmDialog />
        <NewWeekModal />
        <SetupWizard />
        <ShiftDaysModal />
        <ShiftOverflowDialog />
        <SickDayShiftOffer />
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </div>
    </PlannerContext.Provider>
  );
}
