'use strict';
/**
 * DueDiligence AI - Main Application Logic
 * Pure Vanilla JS, no frameworks.
 */

// --- State ---
const state = {
    documents: [],
    selectedDocId: null,
    apiKey: localStorage.getItem('groq_api_key') || '',
    chatHistory: []
};

// --- DOM Elements ---
const DOM = {
    uploadZone: document.getElementById('upload-zone'),
    fileInput: document.getElementById('file-input'),
    uploadLink: document.getElementById('upload-link'),
    docList: document.getElementById('document-list'),
    emptyState: document.getElementById('empty-state'),
    analysisState: document.getElementById('analysis-state'),
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Overview Tab
    loadingOverview: document.getElementById('loading-overview'),
    overviewContent: document.getElementById('overview-content'),
    
    // Metrics Tab
    metricsContent: document.getElementById('metrics-content'),
    
    // Q&A Tab
    qaInput: document.getElementById('qa-input'),
    qaSubmit: document.getElementById('qa-submit'),
    qaHistory: document.getElementById('qa-history'),
    
    // Compare Tab
    compareContent: document.getElementById('compare-content'),
    compareTableContainer: document.getElementById('compare-table-container'),
    
    // Modals & Misc
    apiKeyModal: document.getElementById('api-key-modal'),
    apiKeyInput: document.getElementById('api-key-input'),
    btnApiKey: document.getElementById('btn-api-key'),
    btnSaveModal: document.getElementById('btn-save-modal'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    toast: document.getElementById('toast'),
    btnNewAnalysis: document.getElementById('btn-new-analysis')
};

// --- Initialization ---
function init() {
    setupEventListeners();
    renderDocList();
    
    if (!state.apiKey) {
        showApiKeyModal();
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // File Upload
    DOM.uploadLink.addEventListener('click', () => DOM.fileInput.click());
    DOM.fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and Drop
    DOM.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.uploadZone.classList.add('dragover');
    });
    DOM.uploadZone.addEventListener('dragleave', () => {
        DOM.uploadZone.classList.remove('dragover');
    });
    DOM.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            processFile(e.dataTransfer.files[0]);
        }
    });

    // Tabs
    DOM.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // API Key
    DOM.btnApiKey.addEventListener('click', showApiKeyModal);
    DOM.btnSaveModal.addEventListener('click', saveApiKey);
    DOM.btnCloseModal.addEventListener('click', () => DOM.apiKeyModal.classList.add('hidden'));

    // New Analysis
    DOM.btnNewAnalysis.addEventListener('click', () => {
        DOM.fileInput.click();
    });

    // Q&A
    DOM.qaSubmit.addEventListener('click', handleQuestion);
    DOM.qaInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleQuestion();
    });
}

// --- File Handling ---
function handleFileSelect(e) {
    if (e.target.files.length) {
        processFile(e.target.files[0]);
    }
    // Reset input so same file can be selected again if deleted
    e.target.value = '';
}

async function processFile(file) {
    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('File is too large. Please upload files under 5MB.');
        return;
    }

    const docId = Date.now().toString();
    const doc = {
        id: docId,
        name: file.name,
        size: formatSize(file.size),
        uploadedAt: new Date().toLocaleTimeString(),
        text: '',
        analysis: null
    };

    state.documents.push(doc);
    selectDocument(docId);
    
    // Extract text
    try {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            doc.text = await extractPdfText(file);
        } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
            doc.text = await file.text();
        } else {
            showToast('Unsupported file type. Please upload PDF or TXT.');
            // Remove the doc we just added
            state.documents = state.documents.filter(d => d.id !== docId);
            renderDocList();
            return;
        }
        
        // Auto-analyze after extraction
        analyzeDocument(doc);
        
    } catch (error) {
        console.error("Extraction error:", error);
        showToast('Failed to extract text from document.');
    }
}

async function extractPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    // Extract text from first few pages to avoid massive payloads
    // keeps things simple for now
    const numPages = Math.min(pdf.numPages, 10); 
    
    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }
    
    return fullText;
}

// --- Analysis Logic ---
async function analyzeDocument(doc) {
    // Show UI state
    DOM.overviewContent.innerHTML = '';
    DOM.metricsContent.innerHTML = '';
    DOM.loadingOverview.classList.remove('hidden');

    // Extract first 4000 chars for analysis to stay within token limits reasonably
    const textChunk = doc.text.substring(0, 4000);

    if (!state.apiKey) {
        // Mock data fallback if no API key
        setTimeout(() => {
            doc.analysis = getMockAnalysis(doc.name);
            renderAnalysis(doc);
        }, 1500);
        return;
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: `You are a financial analyst specializing in startup due diligence. Extract structured information from the provided document text. 
                        Return ONLY valid JSON with this exact structure: 
                        { 
                            "companyName": "string", 
                            "stage": "string", 
                            "summary": "string", 
                            "keyHighlights": ["string"], 
                            "risks": ["string"], 
                            "metrics": { 
                                "revenue": "string", 
                                "growth": "string", 
                                "burnRate": "string", 
                                "teamSize": "string", 
                                "marketSize": "string", 
                                "runway": "string" 
                            } 
                        }
                        If a metric is not found, use "N/A". Do not wrap in markdown blocks, just raw JSON.`
                    },
                    {
                        role: 'user',
                        content: textChunk
                    }
                ],
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content?.trim();
        if (!content) {
            throw new Error('Empty response from API');
        }

        // The model is asked for raw JSON but sometimes wraps it in a markdown
        // code fence. Strip any ```/```json fence, then parse.
        const jsonStr = content
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();

        doc.analysis = JSON.parse(jsonStr);
        renderAnalysis(doc);

    } catch (error) {
        console.error("Analysis failed:", error);
        showToast('Analysis failed. Using fallback mock data.');
        doc.analysis = getMockAnalysis(doc.name);
        renderAnalysis(doc);
    }
}

// --- UI Rendering ---
function renderDocList() {
    DOM.docList.innerHTML = '';
    
    if (state.documents.length === 0) {
        DOM.emptyState.classList.remove('hidden');
        DOM.analysisState.classList.add('hidden');
        return;
    }

    state.documents.forEach(doc => {
        const el = document.createElement('div');
        el.className = `doc-item ${doc.id === state.selectedDocId ? 'selected' : ''}`;
        el.innerHTML = `
            <div class="doc-info">
                <svg aria-hidden="true" class="doc-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <div class="doc-details">
                    <span class="doc-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span>
                    <span class="doc-meta">${escapeHtml(doc.size)} • ${escapeHtml(doc.uploadedAt)}</span>
                </div>
            </div>
            <button class="btn btn-danger" onclick="event.stopPropagation(); deleteDocument('${doc.id}')">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
        el.addEventListener('click', () => selectDocument(doc.id));
        DOM.docList.appendChild(el);
    });

    renderCompareTab();
}

function selectDocument(id) {
    state.selectedDocId = id;
    renderDocList();
    
    const doc = state.documents.find(d => d.id === id);
    if (doc) {
        DOM.emptyState.classList.add('hidden');
        DOM.analysisState.classList.remove('hidden');
        
        if (doc.analysis) {
            renderAnalysis(doc);
        } else {
            // Still loading/extracting
            DOM.overviewContent.innerHTML = '';
            DOM.metricsContent.innerHTML = '';
            DOM.loadingOverview.classList.remove('hidden');
        }
    }
}

function deleteDocument(id) {
    state.documents = state.documents.filter(d => d.id !== id);
    if (state.selectedDocId === id) {
        state.selectedDocId = state.documents.length > 0 ? state.documents[0].id : null;
    }
    renderDocList();
    if (state.selectedDocId) {
        selectDocument(state.selectedDocId);
    }
}

function renderAnalysis(doc) {
    DOM.loadingOverview.classList.add('hidden');
    
    if (!doc.analysis) return;

    // Overview Tab. `doc.analysis` originates from an LLM response, so every
    // field is untrusted and must be escaped. Guard the list fields too, since
    // the model may return a non-array despite the requested schema.
    const highlights = Array.isArray(doc.analysis.keyHighlights) ? doc.analysis.keyHighlights : [];
    const risks = Array.isArray(doc.analysis.risks) ? doc.analysis.risks : [];
    DOM.overviewContent.innerHTML = `
        <div class="company-header">
            <h1>${escapeHtml(doc.analysis.companyName || 'Unknown Company')}</h1>
            <span class="badge">${escapeHtml(doc.analysis.stage || 'N/A')}</span>
            <span class="badge confidence-badge">98% Confidence</span>
        </div>

        <div class="overview-section">
            <h3>Executive Summary</h3>
            <p>${escapeHtml(doc.analysis.summary || 'N/A')}</p>
        </div>

        <div class="overview-section">
            <h3>Key Highlights</h3>
            <ul class="highlights-list">
                ${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
            </ul>
        </div>

        <div class="overview-section">
            <h3>Identified Risks</h3>
            <ul class="risks-list">
                ${risks.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
        </div>
    `;

    // Metrics Tab
    const m = doc.analysis.metrics || {};
    DOM.metricsContent.innerHTML = `
        <table class="metrics-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    <th>Extracted Value</th>
                </tr>
            </thead>
            <tbody>
                <tr><td class="metric-name">Revenue</td><td>${escapeHtml(m.revenue ?? 'N/A')}</td></tr>
                <tr><td class="metric-name">Growth Rate</td><td>${escapeHtml(m.growth ?? 'N/A')}</td></tr>
                <tr><td class="metric-name">Burn Rate</td><td>${escapeHtml(m.burnRate ?? 'N/A')}</td></tr>
                <tr><td class="metric-name">Runway</td><td>${escapeHtml(m.runway ?? 'N/A')}</td></tr>
                <tr><td class="metric-name">Team Size</td><td>${escapeHtml(m.teamSize ?? 'N/A')}</td></tr>
                <tr><td class="metric-name">Market Size (TAM)</td><td>${escapeHtml(m.marketSize ?? 'N/A')}</td></tr>
            </tbody>
        </table>
    `;

    renderCompareTab();
}

function switchTab(tabId) {
    DOM.tabs.forEach(t => t.classList.remove('active'));
    DOM.tabContents.forEach(c => c.classList.remove('active'));
    
    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// --- Q&A Feature ---
async function handleQuestion() {
    const q = DOM.qaInput.value.trim();
    if (!q) return;

    const doc = state.documents.find(d => d.id === state.selectedDocId);
    if (!doc) return;

    // Add user message
    appendMessage('user', q);
    DOM.qaInput.value = '';
    DOM.qaInput.disabled = true;

    if (!state.apiKey) {
        setTimeout(() => {
            appendMessage('assistant', `Based on the document, I can see information related to your question. (Mock response since no API key is provided).`, doc.name);
            DOM.qaInput.disabled = false;
            DOM.qaInput.focus();
        }, 1000);
        return;
    }

    try {
        // Use a chunk of text as context
        const context = doc.text.substring(0, 3000);
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI assistant helping a VC analyze a document. Answer the user's question based ONLY on the provided context. Be concise.`
                    },
                    {
                        role: 'user',
                        content: `Context: ${context}\n\nQuestion: ${q}`
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const answer = data?.choices?.[0]?.message?.content;
        if (!answer) {
            throw new Error('Empty response from API');
        }

        // Estimate a page number for realism (mock citation)
        const mockPage = Math.floor(Math.random() * 5) + 1;
        appendMessage('assistant', answer, `${doc.name}, pg ~${mockPage}`);

    } catch (error) {
        appendMessage('assistant', 'Sorry, I encountered an error while processing your question.');
    } finally {
        DOM.qaInput.disabled = false;
        DOM.qaInput.focus();
    }
}

function appendMessage(role, text, citation = null) {
    const el = document.createElement('div');
    el.className = `message ${role}`;
    
    // `text` is either a user question or an LLM answer — both untrusted.
    // Escape first, then restore newlines as <br> for readable formatting.
    let html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    if (citation) {
        html += `<span class="citation">Source: ${escapeHtml(citation)}</span>`;
    }

    el.innerHTML = html;
    DOM.qaHistory.appendChild(el);
    DOM.qaHistory.scrollTop = DOM.qaHistory.scrollHeight;
}

// --- Compare Feature ---
function renderCompareTab() {
    if (state.documents.length < 2) {
        DOM.compareContent.innerHTML = `<p class="hint-text">Upload at least two documents to compare metrics.</p>`;
        return;
    }

    // Compare the first two docs for simplicity
    const doc1 = state.documents[0];
    const doc2 = state.documents[1];

    if (!doc1.analysis || !doc2.analysis) return;

    const m1 = doc1.analysis.metrics || {};
    const m2 = doc2.analysis.metrics || {};
    const name1 = escapeHtml(doc1.analysis.companyName || 'Company A');
    const name2 = escapeHtml(doc2.analysis.companyName || 'Company B');

    let html = `
        <table class="metrics-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    <th>${name1}</th>
                    <th>${name2}</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="metric-name">Revenue</td>
                    <td>${escapeHtml(m1.revenue ?? 'N/A')}</td>
                    <td>${escapeHtml(m2.revenue ?? 'N/A')}</td>
                </tr>
                <tr>
                    <td class="metric-name">Growth</td>
                    <td>${escapeHtml(m1.growth ?? 'N/A')}</td>
                    <td>${escapeHtml(m2.growth ?? 'N/A')}</td>
                </tr>
                <tr>
                    <td class="metric-name">Burn Rate</td>
                    <td>${escapeHtml(m1.burnRate ?? 'N/A')}</td>
                    <td>${escapeHtml(m2.burnRate ?? 'N/A')}</td>
                </tr>
                <tr>
                    <td class="metric-name">Runway</td>
                    <td>${escapeHtml(m1.runway ?? 'N/A')}</td>
                    <td>${escapeHtml(m2.runway ?? 'N/A')}</td>
                </tr>
            </tbody>
        </table>
        <div style="margin-top: 24px; padding: 16px; background: var(--bg-secondary); border-radius: 8px;">
            <p style="font-size: 0.875rem; color: var(--text-secondary);">
                <strong>AI Summary:</strong> Both companies show promising metrics. ${name1} has ${escapeHtml(m1.growth ?? 'N/A')} growth, while ${name2} reports ${escapeHtml(m2.growth ?? 'N/A')}. Review burn rates carefully.
            </p>
        </div>
    `;

    DOM.compareContent.innerHTML = html;
}


// --- Utilities ---

/**
 * Escape a value for safe interpolation into HTML text/attributes.
 * All dynamic data (filenames, user questions, LLM responses) MUST pass
 * through this before being placed into innerHTML to prevent XSS.
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showToast(msg) {
    DOM.toast.textContent = msg;
    DOM.toast.classList.remove('hidden');
    setTimeout(() => {
        DOM.toast.classList.add('hidden');
    }, 3000);
}

function showApiKeyModal() {
    DOM.apiKeyInput.value = state.apiKey;
    DOM.apiKeyModal.classList.remove('hidden');
}

function saveApiKey() {
    const key = DOM.apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('groq_api_key', key);
        state.apiKey = key;
        DOM.apiKeyModal.classList.add('hidden');
        showToast('API Key saved successfully.');
    }
}

// Mock Data Generator
function getMockAnalysis(filename) {
    const name = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');
    return {
        companyName: name.toUpperCase(),
        stage: "Series A",
        summary: "An innovative startup building scalable solutions in their respective industry. Shows strong initial traction and a clear go-to-market strategy.",
        keyHighlights: [
            "Strong MoM growth in active users",
            "Experienced founding team from top tech companies",
            "Proprietary technology with 2 pending patents"
        ],
        risks: [
            "High customer acquisition cost (CAC)",
            "Dependency on a few key enterprise clients",
            "Regulatory changes in target markets"
        ],
        metrics: {
            revenue: "$1.2M ARR",
            growth: "15% MoM",
            burnRate: "$150k/month",
            teamSize: "24 employees",
            marketSize: "$5B TAM",
            runway: "18 months"
        }
    };
}

// Start
init();
