/* ═══════════════════════════════════════════════════
   CISI IR System — Application Logic
   Search, Compare, Evaluate, Statistics
   ═══════════════════════════════════════════════════ */

const API_BASE = '';  // Same origin (Flask serves frontend)

// ── State ────────────────────────────────────────
let currentAlgo = 'boolean';
let chartInstances = {};

const ALGO_INFO = {
    boolean: {
        name: 'Boolean Retrieval',
        desc: 'Set-based retrieval using AND, OR, NOT operators. No ranking — all matched documents are equally relevant. Use operators to construct precise queries.',
        color: '#818cf8'
    },
    tfidf: {
        name: 'TF-IDF Vector Space',
        desc: 'Uses log-normalized Term Frequency × Inverse Document Frequency with cosine similarity. Ranks documents by vector space proximity to the query.',
        color: '#a78bfa'
    },
    bm25: {
        name: 'BM25 (Okapi)',
        desc: 'Probabilistic ranking with term frequency saturation (k1) and document length normalization (b). The gold standard for lexical retrieval.',
        color: '#f472b6'
    },
    hybrid: {
        name: 'Hybrid (BM25 + TF-IDF)',
        desc: 'Combines BM25 and TF-IDF scores using min-max normalization and a tunable alpha weight. Best of both worlds.',
        color: '#fb923c'
    }
};

const ALGO_COLORS = {
    tfidf: { bg: 'rgba(129,140,248,0.8)', border: '#818cf8' },
    bm25: { bg: 'rgba(244,114,182,0.8)', border: '#f472b6' },
    hybrid: { bg: 'rgba(251,146,60,0.8)', border: '#fb923c' }
};

// ── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initAlgoTabs();
    initSearchBar();
    initControls();
    initCompare();
    initEvaluate();
    loadStats();
});

// ── Navigation ───────────────────────────────────
function initNavigation() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Scroll spy
    const sections = ['search-section', 'compare-section', 'evaluate-section', 'stats-section'];
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                links.forEach(l => {
                    l.classList.toggle('active', l.getAttribute('data-section') === id.replace('-section', ''));
                });
            }
        });
    }, { threshold: 0.3 });

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
    });
}

// ── Algorithm Tabs ───────────────────────────────
function initAlgoTabs() {
    const tabs = document.querySelectorAll('.algo-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentAlgo = tab.dataset.algo;
            updateAlgoInfo();
            updateControls();
        });
    });
    updateAlgoInfo();
}

function updateAlgoInfo() {
    const info = ALGO_INFO[currentAlgo];
    document.getElementById('algo-info-name').textContent = info.name;
    document.getElementById('algo-info-desc').textContent = info.desc;
}

function updateControls() {
    const boolOps = document.getElementById('bool-ops');
    const hybridCtrl = document.getElementById('hybrid-controls');
    const bm25Ctrl = document.getElementById('bm25-controls');

    boolOps.style.display = currentAlgo === 'boolean' ? 'flex' : 'none';
    hybridCtrl.style.display = currentAlgo === 'hybrid' ? 'block' : 'none';
    bm25Ctrl.style.display = currentAlgo === 'bm25' ? 'block' : 'none';

    // Update placeholder
    const input = document.getElementById('search-input');
    if (currentAlgo === 'boolean') {
        input.placeholder = 'Try: information AND retrieval NOT library';
    } else {
        input.placeholder = 'Try: "information retrieval systems"';
    }
}

// ── Controls ─────────────────────────────────────
function initControls() {
    // Alpha slider
    const alphaSlider = document.getElementById('alpha-slider');
    const alphaValue = document.getElementById('alpha-value');
    alphaSlider.addEventListener('input', () => {
        alphaValue.textContent = parseFloat(alphaSlider.value).toFixed(2);
    });

    // BM25 sliders
    const k1Slider = document.getElementById('k1-slider');
    const k1Value = document.getElementById('k1-value');
    k1Slider.addEventListener('input', () => {
        k1Value.textContent = parseFloat(k1Slider.value).toFixed(2);
    });

    const bSlider = document.getElementById('b-slider');
    const bValue = document.getElementById('b-value');
    bSlider.addEventListener('input', () => {
        bValue.textContent = parseFloat(bSlider.value).toFixed(2);
    });

    // Boolean operator buttons
    document.querySelectorAll('.bool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('search-input');
            const op = btn.dataset.op;
            const cursorPos = input.selectionStart;
            const text = input.value;
            const insertion = ` ${op} `;
            input.value = text.slice(0, cursorPos) + insertion + text.slice(cursorPos);
            input.focus();
            input.setSelectionRange(cursorPos + insertion.length, cursorPos + insertion.length);
        });
    });
}

// ── Search ───────────────────────────────────────
function initSearchBar() {
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });
}

async function doSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const topK = parseInt(document.getElementById('topk-select').value);
    const alpha = parseFloat(document.getElementById('alpha-slider').value);
    const k1 = parseFloat(document.getElementById('k1-slider').value);
    const b = parseFloat(document.getElementById('b-slider').value);

    const body = {
        query,
        algorithm: currentAlgo,
        top_k: topK,
        alpha: alpha,
        k1: currentAlgo === 'bm25' ? k1 : undefined,
        b: currentAlgo === 'bm25' ? b : undefined,
    };

    try {
        const res = await fetch(`${API_BASE}/api/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        displayResults(data);
    } catch (err) {
        console.error('Search error:', err);
    }
}

function displayResults(data) {
    const area = document.getElementById('results-area');
    const empty = document.getElementById('empty-state');
    const countEl = document.getElementById('results-count');
    const timeEl = document.getElementById('results-time');
    const listEl = document.getElementById('results-list');

    empty.style.display = 'none';
    area.style.display = 'block';

    countEl.textContent = `${data.num_results} result${data.num_results !== 1 ? 's' : ''} found`;
    timeEl.textContent = `${data.elapsed_ms} ms`;

    listEl.innerHTML = '';

    if (data.results.length === 0) {
        listEl.innerHTML = '<div class="no-results">No matching documents found. Try a different query or algorithm.</div>';
        return;
    }

    data.results.forEach((doc, i) => {
        const rankClass = i < 3 ? `rank-${i + 1}` : 'rank-default';
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.animationDelay = `${i * 0.06}s`;

        card.innerHTML = `
            <div class="result-rank ${rankClass}">${i + 1}</div>
            <div class="result-top">
                <div class="result-title">${escapeHtml(doc.title || 'Untitled')}</div>
                <div class="result-score">${doc.score.toFixed(4)}</div>
            </div>
            ${doc.author ? `<div class="result-author">by ${escapeHtml(doc.author)}</div>` : ''}
            <div class="result-abstract">${escapeHtml(doc.abstract || 'No abstract available.')}</div>
            <div class="result-meta">
                <span>Doc #${doc.id}</span>
            </div>
        `;
        listEl.appendChild(card);
    });
}

// ── Compare ──────────────────────────────────────
function initCompare() {
    const compareBtn = document.getElementById('compare-btn');
    const compareInput = document.getElementById('compare-input');

    compareBtn.addEventListener('click', doCompare);
    compareInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doCompare();
    });

    // Preset queries
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            compareInput.value = btn.dataset.query;
            doCompare();
        });
    });
}

async function doCompare() {
    const query = document.getElementById('compare-input').value.trim();
    if (!query) return;

    try {
        const res = await fetch(`${API_BASE}/api/compare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, top_k: 10 }),
        });
        const data = await res.json();
        displayComparison(data);
    } catch (err) {
        console.error('Compare error:', err);
    }
}

function displayComparison(data) {
    const grid = document.getElementById('compare-grid');
    grid.style.display = 'grid';
    grid.innerHTML = '';

    const algos = ['boolean', 'tfidf', 'bm25', 'hybrid'];

    algos.forEach((algo, idx) => {
        const info = data[algo];
        if (!info) return;

        const col = document.createElement('div');
        col.className = 'compare-column';
        col.style.animationDelay = `${idx * 0.1}s`;

        let resultsHTML = '';
        if (info.results.length === 0) {
            resultsHTML = '<div class="no-results">No results</div>';
        } else {
            resultsHTML = info.results.map((doc, i) => `
                <div class="compare-item">
                    <div class="compare-item-rank">${i + 1}</div>
                    <div class="compare-item-info">
                        <div class="compare-item-title">${escapeHtml(doc.title || 'Untitled')}</div>
                        <div class="compare-item-id">Doc #${doc.id} · Score: ${doc.score.toFixed(4)}</div>
                    </div>
                </div>
            `).join('');
        }

        col.innerHTML = `
            <div class="compare-column-header">
                <div class="compare-algo-name algo-${algo}">${info.model_name}</div>
                <div class="compare-meta">${info.num_results} results · ${info.elapsed_ms}ms</div>
            </div>
            <div class="compare-results">${resultsHTML}</div>
        `;
        grid.appendChild(col);
    });
}

// ── Evaluate ─────────────────────────────────────
function initEvaluate() {
    const evalBtn = document.getElementById('run-eval-btn');
    evalBtn.addEventListener('click', runEvaluation);
}

async function runEvaluation() {
    const btn = document.getElementById('run-eval-btn');
    const loading = document.getElementById('eval-loading');
    const results = document.getElementById('eval-results');

    btn.style.display = 'none';
    loading.style.display = 'flex';
    results.style.display = 'none';

    try {
        const res = await fetch(`${API_BASE}/api/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ top_k: 100 }),
        });
        const data = await res.json();

        loading.style.display = 'none';
        results.style.display = 'block';

        displayEvalResults(data);
    } catch (err) {
        console.error('Evaluation error:', err);
        loading.innerHTML = '<span style="color:#f472b6">Error running evaluation. Is the API running?</span>';
    }
}

function displayEvalResults(data) {
    // data is an array of model evaluations
    const models = data.map(d => d.aggregated);

    // MAP Cards
    const cardsEl = document.getElementById('metric-cards');
    cardsEl.innerHTML = '';
    const cardClasses = ['card-tfidf', 'card-bm25', 'card-hybrid'];

    models.forEach((m, i) => {
        const card = document.createElement('div');
        card.className = `metric-card ${cardClasses[i]}`;
        card.innerHTML = `
            <div class="metric-card-label">${m.model_name}</div>
            <div class="metric-card-value">${(m.MAP * 100).toFixed(1)}%</div>
            <div class="metric-card-sublabel">Mean Average Precision</div>
        `;
        cardsEl.appendChild(card);
    });

    // Precision chart
    createGroupedBarChart('precision-chart', 'Precision', models, [
        { key: 'mean_precision_at_5', label: 'P@5' },
        { key: 'mean_precision_at_10', label: 'P@10' },
        { key: 'mean_precision_at_20', label: 'P@20' },
    ]);

    // Recall chart
    createGroupedBarChart('recall-chart', 'Recall', models, [
        { key: 'mean_recall_at_5', label: 'R@5' },
        { key: 'mean_recall_at_10', label: 'R@10' },
        { key: 'mean_recall_at_20', label: 'R@20' },
    ]);

    // F1 chart
    createGroupedBarChart('f1-chart', 'F1', models, [
        { key: 'mean_f1_at_5', label: 'F1@5' },
        { key: 'mean_f1_at_10', label: 'F1@10' },
        { key: 'mean_f1_at_20', label: 'F1@20' },
    ]);

    // Radar chart
    createRadarChart('radar-chart', models);
}

function createGroupedBarChart(canvasId, title, models, metrics) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const colors = [
        { bg: 'rgba(129,140,248,0.7)', border: '#818cf8' },
        { bg: 'rgba(244,114,182,0.7)', border: '#f472b6' },
        { bg: 'rgba(251,146,60,0.7)', border: '#fb923c' },
    ];

    const datasets = models.map((m, i) => ({
        label: m.model_name,
        data: metrics.map(metric => m[metric.key]),
        backgroundColor: colors[i].bg,
        borderColor: colors[i].border,
        borderWidth: 1,
        borderRadius: 6,
    }));

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: metrics.map(m => m.label),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#9898b8',
                        font: { family: 'Inter', size: 11 },
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#5a5a7a', font: { family: 'JetBrains Mono', size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                    beginAtZero: true,
                    max: 0.5,
                    ticks: {
                        color: '#5a5a7a',
                        font: { family: 'JetBrains Mono', size: 11 },
                        callback: v => (v * 100).toFixed(0) + '%'
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                }
            }
        }
    });
}

function createRadarChart(canvasId, models) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const labels = ['MAP', 'P@5', 'P@10', 'R@10', 'R@20', 'F1@10'];
    const keys = ['MAP', 'mean_precision_at_5', 'mean_precision_at_10', 'mean_recall_at_10', 'mean_recall_at_20', 'mean_f1_at_10'];

    const colors = [
        { bg: 'rgba(129,140,248,0.15)', border: '#818cf8' },
        { bg: 'rgba(244,114,182,0.15)', border: '#f472b6' },
        { bg: 'rgba(251,146,60,0.15)', border: '#fb923c' },
    ];

    const datasets = models.map((m, i) => ({
        label: m.model_name,
        data: keys.map(k => m[k]),
        backgroundColor: colors[i].bg,
        borderColor: colors[i].border,
        borderWidth: 2,
        pointBackgroundColor: colors[i].border,
        pointRadius: 4,
    }));

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'radar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#9898b8',
                        font: { family: 'Inter', size: 11 },
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 0.35,
                    ticks: {
                        color: '#5a5a7a',
                        font: { size: 10 },
                        backdropColor: 'transparent',
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    angleLines: { color: 'rgba(255,255,255,0.06)' },
                    pointLabels: {
                        color: '#9898b8',
                        font: { family: 'JetBrains Mono', size: 11 },
                    }
                }
            }
        }
    });
}

// ── Statistics ───────────────────────────────────
async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/api/stats`);
        const data = await res.json();
        displayStats(data);
    } catch (err) {
        console.error('Stats error:', err);
    }
}

function displayStats(data) {
    const c = data.collection;
    const ix = data.index;

    // Remove loading pulse
    document.querySelectorAll('.stat-card').forEach(el => el.classList.remove('loading-pulse'));

    document.getElementById('stat-docs').textContent = formatNumber(c.num_documents);
    document.getElementById('stat-queries').textContent = formatNumber(c.num_queries);
    document.getElementById('stat-vocab').textContent = formatNumber(ix.vocabulary_size);
    document.getElementById('stat-tokens').textContent = formatNumber(ix.total_tokens);
    document.getElementById('stat-avgdl').textContent = ix.avg_doc_length;
    document.getElementById('stat-relpairs').textContent = formatNumber(c.total_relevance_pairs);

    // Top terms chart
    if (ix.top_terms && ix.top_terms.length > 0) {
        createTopTermsChart(ix.top_terms);
    }

    // Doc length distribution
    if (ix.doc_length_distribution && ix.doc_length_distribution.length > 0) {
        createDocLengthChart(ix.doc_length_distribution);
    }
}

function createTopTermsChart(topTerms) {
    const ctx = document.getElementById('top-terms-chart').getContext('2d');

    if (chartInstances['top-terms-chart']) {
        chartInstances['top-terms-chart'].destroy();
    }

    chartInstances['top-terms-chart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topTerms.map(t => t.term),
            datasets: [{
                label: 'Document Frequency',
                data: topTerms.map(t => t.df),
                backgroundColor: topTerms.map((_, i) => {
                    const hue = 230 + (i * 6);
                    return `hsla(${hue}, 76%, 65%, 0.6)`;
                }),
                borderColor: topTerms.map((_, i) => {
                    const hue = 230 + (i * 6);
                    return `hsla(${hue}, 76%, 65%, 1)`;
                }),
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#5a5a7a', font: { family: 'JetBrains Mono', size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                    ticks: { color: '#9898b8', font: { family: 'JetBrains Mono', size: 11 } },
                    grid: { display: false },
                }
            }
        }
    });
}

function createDocLengthChart(distribution) {
    const ctx = document.getElementById('doc-length-chart').getContext('2d');

    if (chartInstances['doc-length-chart']) {
        chartInstances['doc-length-chart'].destroy();
    }

    chartInstances['doc-length-chart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: distribution.map(d => d.length),
            datasets: [{
                label: 'Number of Documents',
                data: distribution.map(d => d.count),
                backgroundColor: 'rgba(167,139,250,0.5)',
                borderColor: '#a78bfa',
                borderWidth: 1,
                borderRadius: 3,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Token Count',
                        color: '#5a5a7a',
                        font: { size: 11 }
                    },
                    ticks: { color: '#5a5a7a', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                    title: {
                        display: true,
                        text: 'Documents',
                        color: '#5a5a7a',
                        font: { size: 11 }
                    },
                    ticks: { color: '#5a5a7a', font: { family: 'JetBrains Mono', size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                }
            }
        }
    });
}

// ── Utilities ────────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}
