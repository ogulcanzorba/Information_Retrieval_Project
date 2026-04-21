"""
TF-IDF Vector Space Model
Implements TF-IDF weighting with cosine similarity ranking.
"""
import math
import numpy as np
from collections import Counter, defaultdict
from backend.preprocessor import preprocess, get_document_text


class TFIDFModel:
    """
    Vector Space Model using TF-IDF weighting and cosine similarity.
    Built from scratch (no sklearn dependency for the core algorithm).
    """
    
    def __init__(self, inverted_index, documents):
        """
        Args:
            inverted_index: InvertedIndex instance
            documents: dict of {doc_id: doc_dict}
        """
        self.index = inverted_index
        self.documents = documents
        self.doc_ids = sorted(documents.keys())
        self.doc_vectors = {}
        self.doc_norms = {}
        
        # Pre-compute document vectors
        self._build_doc_vectors()
    
    def _build_doc_vectors(self):
        """
        Pre-compute TF-IDF vectors for all documents.
        Uses log-normalized TF and IDF.
        """
        for doc_id in self.doc_ids:
            tokens = self.index.doc_tokens.get(doc_id, [])
            tf_counts = Counter(tokens)
            
            vector = {}
            for term, count in tf_counts.items():
                # Log-normalized TF: 1 + log10(tf)
                tf = 1 + math.log10(count) if count > 0 else 0
                idf = self.index.get_idf(term)
                vector[term] = tf * idf
            
            # Compute norm for cosine similarity
            norm = math.sqrt(sum(v ** 2 for v in vector.values()))
            
            self.doc_vectors[doc_id] = vector
            self.doc_norms[doc_id] = norm
    
    def search(self, query, top_k=10):
        """
        Search using TF-IDF cosine similarity.
        
        Args:
            query: Raw query string
            top_k: Number of top results to return
        
        Returns:
            List of (doc_id, score) tuples sorted by descending score
        """
        # Preprocess the query
        query_tokens = preprocess(query)
        if not query_tokens:
            return []
        
        # Build query vector
        query_tf = Counter(query_tokens)
        query_vector = {}
        query_norm_sq = 0
        
        for term, count in query_tf.items():
            tf = 1 + math.log10(count) if count > 0 else 0
            idf = self.index.get_idf(term)
            weight = tf * idf
            query_vector[term] = weight
            query_norm_sq += weight ** 2
        
        query_norm = math.sqrt(query_norm_sq)
        
        if query_norm == 0:
            return []
        
        # Compute cosine similarity for documents containing at least one query term
        scores = {}
        
        # Only iterate over documents that contain at least one query term
        candidate_docs = set()
        for term in query_vector:
            postings = self.index.get_postings(term)
            candidate_docs.update(postings.keys())
        
        for doc_id in candidate_docs:
            doc_vector = self.doc_vectors.get(doc_id, {})
            doc_norm = self.doc_norms.get(doc_id, 0)
            
            if doc_norm == 0:
                continue
            
            # Dot product (only over query terms)
            dot_product = sum(
                query_vector.get(term, 0) * doc_vector.get(term, 0)
                for term in query_vector
            )
            
            cosine_sim = dot_product / (query_norm * doc_norm)
            
            if cosine_sim > 0:
                scores[doc_id] = cosine_sim
        
        # Sort by score descending
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return ranked[:top_k]
    
    def get_name(self):
        return "TF-IDF Vector Space"
    
    def get_description(self):
        return ("Uses log-normalized TF × IDF weighting with cosine similarity. "
                "Ranks documents by vector space proximity to the query.")
