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

// Per-algorithm scoring scale notes — explain what the score number means.
const SCORE_NOTES = {
    boolean: 'Boolean: 1.0 = match, 0.0 = no match. Order is by document ID, no ranking.',
    tfidf: 'TF-IDF: cosine similarity in [0, 1]. Higher = closer to the query vector.',
    bm25: 'BM25: unbounded probabilistic relevance score. Higher = more relevant; magnitude depends on k1, b, and IDF.',
    hybrid: 'Hybrid: weighted average of min-max-normalized BM25 and TF-IDF scores in [0, 1].',
};

// ── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initNavToggle();
    initHeroChips();
    initAlgoTabs();
    initSearchBar();
    initControls();
    initCompare();
    initEvaluate();
    initDocModal();
    initKeyboardShortcuts();
    initBgAnimationPause();
    loadStats();
});

// ── Navigation ───────────────────────────────────
function initNavigation() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            // Close mobile drawer on link tap
            const navLinks = document.getElementById('nav-links');
            const navToggle = document.getElementById('nav-toggle');
            if (navLinks && navLinks.classList.contains('open')) {
                navLinks.classList.remove('open');
                navToggle.setAttribute('aria-expanded', 'false');
                navToggle.classList.remove('open');
            }
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

// ── Mobile Nav Toggle ────────────────────────────
function initNavToggle() {
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => {
        const isOpen = links.classList.toggle('open');
        toggle.classList.toggle('open', isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
}

// ── Hero Chips → switch algo + scroll ────────────
function initHeroChips() {
    document.querySelectorAll('[data-jump-algo]').forEach(chip => {
        chip.addEventListener('click', () => {
            const algo = chip.dataset.jumpAlgo;
            selectAlgoTab(algo);
            const target = document.getElementById('search-section');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    });
}

function selectAlgoTab(algo) {
    const tabs = document.querySelectorAll('.algo-tab');
    tabs.forEach(t => {
        const match = t.dataset.algo === algo;
        t.classList.toggle('active', match);
        if (match) currentAlgo = algo;
    });
    updateAlgoInfo();
    updateControls();
}

// ── Keyboard Shortcuts ───────────────────────────
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Don't intercept when typing in a field
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

        // "/" or Cmd/Ctrl+K to focus search
        if (!isTyping && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'))) {
            e.preventDefault();
            const input = document.getElementById('search-input');
            if (input) {
                input.focus();
                input.select();
            }
            return;
        }

        // Esc closes the document modal if open
        if (e.key === 'Escape') {
            const modal = document.getElementById('doc-modal');
            if (modal && !modal.hidden) closeDocModal();
        }
    });
}

// ── Pause bg animation when tab is hidden ────────
function initBgAnimationPause() {
    const bg = document.querySelector('.bg-gradient');
    if (!bg) return;
    document.addEventListener('visibilitychange', () => {
        bg.style.animationPlayState = document.hidden ? 'paused' : 'running';
    });
}

// ── Algorithm Tabs ───────────────────────────────
function initAlgoTabs() {
    const tabs = document.querySelectorAll('.algo-tab');
    tabs.forEach((tab, idx) => {
        tab.addEventListener('click', () => {
            selectAlgoTab(tab.dataset.algo);
        });
        // Arrow-key tab navigation
        tab.addEventListener('keydown', (e) => {
            const list = Array.from(tabs);
            const i = list.indexOf(tab);
            let next = null;
            if (e.key === 'ArrowRight') next = list[(i + 1) % list.length];
            else if (e.key === 'ArrowLeft') next = list[(i - 1 + list.length) % list.length];
            else if (e.key === 'Home') next = list[0];
            else if (e.key === 'End') next = list[list.length - 1];
            if (next) {
                e.preventDefault();
                next.focus();
                selectAlgoTab(next.dataset.algo);
            }
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
    const alphaSlider = document.getElementById('alpha-slider');
    const alphaValue = document.getElementById('alpha-value');
    alphaSlider.addEventListener('input', () => {
        const v = parseFloat(alphaSlider.value).toFixed(2);
        alphaValue.textContent = v;
        alphaSlider.setAttribute('aria-valuenow', v);
    });

    const k1Slider = document.getElementById('k1-slider');
    const k1Value = document.getElementById('k1-value');
    k1Slider.addEventListener('input', () => {
        const v = parseFloat(k1Slider.value).toFixed(2);
        k1Value.textContent = v;
        k1Slider.setAttribute('aria-valuenow', v);
    });

    const bSlider = document.getElementById('b-slider');
    const bValue = document.getElementById('b-value');
    bSlider.addEventListener('input', () => {
        const v = parseFloat(bSlider.value).toFixed(2);
        bValue.textContent = v;
        bSlider.setAttribute('aria-valuenow', v);
    });

    // BM25 reset button
    const bm25Reset = document.getElementById('bm25-reset');
    if (bm25Reset) {
        bm25Reset.addEventListener('click', () => {
            k1Slider.value = '1.5';
            bSlider.value = '0.75';
            k1Slider.dispatchEvent(new Event('input'));
            bSlider.dispatchEvent(new Event('input'));
        });
    }

    // Boolean operator buttons — REPLACE selection (or insert at cursor)
    document.querySelectorAll('.bool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('search-input');
            const op = btn.dataset.op;
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;
            // Spaces depend on whether we replace or insert
            const insertion = ` ${op} `;
            input.value = text.slice(0, start) + insertion + text.slice(end);
            input.focus();
            const newPos = start + insertion.length;
            input.setSelectionRange(newPos, newPos);
        });
    });
}

// ── Search ───────────────────────────────────────
function initSearchBar() {
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });

    function syncClearVisibility() {
        if (clearBtn) clearBtn.hidden = searchInput.value.length === 0;
    }
    searchInput.addEventListener('input', syncClearVisibility);
    syncClearVisibility();

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
            // Hide results & restore empty state
            const area = document.getElementById('results-area');
            const empty = document.getElementById('empty-state');
            if (area) area.style.display = 'none';
            if (empty) empty.style.display = 'block';
            hideError('search-error');
        });
    }

    // Search-section presets
    document.querySelectorAll('#search-presets .preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            searchInput.value = btn.dataset.query;
            searchInput.dispatchEvent(new Event('input'));
            doSearch();
        });
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

    const btn = document.getElementById('search-btn');
    hideError('search-error');
    setButtonLoading(btn, true, 'Searching');

    try {
        const res = await fetch(`${API_BASE}/api/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
        displayResults(data);
    } catch (err) {
        console.error('Search error:', err);
        showError('search-error', `Search failed: ${err.message}. Check that the API is running.`);
    } finally {
        setButtonLoading(btn, false);
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

    listEl.textContent = '';

    if (data.results.length === 0) {
        const noRes = document.createElement('div');
        noRes.className = 'no-results';
        noRes.textContent = 'No matching documents found. Try a different query or algorithm.';
        listEl.appendChild(noRes);
        return;
    }

    const algorithm = data.algorithm || 'bm25';
    const showScore = algorithm !== 'boolean';
    const scoreTooltip = SCORE_NOTES[algorithm] || '';

    data.results.forEach((doc, i) => {
        listEl.appendChild(buildResultCard(doc, i, { showScore, scoreTooltip }));
    });
}

function buildResultCard(doc, index, opts) {
    const { showScore, scoreTooltip } = opts;
    const rankClass = index < 3 ? `rank-${index + 1}` : 'rank-default';

    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${index * 0.06}s`;

    const rank = document.createElement('div');
    rank.className = `result-rank ${rankClass}`;
    rank.textContent = String(index + 1);
    card.appendChild(rank);

    const top = document.createElement('div');
    top.className = 'result-top';
    const titleEl = document.createElement('div');
    titleEl.className = 'result-title';
    titleEl.textContent = doc.title || 'Untitled';
    top.appendChild(titleEl);
    if (showScore) {
        const score = document.createElement('div');
        score.className = 'result-score';
        score.textContent = doc.score.toFixed(4);
        if (scoreTooltip) score.title = scoreTooltip;
        top.appendChild(score);
    }
    card.appendChild(top);

    if (doc.author) {
        const author = document.createElement('div');
        author.className = 'result-author';
        author.textContent = `by ${doc.author}`;
        card.appendChild(author);
    }

    const abstract = document.createElement('div');
    abstract.className = 'result-abstract';
    abstract.textContent = doc.abstract || 'No abstract available.';
    card.appendChild(abstract);

    // Toggle the line-clamp on click
    abstract.addEventListener('click', () => {
        abstract.classList.toggle('expanded');
    });

    const meta = document.createElement('div');
    meta.className = 'result-meta';
    const docLink = document.createElement('button');
    docLink.type = 'button';
    docLink.className = 'doc-id-link';
    docLink.textContent = `Doc #${doc.id}`;
    docLink.addEventListener('click', () => openDocModal(doc.id));
    meta.appendChild(docLink);
    card.appendChild(meta);

    return card;
}

// ── Compare ──────────────────────────────────────
function initCompare() {
    const compareBtn = document.getElementById('compare-btn');
    const compareInput = document.getElementById('compare-input');
    const clearBtn = document.getElementById('compare-clear');

    compareBtn.addEventListener('click', doCompare);
    compareInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doCompare();
    });

    function syncClearVisibility() {
        if (clearBtn) clearBtn.hidden = compareInput.value.length === 0;
    }
    compareInput.addEventListener('input', syncClearVisibility);
    syncClearVisibility();

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            compareInput.value = '';
            compareInput.dispatchEvent(new Event('input'));
            compareInput.focus();
            const grid = document.getElementById('compare-grid');
            if (grid) grid.style.display = 'none';
            hideError('compare-error');
        });
    }

    // Preset queries inside the Compare section only
    document.querySelectorAll('#preset-queries .preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            compareInput.value = btn.dataset.query;
            compareInput.dispatchEvent(new Event('input'));
            doCompare();
        });
    });
}

async function doCompare() {
    const query = document.getElementById('compare-input').value.trim();
    if (!query) return;

    const btn = document.getElementById('compare-btn');
    hideError('compare-error');
    setButtonLoading(btn, true, 'Comparing');

    try {
        const res = await fetch(`${API_BASE}/api/compare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, top_k: 10 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
        displayComparison(data);
    } catch (err) {
        console.error('Compare error:', err);
        showError('compare-error', `Compare failed: ${err.message}. Check that the API is running.`);
    } finally {
        setButtonLoading(btn, false);
    }
}

function displayComparison(data) {
    const grid = document.getElementById('compare-grid');
    grid.style.display = 'grid';
    grid.textContent = '';

    const algos = ['boolean', 'tfidf', 'bm25', 'hybrid'];

    algos.forEach((algo, idx) => {
        const info = data[algo];
        if (!info) return;

        const col = document.createElement('div');
        col.className = 'compare-column';
        col.style.animationDelay = `${idx * 0.1}s`;

        const header = document.createElement('div');
        header.className = 'compare-column-header';
        const algoName = document.createElement('div');
        algoName.className = `compare-algo-name algo-${algo}`;
        algoName.textContent = info.model_name;
        const meta = document.createElement('div');
        meta.className = 'compare-meta';
        meta.textContent = `${info.num_results} results · ${info.elapsed_ms}ms`;
        header.appendChild(algoName);
        header.appendChild(meta);
        col.appendChild(header);

        const resultsWrap = document.createElement('div');
        resultsWrap.className = 'compare-results';

        if (info.results.length === 0) {
            const noRes = document.createElement('div');
            noRes.className = 'no-results';
            noRes.textContent = 'No results';
            resultsWrap.appendChild(noRes);
        } else {
            const showScore = algo !== 'boolean';
            const tooltip = SCORE_NOTES[algo] || '';
            info.results.forEach((doc, i) => {
                resultsWrap.appendChild(buildCompareItem(doc, i, { showScore, tooltip }));
            });
        }

        col.appendChild(resultsWrap);
        grid.appendChild(col);
    });
}

function buildCompareItem(doc, index, opts) {
    const { showScore, tooltip } = opts;

    const item = document.createElement('div');
    item.className = 'compare-item';

    const rank = document.createElement('div');
    rank.className = 'compare-item-rank';
    rank.textContent = String(index + 1);
    item.appendChild(rank);

    const info = document.createElement('div');
    info.className = 'compare-item-info';

    const title = document.createElement('div');
    title.className = 'compare-item-title';
    title.textContent = doc.title || 'Untitled';
    info.appendChild(title);

    const idRow = document.createElement('div');
    idRow.className = 'compare-item-id';
    const idBtn = document.createElement('button');
    idBtn.type = 'button';
    idBtn.className = 'doc-id-link doc-id-link-sm';
    idBtn.textContent = `Doc #${doc.id}`;
    idBtn.addEventListener('click', () => openDocModal(doc.id));
    idRow.appendChild(idBtn);
    if (showScore) {
        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'compare-score';
        scoreSpan.textContent = ` · Score: ${doc.score.toFixed(4)}`;
        if (tooltip) scoreSpan.title = tooltip;
        idRow.appendChild(scoreSpan);
    }
    info.appendChild(idRow);

    item.appendChild(info);
    return item;
}

// ── Evaluate ─────────────────────────────────────
function initEvaluate() {
    const evalBtn = document.getElementById('run-eval-btn');
    evalBtn.addEventListener('click', runEvaluation);

    const abortBtn = document.getElementById('eval-abort-btn');
    if (abortBtn) {
        abortBtn.addEventListener('click', abortEvaluation);
    }
}

let evalEventSource = null;
let evalCompleted = false;

function abortEvaluation() {
    if (evalEventSource) {
        evalEventSource.close();
        evalEventSource = null;
    }
    evalCompleted = true; // suppress onerror handling
    const progress = document.getElementById('eval-progress');
    const btn = document.getElementById('run-eval-btn');
    if (progress) progress.style.display = 'none';
    if (btn) btn.style.display = 'flex';
    showError('eval-error', 'Evaluation aborted by user.');
}

function buildEvalModelRow(name, index) {
    const row = document.createElement('div');
    row.className = 'eval-model-row';
    row.dataset.modelIndex = String(index);

    const statusEl = document.createElement('div');
    statusEl.className = 'eval-model-status pending';
    statusEl.textContent = '●';

    const nameEl = document.createElement('div');
    nameEl.className = 'eval-model-name';
    nameEl.textContent = name;

    const detailEl = document.createElement('div');
    detailEl.className = 'eval-model-detail';
    detailEl.textContent = 'queued';

    row.appendChild(statusEl);
    row.appendChild(nameEl);
    row.appendChild(detailEl);
    return row;
}

function runEvaluation() {
    const btn = document.getElementById('run-eval-btn');
    const progress = document.getElementById('eval-progress');
    const results = document.getElementById('eval-results');
    const label = document.getElementById('eval-progress-label');
    const pctEl = document.getElementById('eval-progress-pct');
    const fillEl = document.getElementById('eval-progress-bar-fill');
    const modelList = document.getElementById('eval-model-list');

    btn.style.display = 'none';
    progress.style.display = 'block';
    results.style.display = 'none';
    hideError('eval-error');

    label.textContent = 'Connecting...';
    pctEl.textContent = '0%';
    fillEl.style.width = '0%';
    modelList.textContent = '';

    if (evalEventSource) {
        evalEventSource.close();
    }
    evalCompleted = false;

    evalEventSource = new EventSource(`${API_BASE}/api/evaluate-stream?top_k=100`);

    evalEventSource.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        handleEvalEvent(msg);
    };

    evalEventSource.onerror = () => {
        // Suppress noise after a clean finish (the browser auto-reconnects on close)
        if (evalCompleted) return;
        if (evalEventSource && evalEventSource.readyState === EventSource.CLOSED) {
            return;
        }
        evalEventSource.close();
        evalEventSource = null;
        progress.style.display = 'none';
        btn.style.display = 'flex';
        showError('eval-error', 'Evaluation stream lost. Check that the API is running and retry.');
    };
}

function handleEvalEvent(msg) {
    const label = document.getElementById('eval-progress-label');
    const pctEl = document.getElementById('eval-progress-pct');
    const fillEl = document.getElementById('eval-progress-bar-fill');
    const modelList = document.getElementById('eval-model-list');
    const progress = document.getElementById('eval-progress');
    const results = document.getElementById('eval-results');
    const btn = document.getElementById('run-eval-btn');

    switch (msg.event) {
        case 'start':
            label.textContent = `Evaluating ${msg.total_models} models on ${msg.total_queries} queries...`;
            modelList.textContent = '';
            msg.models.forEach((m, i) => {
                modelList.appendChild(buildEvalModelRow(m.name, i));
            });
            break;

        case 'model_start': {
            const row = modelList.querySelector(`[data-model-index="${msg.model_index}"]`);
            if (row) {
                row.querySelector('.eval-model-status').className = 'eval-model-status active';
                row.querySelector('.eval-model-detail').textContent = 'starting...';
            }
            label.textContent = `Running ${msg.model_name}...`;
            break;
        }

        case 'progress': {
            const row = modelList.querySelector(`[data-model-index="${msg.model_index}"]`);
            if (row) {
                row.querySelector('.eval-model-detail').textContent =
                    `${msg.queries_done} / ${msg.total_queries} queries`;
            }
            pctEl.textContent = `${msg.overall_pct.toFixed(1)}%`;
            fillEl.style.width = `${msg.overall_pct}%`;
            const bar = document.querySelector('.eval-progress-bar');
            if (bar) bar.setAttribute('aria-valuenow', String(Math.round(msg.overall_pct)));
            break;
        }

        case 'model_done': {
            const row = modelList.querySelector(`[data-model-index="${msg.model_index}"]`);
            if (row) {
                row.querySelector('.eval-model-status').className = 'eval-model-status done';
                const map = msg.aggregated.MAP;
                row.querySelector('.eval-model-detail').textContent =
                    map !== undefined ? `MAP ${(map * 100).toFixed(1)}%` : 'done';
            }
            break;
        }

        case 'complete':
            evalCompleted = true;
            label.textContent = 'Evaluation complete';
            pctEl.textContent = '100%';
            fillEl.style.width = '100%';
            const bar = document.querySelector('.eval-progress-bar');
            if (bar) bar.setAttribute('aria-valuenow', '100');
            if (evalEventSource) {
                evalEventSource.close();
                evalEventSource = null;
            }
            setTimeout(() => {
                progress.style.display = 'none';
                results.style.display = 'block';
                displayEvalResults(msg.results);
            }, 400);
            break;

        case 'error':
            evalCompleted = true;
            if (evalEventSource) {
                evalEventSource.close();
                evalEventSource = null;
            }
            progress.style.display = 'none';
            btn.style.display = 'flex';
            showError('eval-error', `Evaluation failed: ${msg.message}`);
            break;
    }
}

function displayEvalResults(data) {
    const models = data.map(d => d.aggregated);

    const cardsEl = document.getElementById('metric-cards');
    cardsEl.textContent = '';
    const cardClasses = ['card-tfidf', 'card-bm25', 'card-hybrid'];

    models.forEach((m, i) => {
        const card = document.createElement('div');
        card.className = `metric-card ${cardClasses[i]}`;

        const labelEl = document.createElement('div');
        labelEl.className = 'metric-card-label';
        labelEl.textContent = m.model_name;

        const valueEl = document.createElement('div');
        valueEl.className = 'metric-card-value';
        valueEl.textContent = `${(m.MAP * 100).toFixed(1)}%`;

        const subEl = document.createElement('div');
        subEl.className = 'metric-card-sublabel';
        subEl.textContent = 'Mean Average Precision';

        card.appendChild(labelEl);
        card.appendChild(valueEl);
        card.appendChild(subEl);
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
                    suggestedMax: 0.5,
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
                    suggestedMax: 0.35,
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

// ── Document Modal ───────────────────────────────
function initDocModal() {
    const modal = document.getElementById('doc-modal');
    const closeBtn = document.getElementById('doc-modal-close');
    if (!modal || !closeBtn) return;
    closeBtn.addEventListener('click', closeDocModal);
    // Click on the dim overlay (but not the card) to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeDocModal();
    });
}

async function openDocModal(docId) {
    const modal = document.getElementById('doc-modal');
    if (!modal) return;
    const idEl = document.getElementById('doc-modal-id');
    const titleEl = document.getElementById('doc-modal-title');
    const authorEl = document.getElementById('doc-modal-author');
    const abstractEl = document.getElementById('doc-modal-abstract');
    const xrefsWrap = document.getElementById('doc-modal-xrefs-wrap');
    const xrefsEl = document.getElementById('doc-modal-xrefs');

    idEl.textContent = `Doc #${docId}`;
    titleEl.textContent = 'Loading...';
    authorEl.textContent = '';
    abstractEl.textContent = '';
    xrefsWrap.hidden = true;
    modal.hidden = false;
    document.body.classList.add('modal-open');

    try {
        const res = await fetch(`${API_BASE}/api/document/${docId}`);
        const doc = await res.json();
        if (!res.ok) throw new Error(doc.error || `Server returned ${res.status}`);

        titleEl.textContent = doc.title || 'Untitled';
        authorEl.textContent = doc.author ? `by ${doc.author}` : '';
        abstractEl.textContent = doc.abstract || 'No abstract available.';
        if (doc.cross_references && doc.cross_references.trim()) {
            xrefsEl.textContent = doc.cross_references;
            xrefsWrap.hidden = false;
        }
    } catch (err) {
        console.error('Document fetch error:', err);
        titleEl.textContent = 'Failed to load document';
        abstractEl.textContent = err.message;
    }
}

function closeDocModal() {
    const modal = document.getElementById('doc-modal');
    if (modal) {
        modal.hidden = true;
        document.body.classList.remove('modal-open');
    }
}

// ── Statistics ───────────────────────────────────
async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/api/stats`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
        displayStats(data);
    } catch (err) {
        console.error('Stats error:', err);
        // Drop the perpetual pulse and show a banner
        document.querySelectorAll('.stat-card').forEach(el => el.classList.remove('loading-pulse'));
        document.querySelectorAll('.stat-value').forEach(el => { el.textContent = '—'; });
        showError('stats-error', `Stats unavailable: ${err.message}`);
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

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function hideError(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
}

function setButtonLoading(btn, isLoading, loadingLabel) {
    if (!btn) return;
    if (isLoading) {
        if (!btn.dataset.originalHtml) {
            btn.dataset.originalHtml = btn.innerHTML;
        }
        btn.disabled = true;
        btn.classList.add('is-loading');
        const label = loadingLabel || 'Loading';
        btn.textContent = '';
        const spinner = document.createElement('span');
        spinner.className = 'btn-spinner';
        const text = document.createElement('span');
        text.textContent = `${label}...`;
        btn.appendChild(spinner);
        btn.appendChild(text);
    } else {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        if (btn.dataset.originalHtml) {
            btn.innerHTML = btn.dataset.originalHtml;
            delete btn.dataset.originalHtml;
        }
    }
}
