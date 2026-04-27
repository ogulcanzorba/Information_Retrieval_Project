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
    
    DEFAULT_K1 = 1.5
    DEFAULT_B = 0.75

    def __init__(self, inverted_index, documents, k1=DEFAULT_K1, b=DEFAULT_B):
        """
        Args:
            inverted_index: InvertedIndex instance
            documents: dict of {doc_id: doc_dict}
            k1: Default term frequency saturation parameter
            b: Default document length normalization parameter
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

    def _score_document(self, doc_id, query_terms, k1, b):
        """
        Calculate BM25 score for a single document given query terms.
        Takes k1 and b explicitly so the singleton's defaults aren't mutated.
        """
        doc_len = self.index.doc_lengths.get(doc_id, 0)
        score = 0.0

        query_tf = Counter(query_terms)

        for term, qtf in query_tf.items():
            postings = self.index.get_postings(term)

            if doc_id not in postings:
                continue

            tf = len(postings[doc_id])
            idf = self._idf(term)

            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * doc_len / self.avgdl)

            score += idf * (numerator / denominator)

        return score

    def search(self, query, top_k=10, k1=None, b=None):
        """
        Search using BM25 ranking. k1 and b can be overridden per call
        without mutating the model's defaults.
        """
        query_terms = preprocess(query)

        if not query_terms:
            return []

        effective_k1 = self.k1 if k1 is None else k1
        effective_b = self.b if b is None else b

        candidate_docs = set()
        for term in set(query_terms):
            postings = self.index.get_postings(term)
            candidate_docs.update(postings.keys())

        scores = {}
        for doc_id in candidate_docs:
            score = self._score_document(doc_id, query_terms, effective_k1, effective_b)
            if score > 0:
                scores[doc_id] = score

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

    def get_name(self):
        return "BM25 (Okapi)"

    def get_description(self):
        return (f"Probabilistic ranking with term frequency saturation (default k1={self.k1}) "
                f"and document length normalization (default b={self.b}).")
