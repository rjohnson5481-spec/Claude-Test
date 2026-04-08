// ─── File Processing Helpers ───────────────────────────────────────────────────

export async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return window.pdfjsLib;
}

// Returns { type: 'image', base64, mimeType } for images, or { type: 'text', text } for everything else
export async function extractFileContent(file) {
  const name = file.name.toLowerCase();
  const mime = file.type || '';
  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(name);
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');

  if (isImage) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        const base64 = dataUrl.split(',')[1];
        res({ type: 'image', base64, mimeType: mime || 'image/jpeg' });
      };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  }

  if (isPdf) {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return { type: 'text', text };
  }

  // HTML, ICS, CSV, TXT, or any other text-based file
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      const raw = e.target.result;
      let text = raw;
      if (/<html|<body|<div|<table/i.test(raw)) {
        const tmp = document.createElement('div');
        const cleaned = raw
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        tmp.innerHTML = cleaned;
        text = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
      }
      res({ type: 'text', text });
    };
    reader.onerror = rej;
    reader.readAsText(file);
  });
}
