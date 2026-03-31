# TE Question Extractor
### Iron & Light Johnson Academy

> Faith · Knowledge · Strength

A static web app for extracting teacher questions and vocabulary from BJU Press Teacher Edition PDFs.

---

## What It Does

Upload a Teacher Edition PDF, enter lesson numbers, and receive a beautifully formatted printable HTML file containing:

- All teacher questions (lines ending in `?`), grouped by TE page
- Vocabulary words (New and Review), displayed as pills
- A cover page with a summary table
- Print-ready layout with proper page breaks

---

## Setup

### 1. Enable GitHub Pages

1. Go to your repository **Settings → Pages**
2. Under **Source**, select `Deploy from a branch`
3. Choose `main` branch, `/ (root)` folder
4. Click **Save**

Your app will be live at: `https://<username>.github.io/<repo-name>/`

### 2. Get an Anthropic API Key

1. Sign in at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** and create a new key
3. Copy the key — you'll paste it into the app each session

> **Security note:** The API key is entered directly in the browser and used only for the API call. It is never stored, never sent to any server other than `api.anthropic.com`, and is cleared when you close the tab.

---

## Usage

1. Open the app in your browser
2. Click the **Extract Questions** tab (it's the default)
3. Enter the lesson numbers you want (e.g. `14, 15, 16` or `14-19 skip 17`)
4. Paste your Anthropic API key
5. Upload the Teacher Edition PDF (or a calendar screenshot for Day-to-Lesson mapping)
6. Click **Extract Questions**
7. When complete, use **Download HTML**, **Preview**, or **Print**

### Other Tabs

- **Copy Prompt** — Master prompt to use with Claude directly in a chat session (three-step workflow)
- **QC Prompt** — Quality control prompt to verify extracted HTML files
- **Session Log** — All extractions performed during the current browser session

---

## File Structure

```
/
├── index.html      # App shell and markup
├── style.css       # All styles (Lora font, green palette)
├── app.js          # Logic: file reading, API calls, UI
├── .nojekyll       # Prevents GitHub Pages from running Jekyll
└── README.md       # This file
```

No build step, no dependencies, no server required.

---

## Tech Stack

- Pure HTML / CSS / JavaScript
- [Lora](https://fonts.google.com/specimen/Lora) (Google Fonts)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages) — `claude-sonnet-4-20250514`
- GitHub Pages (static hosting)

---

## Curriculum Context

- **Curriculum:** BJU Press Reading 3A
- **TE Length:** 229 pages, Lessons 1–37
- **Calendar mapping:** Day number on calendar = Lesson number
