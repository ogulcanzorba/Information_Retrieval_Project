"""
Hybrid Retrieval Model
Combines BM25 and TF-IDF scores with a tunable alpha parameter.
"""
from backend.bm25_model import BM25Model
from backend.tfidf_model import TFIDFModel


class HybridModel:
    """
    Hybrid scoring that combines BM25 and TF-IDF scores.
    
    Hybrid Score = α × BM25_normalized + (1 - α) × TF-IDF_normalized
    
    Scores are min-max normalized before combination to ensure fair weighting.
    """
    
    def __init__(self, bm25_model, tfidf_model, alpha=0.6):
        """
        Args:
            bm25_model: BM25Model instance
            tfidf_model: TFIDFModel instance
            alpha: Weight for BM25 score (0.0 to 1.0), default 0.6
        """
        self.bm25 = bm25_model
        self.tfidf = tfidf_model
        self.alpha = alpha
    
    def _normalize_scores(self, results):
        """
        Min-max normalize scores to [0, 1] range.
        
        Args:
            results: List of (doc_id, score) tuples
        
        Returns:
            dict of {doc_id: normalized_score}
        """
        if not results:
            return {}
        
        scores = [s for _, s in results]
        min_score = min(scores)
        max_score = max(scores)
        score_range = max_score - min_score
        
        if score_range == 0:
            return {doc_id: 1.0 for doc_id, _ in results}
        
        return {
            doc_id: (score - min_score) / score_range
            for doc_id, score in results
        }
    
    def search(self, query, top_k=10, alpha=None, k1=None, b=None):
        """
        Search using hybrid BM25 + TF-IDF scoring. alpha/k1/b can be overridden
        per call without mutating the model's defaults.
        """
        a = self.alpha if alpha is None else max(0.0, min(1.0, alpha))

        fetch_k = min(top_k * 5, 200)
        bm25_results = self.bm25.search(query, top_k=fetch_k, k1=k1, b=b)
        tfidf_results = self.tfidf.search(query, top_k=fetch_k)

        if not bm25_results and not tfidf_results:
            return []

        bm25_normalized = self._normalize_scores(bm25_results)
        tfidf_normalized = self._normalize_scores(tfidf_results)

        all_doc_ids = set(bm25_normalized.keys()) | set(tfidf_normalized.keys())

        combined_scores = {}
        for doc_id in all_doc_ids:
            bm25_score = bm25_normalized.get(doc_id, 0.0)
            tfidf_score = tfidf_normalized.get(doc_id, 0.0)

            combined_scores[doc_id] = a * bm25_score + (1 - a) * tfidf_score

        ranked = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
        return ranked[:top_k]
    
    def get_name(self):
        return "Hybrid (BM25 + TF-IDF)"
    
    def get_description(self):
        return (f"Combines BM25 (weight={self.alpha:.2f}) and TF-IDF "
                f"(weight={1 - self.alpha:.2f}) with min-max normalized scores.")
