"""
Flask REST API for the Information Retrieval System.
Serves search, evaluation, and statistics endpoints.
"""
import os
import sys
import time
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from backend.parser import load_cisi_dataset
from backend.preprocessor import preprocess, get_document_text
from backend.inverted_index import InvertedIndex
from backend.boolean_model import BooleanModel
from backend.tfidf_model import TFIDFModel
from backend.bm25_model import BM25Model
from backend.hybrid_model import HybridModel
from backend.evaluator import Evaluator

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

# ─────────────────────────────────────────────
# Global state
# ─────────────────────────────────────────────
documents = {}
queries = {}
relevance = {}
inv_index = None
boolean_model = None
tfidf_model = None
bm25_model = None
hybrid_model = None
evaluator = None
_initialized = False


def initialize():
    """Load data, build index, and initialize all models."""
    global documents, queries, relevance
    global inv_index, boolean_model, tfidf_model, bm25_model, hybrid_model
    global evaluator, _initialized

    if _initialized:
        return

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(project_root, 'cisi_dataset')
    index_path = os.path.join(project_root, 'index_cache', 'inverted_index.json')

    print("\n" + "=" * 60)
    print("  INFORMATION RETRIEVAL SYSTEM — INITIALIZING")
    print("=" * 60)

    # 1) Load dataset
    t0 = time.time()
    documents, queries, relevance = load_cisi_dataset(data_dir)
    print(f"  Dataset loaded in {time.time() - t0:.2f}s")

    # 2) Build or load inverted index
    inv_index = InvertedIndex()
    if os.path.exists(index_path):
        t0 = time.time()
        inv_index.load(index_path)
        # Rebuild doc_tokens (not serialized)
        from backend.preprocessor import preprocess, get_document_text
        for doc_id, doc in documents.items():
            text = get_document_text(doc)
            inv_index.doc_tokens[doc_id] = preprocess(text)
        print(f"  Index loaded from cache in {time.time() - t0:.2f}s")
    else:
        t0 = time.time()
        inv_index.build(documents)
        inv_index.save(index_path)
        print(f"  Index built & cached in {time.time() - t0:.2f}s")

    # 3) Initialize models
    t0 = time.time()
    boolean_model = BooleanModel(inv_index, documents)
    tfidf_model = TFIDFModel(inv_index, documents)
    bm25_model = BM25Model(inv_index, documents)
    hybrid_model = HybridModel(bm25_model, tfidf_model, alpha=0.6)
    print(f"  Models initialized in {time.time() - t0:.2f}s")

    # 4) Evaluator
    evaluator = Evaluator(relevance)

    _initialized = True
    print("=" * 60)
    print("  SYSTEM READY — http://localhost:5000")
    print("=" * 60 + "\n")


# ─────────────────────────────────────────────
# Routes — Frontend
# ─────────────────────────────────────────────
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)


# ─────────────────────────────────────────────
# Routes — API
# ─────────────────────────────────────────────
@app.route('/api/search', methods=['POST'])
def api_search():
    """
    Search endpoint.
    Body: { "query": str, "algorithm": str, "top_k": int, "alpha": float, "k1": float, "b": float }
    """
    data = request.get_json()
    query = data.get('query', '').strip()
    algorithm = data.get('algorithm', 'bm25')
    top_k = data.get('top_k', 10)
    alpha = data.get('alpha', 0.6)
    k1 = data.get('k1')
    b = data.get('b')

    if not query:
        return jsonify({'error': 'Empty query'}), 400

    # Select model
    if algorithm == 'boolean':
        model = boolean_model
    elif algorithm == 'tfidf':
        model = tfidf_model
    elif algorithm == 'bm25':
        if k1 is not None or b is not None:
            bm25_model.set_params(k1=k1, b=b)
        model = bm25_model
    elif algorithm == 'hybrid':
        hybrid_model.set_alpha(alpha)
        model = hybrid_model
    else:
        return jsonify({'error': f'Unknown algorithm: {algorithm}'}), 400

    t0 = time.time()

    if algorithm == 'hybrid':
        results = model.search(query, top_k=top_k, alpha=alpha)
    else:
        results = model.search(query, top_k=top_k)

    elapsed = time.time() - t0

    # Build response
    result_docs = []
    for doc_id, score in results:
        doc = documents.get(doc_id, {})
        result_docs.append({
            'id': doc_id,
            'title': doc.get('title', ''),
            'author': doc.get('author', ''),
            'abstract': doc.get('abstract', '')[:500],
            'score': round(score, 6),
        })

    return jsonify({
        'query': query,
        'algorithm': algorithm,
        'num_results': len(result_docs),
        'elapsed_ms': round(elapsed * 1000, 2),
        'results': result_docs,
    })


@app.route('/api/compare', methods=['POST'])
def api_compare():
    """
    Compare all algorithms for the same query.
    Body: { "query": str, "top_k": int }
    """
    data = request.get_json()
    query = data.get('query', '').strip()
    top_k = data.get('top_k', 10)

    if not query:
        return jsonify({'error': 'Empty query'}), 400

    comparison = {}
    models = {
        'boolean': boolean_model,
        'tfidf': tfidf_model,
        'bm25': bm25_model,
        'hybrid': hybrid_model,
    }

    for name, model in models.items():
        t0 = time.time()
        results = model.search(query, top_k=top_k)
        elapsed = time.time() - t0

        result_docs = []
        for doc_id, score in results:
            doc = documents.get(doc_id, {})
            result_docs.append({
                'id': doc_id,
                'title': doc.get('title', ''),
                'author': doc.get('author', ''),
                'abstract': doc.get('abstract', '')[:300],
                'score': round(score, 6),
            })

        comparison[name] = {
            'model_name': model.get_name(),
            'num_results': len(result_docs),
            'elapsed_ms': round(elapsed * 1000, 2),
            'results': result_docs,
        }

    return jsonify(comparison)


@app.route('/api/evaluate', methods=['POST'])
def api_evaluate():
    """
    Evaluate all models on the full query set.
    Body: { "top_k": int }  (optional)
    """
    data = request.get_json() or {}
    top_k = data.get('top_k', 100)

    models = [tfidf_model, bm25_model, hybrid_model]
    results = evaluator.compare_models(models, queries, k_values=[5, 10, 20], top_k=top_k)

    return jsonify(results)


@app.route('/api/evaluate-query', methods=['POST'])
def api_evaluate_query():
    """
    Evaluate all models on a single query (if it has relevance judgments).
    Body: { "query_id": int, "top_k": int }
    """
    data = request.get_json()
    query_id = data.get('query_id')
    top_k = data.get('top_k', 100)

    if query_id is None or query_id not in queries:
        return jsonify({'error': 'Invalid or missing query_id'}), 400

    if query_id not in relevance:
        return jsonify({'error': f'No relevance judgments for query {query_id}'}), 404

    query_text = queries[query_id]
    relevant_docs = relevance[query_id]

    models_info = [
        ('tfidf', tfidf_model),
        ('bm25', bm25_model),
        ('hybrid', hybrid_model),
    ]

    results = {}
    for name, model in models_info:
        search_results = model.search(query_text, top_k=top_k)
        retrieved_ids = [doc_id for doc_id, _ in search_results]
        eval_result = evaluator.evaluate_query(query_id, retrieved_ids)
        if eval_result:
            results[name] = eval_result

    return jsonify({
        'query_id': query_id,
        'query_text': query_text,
        'num_relevant': len(relevant_docs),
        'relevant_doc_ids': sorted(relevant_docs),
        'results': results,
    })


@app.route('/api/stats', methods=['GET'])
def api_stats():
    """Get collection and index statistics."""
    index_stats = inv_index.get_stats()
    
    return jsonify({
        'collection': {
            'num_documents': len(documents),
            'num_queries': len(queries),
            'num_relevance_queries': len(relevance),
            'total_relevance_pairs': sum(len(v) for v in relevance.values()),
        },
        'index': index_stats,
    })


@app.route('/api/queries', methods=['GET'])
def api_queries():
    """List all available queries."""
    query_list = []
    for qid in sorted(queries.keys()):
        query_list.append({
            'id': qid,
            'text': queries[qid][:200],
            'has_relevance': qid in relevance,
            'num_relevant': len(relevance.get(qid, set())),
        })
    return jsonify(query_list)


@app.route('/api/document/<int:doc_id>', methods=['GET'])
def api_document(doc_id):
    """Get a single document by ID."""
    doc = documents.get(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404
    return jsonify(doc)


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == '__main__':
    initialize()
    app.run(host='0.0.0.0', port=5000, debug=False)
