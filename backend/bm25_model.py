"""
BM25 (Okapi BM25) Retrieval Model
Implements the BM25 probabilistic ranking function.
"""
import math
from collections import Counter
from backend.preprocessor import preprocess


class BM25Model:
    """
    Okapi BM25 ranking function.
    
    BM25 Score = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
    
    Where:
      - f(qi, D) = term frequency of qi in document D
      - |D| = document length
      - avgdl = average document length
      - k1 = term frequency saturation parameter (default: 1.5)
      - b = document length normalization parameter (default: 0.75)
    """
    
    def __init__(self, inverted_index, documents, k1=1.5, b=0.75):
        """
        Args:
            inverted_index: InvertedIndex instance
            documents: dict of {doc_id: doc_dict}
            k1: Term frequency saturation parameter
            b: Document length normalization parameter
        """
        self.index = inverted_index
        self.documents = documents
        self.k1 = k1
        self.b = b
        self.avgdl = inverted_index.get_avg_doc_length()
        self.num_docs = inverted_index.num_docs
    
    def _idf(self, term):
        """
        Calculate IDF using the BM25 formula:
        IDF = log((N - df + 0.5) / (df + 0.5) + 1)
        
        This avoids negative IDF values for very common terms.
        """
        df = self.index.get_document_frequency(term)
        return math.log((self.num_docs - df + 0.5) / (df + 0.5) + 1)
    
    def _score_document(self, doc_id, query_terms):
        """
        Calculate BM25 score for a single document given query terms.
        
        Args:
            doc_id: Document ID
            query_terms: List of preprocessed query terms
        
        Returns:
            BM25 score
        """
        doc_len = self.index.doc_lengths.get(doc_id, 0)
        score = 0.0
        
        query_tf = Counter(query_terms)
        
        for term, qtf in query_tf.items():
            postings = self.index.get_postings(term)
            
            if doc_id not in postings:
                continue
            
            # Term frequency in this document
            tf = len(postings[doc_id])
            
            idf = self._idf(term)
            
            # BM25 TF component with saturation and length normalization
            numerator = tf * (self.k1 + 1)
            denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avgdl)
            
            score += idf * (numerator / denominator)
        
        return score
    
    def search(self, query, top_k=10):
        """
        Search using BM25 ranking.
        
        Args:
            query: Raw query string
            top_k: Number of top results to return
        
        Returns:
            List of (doc_id, score) tuples sorted by descending score
        """
        query_terms = preprocess(query)
        
        if not query_terms:
            return []
        
        # Find candidate documents (containing at least one query term)
        candidate_docs = set()
        for term in set(query_terms):
            postings = self.index.get_postings(term)
            candidate_docs.update(postings.keys())
        
        # Score all candidates
        scores = {}
        for doc_id in candidate_docs:
            score = self._score_document(doc_id, query_terms)
            if score > 0:
                scores[doc_id] = score
        
        # Sort by score descending
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return ranked[:top_k]
    
    def get_params(self):
        """Return current BM25 parameters."""
        return {
            'k1': self.k1,
            'b': self.b,
            'avgdl': round(self.avgdl, 2),
            'num_docs': self.num_docs
        }
    
    def set_params(self, k1=None, b=None):
        """Update BM25 parameters."""
        if k1 is not None:
            self.k1 = k1
        if b is not None:
            self.b = b
    
    def get_name(self):
        return "BM25 (Okapi)"
    
    def get_description(self):
        return (f"Probabilistic ranking with term frequency saturation (k1={self.k1}) "
                f"and document length normalization (b={self.b}).")
