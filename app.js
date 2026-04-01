/* ============================================================
   Iron & Light Johnson Academy — TE Question Extractor
   app.js
   ============================================================ */

'use strict';

// ── State ────────────────────────────────────────────────────
const state = {
  selectedFile: null,
  lastResult:   null,   // { html, lessons, filename, timestamp }
  sessionLog:   [],
};

// ── DOM Refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  // Nav
  navBtns:          document.querySelectorAll('.nav-btn'),
  tabPanels:        document.querySelectorAll('.tab-panel'),
  logBadge:         $('logBadge'),

  // Extract form
  extractForm:      $('extractForm'),
  lessonNumbers:    $('lessonNumbers'),
  apiKey:           $('apiKey'),
  toggleApiKey:     $('toggleApiKey'),
  fileUpload:       $('fileUpload'),
  fileDropZone:     $('fileDropZone'),
  fileDropContent:  $('fileDropContent'),
  extractBtn:       $('extractBtn'),
  errorBox:         $('errorBox'),
  errorText:        $('errorText'),

  // Results
  resultsCard:      $('resultsCard'),
  resultsLabel:     $('resultsLabel'),
  downloadBtn:      $('downloadBtn'),
  previewBtn:       $('previewBtn'),
  printBtn:         $('printBtn'),
  previewContainer: $('previewContainer'),
  previewFrame:     $('previewFrame'),

  // Prompt tabs
  masterPromptText: $('masterPromptText'),
  copyMasterPrompt: $('copyMasterPrompt'),
  qcPromptText:     $('qcPromptText'),
  copyQcPrompt:     $('copyQcPrompt'),

  // Session log
  logEmpty:         $('logEmpty'),
  logList:          $('logList'),

  // PDF splitter
  splitSection:     $('splitSection'),
  splitPageRange:   $('splitPageRange'),
  splitBtn:         $('splitBtn'),
  splitStatus:      $('splitStatus'),
};

// ── Tab Navigation ───────────────────────────────────────────
dom.navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    dom.navBtns.forEach(b => b.classList.remove('active'));
    dom.tabPanels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const panel = document.getElementById(`tab-${target}`);
    if (panel) panel.classList.add('active');
  });
});

// ── API Key visibility toggle ────────────────────────────────
dom.toggleApiKey.addEventListener('click', () => {
  const isPassword = dom.apiKey.type === 'password';
  dom.apiKey.type = isPassword ? 'text' : 'password';
  dom.toggleApiKey.setAttribute('aria-label', isPassword ? 'Hide API key' : 'Show API key');
});

// ── File Upload & Drag-Drop ──────────────────────────────────
dom.fileUpload.addEventListener('change', e => {
  const file = e.target.files[0] || null;
  handleFileSelected(file);
});

dom.fileDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dom.fileDropZone.classList.add('drag-over');
});

dom.fileDropZone.addEventListener('dragleave', () => {
  dom.fileDropZone.classList.remove('drag-over');
});

dom.fileDropZone.addEventListener('drop', e => {
  e.preventDefault();
  dom.fileDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0] || null;
  if (file) {
    handleFileSelected(file);
    // Sync with the input element so the form knows
    const dt = new DataTransfer();
    dt.items.add(file);
    dom.fileUpload.files = dt.files;
  }
});

// 20 MB raw ≈ 27 MB base64 — well within Anthropic's 32 MB document limit
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function handleFileSelected(file) {
  state.selectedFile = file;
  if (!file) {
    resetFileDropZone();
    hideError();
    checkFormReady();
    return;
  }

  const tooBig = file.size > MAX_FILE_BYTES;

  dom.fileDropZone.classList.toggle('has-file', !tooBig);
  dom.fileDropZone.classList.toggle('too-big', tooBig);

  // Show or hide the PDF splitter panel
  $('splitSection').style.display = (tooBig && file.type === 'application/pdf') ? 'block' : 'none';
  hideSplitStatus();

  dom.fileDropContent.innerHTML = tooBig ? `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32" style="color:#d97706">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <span class="file-drop-label" style="color:#92400e">${escHtml(file.name)}</span>
    <span class="file-drop-hint" style="color:#92400e">${formatBytes(file.size)} — too large for the API. Use the trimmer below.</span>
    <button type="button" class="btn btn-outline btn-sm" id="clearFileBtn" style="margin-top:8px;z-index:2;position:relative;border-color:#fbbf24;color:#92400e">
      Remove file
    </button>
  ` : `
    <div class="file-name-display">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        ${file.type === 'application/pdf'
          ? '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'
          : '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'}
      </svg>
      <span>${escHtml(file.name)}</span>
    </div>
    <span class="file-size-display">${formatBytes(file.size)}</span>
    <button type="button" class="btn btn-outline btn-sm" id="clearFileBtn" style="margin-top:6px;z-index:2;position:relative">
      Remove file
    </button>
  `;

  // The remove button must prevent click from bubbling to the file input
  const clearBtn = document.getElementById('clearFileBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      dom.fileUpload.value = '';
      handleFileSelected(null);
    });
  }

  checkFormReady();
}

function resetFileDropZone() {
  state.selectedFile = null;
  dom.fileDropZone.classList.remove('has-file', 'drag-over');
  dom.fileDropContent.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <span class="file-drop-label">Drop file here or <span class="file-drop-link">browse</span></span>
    <span class="file-drop-hint">PDF up to 32 MB</span>
  `;
}

// ── Form Readiness Check ─────────────────────────────────────
function checkFormReady() {
  const ready =
    dom.lessonNumbers.value.trim() !== '' &&
    dom.apiKey.value.trim() !== '' &&
    state.selectedFile !== null &&
    state.selectedFile.size <= MAX_FILE_BYTES;
  dom.extractBtn.disabled = !ready;
}

dom.lessonNumbers.addEventListener('input', checkFormReady);
dom.apiKey.addEventListener('input', checkFormReady);

// ── Extract Form Submission ──────────────────────────────────
dom.extractForm.addEventListener('submit', async e => {
  e.preventDefault();
  await runExtraction();
});

async function runExtraction() {
  hideError();
  setExtracting(true);
  hideResults();

  const lessons = dom.lessonNumbers.value.trim();
  const apiKey  = dom.apiKey.value.trim();
  const file    = state.selectedFile;

  try {
    // 1. Read file as base64
    const { base64, mediaType } = await readFileAsBase64(file);

    // 2. Call Claude API
    const html = await callClaudeAPI({ apiKey, base64, mediaType, lessons, fileName: file.name });

    // 3. Validate response
    if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
      throw new Error('The response did not contain a valid HTML document. Please try again.');
    }

    // 4. Store result
    const filename  = `lessons_${sanitizeFilename(lessons)}_questions.html`;
    const timestamp = new Date();
    state.lastResult = { html, lessons, filename, timestamp };

    // 5. Log to session
    addToSessionLog({ lessons, filename, timestamp, html, fileUsed: file.name });

    // 6. Show results
    showResults(lessons);

  } catch (err) {
    showError(err.message || 'An unexpected error occurred.');
  } finally {
    setExtracting(false);
  }
}

// ── Claude API Call ──────────────────────────────────────────
async function callClaudeAPI({ apiKey, base64, mediaType, lessons, fileName }) {
  const systemPrompt = `You are a teacher question extraction assistant for Teacher Edition PDFs at Iron & Light Johnson Academy.

Given a Teacher Edition PDF and lesson numbers:

STEP 1 — Scan the PDF programmatically to find the page range for each requested lesson. Look for "LESSON [n]" printed at the top of TE pages. If given a calendar image instead, read Day numbers directly — Day number equals Lesson number.

STEP 2 — For each lesson extract:
QUESTIONS: Only lines ending in ? Copied exactly. No answers, directions, or commentary. Grouped by TE page with TE page number, student page number, and section heading noted.
VOCABULARY: Words listed under "New" or "Review" labels. Words only, no definitions. Note New vs Review.

STEP 3 — Return a complete, self-contained HTML file with:
- Lora font (Google Fonts)
- Logo img src="https://i.imgur.com/9JfGi6d.jpeg" 150px on cover, 32px in footer, onerror hide
- School name: Iron & Light Johnson Academy | Tagline: Faith · Knowledge · Strength
- Sticky print bar (hidden on print): school name left, Print button right
- Cover page: logo, school name, tagline, curriculum info, summary table (Lesson / Story / Student Pages / TE Pages / Questions / Vocabulary count). Page break after.
- Per lesson: dark green banner (#2d5a3d) with lesson number and story title, meta strip (#f3f8f5) with page info, vocabulary pills (New=filled #2d5a3d white text, Review=outlined #3d7a52 green text), questions grouped by TE page with green TE badge and outlined student page badge, numbered list with green counters
- Page break after each lesson
- Print CSS: @page { margin: 1.5cm 2cm; size: letter; } with print-color-adjust: exact

Return ONLY the complete HTML. No markdown fences. No explanation.`;

  const userMessage = `Extract all teacher questions and vocabulary for lessons: ${lessons}\n\nFile: ${fileName}`;

  // Determine content block type
  const isPDF = mediaType === 'application/pdf';
  const sourceBlock = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } };

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          sourceBlock,
          { type: 'text', text: userMessage },
        ],
      },
    ],
  });

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':            'application/json',
        'x-api-key':               apiKey,
        'anthropic-version':       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body,
    });
  } catch (networkErr) {
    throw new Error(`Network error — could not reach the Anthropic API. Check your internet connection. (${networkErr.message})`);
  }

  if (!response.ok) {
    let errMsg = `API error ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.error?.message) errMsg = errData.error.message;
    } catch (_) {}

    if (response.status === 401) throw new Error('Invalid API key. Please check your Anthropic API key and try again.');
    if (response.status === 429) throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    if (response.status === 413) throw new Error('File is too large for the API. Please try a smaller file or a specific page range.');
    throw new Error(`API error: ${errMsg}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text || '';

  if (!text) throw new Error('The API returned an empty response. Please try again.');

  // Strip any accidental markdown fences
  return stripMarkdownFences(text);
}

// ── File Reader Helper ───────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;           // data:[mime];base64,[data]
      const commaIdx = dataUrl.indexOf(',');
      const base64 = dataUrl.slice(commaIdx + 1);
      const mediaType = file.type || detectMediaType(file.name);
      resolve({ base64, mediaType });
    };
    reader.onerror = () => reject(new Error('Could not read the file. Please try again.'));
    reader.readAsDataURL(file);
  });
}

function detectMediaType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  return map[ext] || 'application/octet-stream';
}

// ── UI State Helpers ─────────────────────────────────────────
function setExtracting(on) {
  dom.extractBtn.disabled = on;
  dom.extractBtn.querySelector('.btn-text').style.display    = on ? 'none'   : '';
  dom.extractBtn.querySelector('.btn-spinner').style.display = on ? 'inline-flex' : 'none';
}

function showError(msg) {
  dom.errorText.textContent = msg;
  dom.errorBox.style.display = 'flex';
}

function hideError() {
  dom.errorBox.style.display = 'none';
}

function showResults(lessons) {
  dom.resultsLabel.textContent = `Lessons ${lessons}`;
  dom.resultsCard.style.display = 'block';
  dom.previewContainer.style.display = 'none';
  dom.resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResults() {
  dom.resultsCard.style.display = 'none';
}

// ── Result Actions ───────────────────────────────────────────
dom.downloadBtn.addEventListener('click', () => {
  if (!state.lastResult) return;
  const { html, filename } = state.lastResult;
  triggerDownload(html, filename);
});

dom.previewBtn.addEventListener('click', () => {
  if (!state.lastResult) return;
  const isVisible = dom.previewContainer.style.display !== 'none';
  if (isVisible) {
    dom.previewContainer.style.display = 'none';
    dom.previewBtn.textContent = 'Preview';
    return;
  }
  // Write into iframe srcdoc
  dom.previewFrame.srcdoc = state.lastResult.html;
  dom.previewContainer.style.display = 'block';

  // Update button text
  dom.previewBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
    Hide Preview`;
});

dom.printBtn.addEventListener('click', () => {
  if (!state.lastResult) return;
  const { html } = state.lastResult;
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up was blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Wait for content to load before printing
  win.onload = () => win.print();
  // Fallback
  setTimeout(() => { try { win.print(); } catch(_) {} }, 800);
});

// ── Copy Prompt Buttons ──────────────────────────────────────
dom.copyMasterPrompt.addEventListener('click', () => {
  copyText(dom.masterPromptText.textContent, dom.copyMasterPrompt);
});

dom.copyQcPrompt.addEventListener('click', () => {
  copyText(dom.qcPromptText.textContent, dom.copyQcPrompt);
});

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  // Visual feedback
  const original = btn.innerHTML;
  btn.classList.add('copied');
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = original;
  }, 2000);
}

// ── Session Log ──────────────────────────────────────────────
function addToSessionLog({ lessons, filename, timestamp, html, fileUsed }) {
  const entry = { lessons, filename, timestamp, html, fileUsed };
  state.sessionLog.unshift(entry); // newest first

  // Update badge
  dom.logBadge.textContent = state.sessionLog.length;
  dom.logBadge.style.display = 'inline';

  renderSessionLog();
}

function renderSessionLog() {
  if (state.sessionLog.length === 0) {
    dom.logEmpty.style.display = 'flex';
    dom.logList.style.display  = 'none';
    return;
  }

  dom.logEmpty.style.display = 'none';
  dom.logList.style.display  = 'flex';

  dom.logList.innerHTML = state.sessionLog.map((entry, idx) => `
    <div class="log-entry">
      <div class="log-entry-header">
        <span class="log-entry-lessons">Lessons: ${escHtml(entry.lessons)}</span>
        <span class="log-entry-time">${formatTime(entry.timestamp)}</span>
      </div>
      <div class="log-entry-file">File used: ${escHtml(entry.fileUsed)}</div>
      <div class="log-entry-actions">
        <button class="btn btn-primary btn-sm" onclick="logDownload(${idx})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
        <button class="btn btn-outline btn-sm" onclick="logPrint(${idx})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print
        </button>
      </div>
    </div>
  `).join('');
}

// Exposed to onclick handlers in log HTML
window.logDownload = function(idx) {
  const entry = state.sessionLog[idx];
  if (entry) triggerDownload(entry.html, entry.filename);
};

window.logPrint = function(idx) {
  const entry = state.sessionLog[idx];
  if (!entry) return;
  const win = window.open('', '_blank');
  if (!win) { alert('Pop-up was blocked. Please allow pop-ups for this site and try again.'); return; }
  win.document.open();
  win.document.write(entry.html);
  win.document.close();
  win.onload = () => win.print();
  setTimeout(() => { try { win.print(); } catch(_) {} }, 800);
};

// ── Utilities ────────────────────────────────────────────────
function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9_\-]/gi, '_').replace(/_+/g, '_').slice(0, 60);
}

function stripMarkdownFences(text) {
  // Remove ```html ... ``` or ``` ... ``` wrappers if present
  return text.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

// ── PDF Splitter ─────────────────────────────────────────────

dom.splitBtn.addEventListener('click', async () => {
  const rangeStr = dom.splitPageRange.value.trim();
  if (!rangeStr) {
    showSplitStatus('error', 'Please enter a page range first (e.g. 45-55).');
    return;
  }
  if (!state.selectedFile) return;

  setSplitting(true);
  hideSplitStatus();

  try {
    const pdfLib  = await loadPdfLib();
    const pages   = parsePageRange(rangeStr);

    if (pages.length === 0) {
      throw new Error('Could not parse that page range. Try a format like "45-55" or "45, 47, 50-60".');
    }

    const arrayBuffer = await state.selectedFile.arrayBuffer();
    const srcDoc      = await pdfLib.PDFDocument.load(arrayBuffer);
    const totalPages  = srcDoc.getPageCount();

    // Validate all page numbers
    const invalid = pages.filter(p => p < 1 || p > totalPages);
    if (invalid.length > 0) {
      throw new Error(`Page ${invalid[0]} is out of range. This PDF has ${totalPages} pages.`);
    }

    // Build new PDF with only the requested pages (pdf-lib uses 0-based index)
    const newDoc       = await pdfLib.PDFDocument.create();
    const zeroIndexed  = pages.map(p => p - 1);
    const copiedPages  = await newDoc.copyPages(srcDoc, zeroIndexed);
    copiedPages.forEach(p => newDoc.addPage(p));

    const pdfBytes = await newDoc.save();
    const baseName = state.selectedFile.name.replace(/\.pdf$/i, '');
    const newName  = `${baseName}_pages_${rangeStr.replace(/\s/g, '')}.pdf`;
    const newFile  = new File([pdfBytes], newName, { type: 'application/pdf' });

    // Auto-load into uploader
    handleFileSelected(newFile);

    showSplitStatus('success',
      `Done — ${pages.length} page${pages.length !== 1 ? 's' : ''} extracted (${formatBytes(newFile.size)}). Loaded automatically.`
    );

    // Clear the range input for next use
    dom.splitPageRange.value = '';

  } catch (err) {
    showSplitStatus('error', err.message || 'Could not split the PDF. Please try again.');
  } finally {
    setSplitting(false);
  }
});

// Allow Enter key in the page range input to trigger split
dom.splitPageRange.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); dom.splitBtn.click(); }
});

function setSplitting(on) {
  dom.splitBtn.disabled = on;
  dom.splitBtn.querySelector('.split-btn-text').style.display    = on ? 'none' : '';
  dom.splitBtn.querySelector('.split-btn-spinner').style.display = on ? 'inline-flex' : 'none';
}

function showSplitStatus(type, msg) {
  dom.splitStatus.className = `split-status ${type}`;
  dom.splitStatus.innerHTML = type === 'success'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg> ${escHtml(msg)}`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${escHtml(msg)}`;
  dom.splitStatus.style.display = 'flex';
}

function hideSplitStatus() {
  dom.splitStatus.style.display = 'none';
}

/**
 * Lazy-load pdf-lib from CDN on first use.
 * Returns the PDFLib namespace object.
 */
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return new Promise((resolve, reject) => {
    const script  = document.createElement('script');
    script.src    = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    script.onload = () => {
      if (window.PDFLib) resolve(window.PDFLib);
      else reject(new Error('pdf-lib loaded but PDFLib global not found.'));
    };
    script.onerror = () => reject(new Error('Could not load the PDF library. Check your internet connection.'));
    document.head.appendChild(script);
  });
}

/**
 * Parse a page range string into a sorted, deduplicated array of 1-based page numbers.
 * Supports: "45-52", "45, 46, 47", "45-52, 60, 62-65"
 */
function parsePageRange(str) {
  const pages = new Set();
  const parts = str.split(/[,;]+/);

  for (const part of parts) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end   = parseInt(rangeMatch[2], 10);
      if (start <= end) {
        for (let i = start; i <= end; i++) pages.add(i);
      }
    } else if (/^\d+$/.test(trimmed)) {
      pages.add(parseInt(trimmed, 10));
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}
