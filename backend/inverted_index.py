"""
Inverted Index
Builds and manages an inverted index for the document collection.
"""
import json
import os
import math
from collections import defaultdict, Counter
from backend.preprocessor import preprocess, get_document_text, get_config_signature


class InvertedIndex:
    """
    Positional inverted index mapping terms → {doc_id: [positions]}.
    Also maintains document frequency (DF) and collection statistics.
    """
    
    def __init__(self):
        # term -> {doc_id: [pos1, pos2, ...]}
        self.index = defaultdict(lambda: defaultdict(list))
        # doc_id -> number of tokens in the document
        self.doc_lengths = {}
        # Total number of documents
        self.num_docs = 0
        # Vocabulary
        self.vocabulary = set()
        # Total tokens in collection
        self.total_tokens = 0
        # doc_id -> preprocessed token list (for BM25 etc.)
        self.doc_tokens = {}
    
    def build(self, documents):
        """
        Build the inverted index from the document collection.
        
        Args:
            documents: dict of {doc_id: doc_dict} with 'title' and 'abstract' fields
        """
        self.num_docs = len(documents)
        
        for doc_id, doc in documents.items():
            text = get_document_text(doc)
            tokens = preprocess(text)
            
            self.doc_tokens[doc_id] = tokens
            self.doc_lengths[doc_id] = len(tokens)
            self.total_tokens += len(tokens)
            
            # Build positional index
            for position, token in enumerate(tokens):
                self.index[token][doc_id].append(position)
                self.vocabulary.add(token)
        
        # Convert defaultdict to regular dict for serialization
        self.index = {term: dict(postings) for term, postings in self.index.items()}
        
        print(f"[InvertedIndex] Built index: {len(self.vocabulary)} terms, "
              f"{self.num_docs} documents, {self.total_tokens} total tokens")
    
    def get_postings(self, term):
        """
        Get the posting list for a term.
        
        Args:
            term: preprocessed term
        
        Returns:
            dict of {doc_id: [positions]} or empty dict
        """
        raw = self.index.get(term, {})
        return {int(k): v for k, v in raw.items()}
    
    def get_document_frequency(self, term):
        """
        Get the document frequency of a term.
        
        Args:
            term: preprocessed term
        
        Returns:
            Number of documents containing the term
        """
        return len(self.index.get(term, {}))
    
    def get_collection_frequency(self, term):
        """
        Get the total number of times a term appears across all documents.
        """
        postings = self.index.get(term, {})
        return sum(len(positions) for positions in postings.values())
    
    def get_idf(self, term):
        """
        Calculate the IDF (Inverse Document Frequency) for a term.
        
        Uses log10(N / df) formula.
        """
        df = self.get_document_frequency(term)
        if df == 0:
            return 0
        return math.log10(self.num_docs / df)
    
    def get_avg_doc_length(self):
        """Get the average document length in the collection."""
        if not self.doc_lengths:
            return 0
        return self.total_tokens / self.num_docs
    
    def get_stats(self):
        """Get index statistics as a dictionary."""
        df_values = [len(postings) for postings in self.index.values()]
        cf_values = [sum(len(p) for p in postings.values()) for postings in self.index.values()]
        
        return {
            'num_documents': self.num_docs,
            'vocabulary_size': len(self.vocabulary),
            'total_tokens': self.total_tokens,
            'avg_doc_length': round(self.get_avg_doc_length(), 2),
            'min_doc_length': min(self.doc_lengths.values()) if self.doc_lengths else 0,
            'max_doc_length': max(self.doc_lengths.values()) if self.doc_lengths else 0,
            'avg_df': round(sum(df_values) / len(df_values), 2) if df_values else 0,
            'max_df': max(df_values) if df_values else 0,
            'avg_cf': round(sum(cf_values) / len(cf_values), 2) if cf_values else 0,
            'top_terms': self._get_top_terms(20),
            'doc_length_distribution': self._get_doc_length_distribution(),
        }
    
    def _get_top_terms(self, n=20):
        """Get the top N terms by document frequency."""
        term_df = [(term, len(postings)) for term, postings in self.index.items()]
        term_df.sort(key=lambda x: x[1], reverse=True)
        return [{'term': t, 'df': df} for t, df in term_df[:n]]
    
    def _get_doc_length_distribution(self):
        """Get document length distribution for visualization."""
        if not self.doc_lengths:
            return []
        
        lengths = list(self.doc_lengths.values())
        # Create histogram bins
        min_len = min(lengths)
        max_len = max(lengths)
        num_bins = 20
        bin_size = max(1, (max_len - min_len) // num_bins)
        
        bins = defaultdict(int)
        for length in lengths:
            bin_key = ((length - min_len) // bin_size) * bin_size + min_len
            bins[bin_key] += 1
        
        return [{'length': k, 'count': v} for k, v in sorted(bins.items())]
    
    def save(self, filepath):
        """Save the index to a JSON file. Vocabulary is sorted for deterministic output."""
        data = {
            'config_signature': get_config_signature(),
            'index': self.index,
            'doc_lengths': {str(k): v for k, v in self.doc_lengths.items()},
            'num_docs': self.num_docs,
            'total_tokens': self.total_tokens,
            'vocabulary': sorted(self.vocabulary),
        }

        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, sort_keys=True)

        file_size_mb = os.path.getsize(filepath) / (1024 * 1024)
        print(f"[InvertedIndex] Saved index to {filepath} ({file_size_mb:.1f} MB)")

    def load(self, filepath):
        """
        Load the index from a JSON file.

        Returns True if the cache matches the current preprocessor config,
        False if it's stale (caller should rebuild).
        """
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        cached_sig = data.get('config_signature')
        current_sig = get_config_signature()
        if cached_sig != current_sig:
            print(f"[InvertedIndex] Cache config mismatch "
                  f"(cached={cached_sig}, current={current_sig}). Rebuild required.")
            return False

        self.index = data['index']
        self.doc_lengths = {int(k): v for k, v in data['doc_lengths'].items()}
        self.num_docs = data['num_docs']
        self.total_tokens = data['total_tokens']
        self.vocabulary = set(data['vocabulary'])

        print(f"[InvertedIndex] Loaded index: {len(self.vocabulary)} terms, {self.num_docs} docs")
        return True
