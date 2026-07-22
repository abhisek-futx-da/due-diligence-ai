# DueDiligence AI

AI due-diligence assistant for investors.

Part of the [VC Intelligence App Suite](../README.md). Vanilla HTML/CSS/JS, no build step.

## Features
- Upload pitch decks / financial docs (PDF & TXT) — text extracted client-side via PDF.js.
- Automatic extraction of structured metrics (revenue, burn rate, runway, team, TAM).
- Document-grounded Q&A that answers only from the uploaded content.
- Side-by-side comparison of two companies’ metrics.

## Run
```bash
# from the repo root
python3 -m http.server 8000
# open http://localhost:8000/due-diligence-ai/
```

## AI features (optional)
The AI features use the [Groq API](https://console.groq.com). Click **API Key** in the app
and paste your own key — it is stored only in your browser's `localStorage` and never sent
anywhere except Groq. No key is required to browse the app.

## Security
All dynamic content is escaped before rendering (`escapeHtml`), a Content-Security-Policy is
set in the page `<head>`, and the app runs in strict mode.
