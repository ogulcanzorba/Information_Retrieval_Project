"""
Boolean Retrieval Model
Supports AND, OR, NOT queries using the inverted index.
"""
import re
from backend.preprocessor import preprocess


class BooleanModel:
    """
    Boolean retrieval model with support for AND, OR, NOT operators.
    Parses queries and performs set operations on posting lists.
    """
    
    def __init__(self, inverted_index, documents):
        """
        Args:
            inverted_index: InvertedIndex instance
            documents: dict of {doc_id: doc_dict}
        """
        self.index = inverted_index
        self.documents = documents
        self.all_doc_ids = set(documents.keys())
    
    def search(self, query, top_k=10):
        """
        Execute a boolean query and return matching documents.
        
        Supports:
          - AND: "information AND retrieval"
          - OR: "library OR database"
          - NOT: "NOT obsolete"
          - Parentheses: "(cat OR dog) AND NOT fish"
          - Plain text (treated as AND of all terms)
        
        Args:
            query: Boolean query string
            top_k: Maximum number of results to return
        
        Returns:
            List of (doc_id, score) tuples where score is 1.0 for all matches
        """
        query = query.strip()
        
        if not query:
            return []
        
        # Check if query contains boolean operators
        has_operators = bool(re.search(r'\b(AND|OR|NOT)\b', query))
        
        if has_operators:
            result_set = self._evaluate_boolean(query)
        else:
            # Treat as AND of all terms
            result_set = self._and_query(query)
        
        # Convert to list of (doc_id, score) — Boolean has no ranking
        results = [(doc_id, 1.0) for doc_id in sorted(result_set)]
        return results[:top_k]
    
    def _evaluate_boolean(self, query):
        """
        Parse and evaluate a boolean expression.
        Handles AND, OR, NOT with proper precedence using recursive descent.
        """
        tokens = self._tokenize_query(query)
        pos = [0]  # Use list for mutability in nested functions
        
        def parse_or():
            left = parse_and()
            while pos[0] < len(tokens) and tokens[pos[0]] == 'OR':
                pos[0] += 1
                right = parse_and()
                left = left | right
            return left
        
        def parse_and():
            left = parse_not()
            while pos[0] < len(tokens) and tokens[pos[0]] == 'AND':
                pos[0] += 1
                right = parse_not()
                left = left & right
            return left
        
        def parse_not():
            if pos[0] < len(tokens) and tokens[pos[0]] == 'NOT':
                pos[0] += 1
                operand = parse_primary()
                return self.all_doc_ids - operand
            return parse_primary()
        
        def parse_primary():
            if pos[0] < len(tokens) and tokens[pos[0]] == '(':
                pos[0] += 1  # skip '('
                result = parse_or()
                if pos[0] < len(tokens) and tokens[pos[0]] == ')':
                    pos[0] += 1  # skip ')'
                return result
            
            if pos[0] < len(tokens):
                term = tokens[pos[0]]
                pos[0] += 1
                # Preprocess the term
                processed = preprocess(term)
                if processed:
                    postings = self.index.get_postings(processed[0])
                    return set(postings.keys())
                return set()
            
            return set()
        
        return parse_or()
    
    def _tokenize_query(self, query):
        """
        Tokenize a boolean query into terms, operators, and parentheses.
        """
        tokens = []
        i = 0
        query = query.strip()
        
        while i < len(query):
            if query[i] in '()':
                tokens.append(query[i])
                i += 1
            elif query[i].isspace():
                i += 1
            else:
                # Read a word
                j = i
                while j < len(query) and not query[j].isspace() and query[j] not in '()':
                    j += 1
                word = query[i:j]
                tokens.append(word)
                i = j
        
        return tokens
    
    def _and_query(self, query):
        """
        Treat plain text query as AND of all preprocessed terms.
        """
        terms = preprocess(query)
        if not terms:
            return set()
        
        # Start with the posting list of the first term
        result = set(self.index.get_postings(terms[0]).keys())
        
        # Intersect with remaining terms
        for term in terms[1:]:
            postings = set(self.index.get_postings(term).keys())
            result = result & postings
        
        return result
    
    def get_name(self):
        return "Boolean Retrieval"
    
    def get_description(self):
        return ("Set-based retrieval using AND, OR, NOT operators. "
                "No ranking — all matched documents are equally relevant.")
