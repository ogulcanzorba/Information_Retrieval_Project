# CISI Information Retrieval

A search engine and evaluation playground built on the CISI test collection (1,460 documents, 112 queries). Four classical retrieval algorithms run against the same corpus. You can search with any of them, compare them on the same query, tune their parameters live, or evaluate them across the full query set with the usual IR metrics.

Started life as a CSE 422 course project.

## What's here

- **Boolean** — AND, OR, NOT, parentheses. Case-insensitive. `cat NOT dog` works (implicit AND before NOT).
- **TF-IDF** — log-normalized TF × IDF, ranked by cosine similarity.
- **BM25 (Okapi)** — `k1` and `b` exposed as live sliders.
- **Hybrid** — min-max-normalized blend of BM25 and TF-IDF, weighted by `alpha`.
- **Live evaluation** — streams per-query progress over SSE while it runs, then renders MAP, P@K, R@K, F1@K with bar and radar charts.
- **Stats view** — vocabulary size, document length distribution, top terms by document frequency.

## Running it

You'll need Python 3.9 or newer. From the repo root:

```bash
pip install -r requirements.txt
python setup.py            # downloads CISI files (already in repo) + builds the index
python backend/api.py      # http://localhost:5000
```

The CISI dataset and the prebuilt index ship with the repo, so on a fresh clone `python backend/api.py` is usually all you need. `setup.py` is mostly a no-op unless you delete things.

### When the cache rebuilds

The index file in `index_cache/` is fingerprinted against the preprocessor config (stopwords, tokenizer regex, stemmer). Change any of those and the next boot detects the mismatch and rebuilds. You can also delete `index_cache/inverted_index.json` to force it.

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Web UI |
| `/api/search` | POST | One algorithm, one query. Body: `{query, algorithm, top_k, k1?, b?, alpha?}` |
| `/api/compare` | POST | All four algorithms on one query |
| `/api/evaluate-stream` | GET (SSE) | Streams per-query progress while evaluating every model |
| `/api/evaluate` | POST | Same evaluation, blocking, returned all at once |
| `/api/evaluate-query` | POST | Per-query metrics for a single query ID |
| `/api/document/<id>` | GET | Full document by ID |
| `/api/queries` | GET | Lists the 112 CISI queries |
| `/api/stats` | GET | Collection and index statistics |

Per-request scoring overrides (`k1`, `b`, `alpha`) don't mutate the shared models, so two concurrent searches with different parameters stay isolated. Eval runs always use the model defaults.

## Project layout

```
backend/
  parser.py           CISI .I/.T/.A/.W/.X parsing
  preprocessor.py     tokenize → stopwords → Porter stem
  inverted_index.py   positional index, IDF, persistence
  boolean_model.py    AND/OR/NOT recursive descent
  tfidf_model.py      log-TF × IDF + cosine
  bm25_model.py       Okapi BM25
  hybrid_model.py     normalized BM25 + TF-IDF blend
  evaluator.py        P@K, R@K, F1@K, AP, MAP
  api.py              Flask routes + SSE streaming

frontend/
  index.html          single-page UI
  scripts/app.js      search / compare / evaluate / stats
  styles/main.css     dark theme, glass cards, animated background

cisi_dataset/         CISI.ALL, CISI.QRY, CISI.REL
index_cache/          serialized inverted index (rebuilt if config changes)
```

## Keyboard shortcuts

- `/` or `Cmd/Ctrl+K` — focus the search bar
- `Esc` — close the document detail modal
- Arrow keys on the algorithm tabs — switch ranker

## A note on the numbers

CISI is small. Abstracts are short, the post-stemming vocabulary is around 5,600 terms, and only 76 of the 112 queries have relevance judgments. So MAP scores in the 0.20–0.30 range are normal here, not a bug.

## Credit

CISI collection from the University of Glasgow IR resources. Built for CSE 422.
