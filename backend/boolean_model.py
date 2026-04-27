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
    
    OPERATORS = {'AND', 'OR', 'NOT'}

    def search(self, query, top_k=10):
        """
        Execute a boolean query and return matching documents.

        Supports:
          - AND / OR / NOT (case-insensitive)
          - Parentheses
          - Implicit AND before NOT: "cat NOT dog" → "cat AND NOT dog"
          - Plain text (treated as AND of all terms)
        """
        query = query.strip()

        if not query:
            return []

        # Case-insensitive operator detection
        has_operators = bool(re.search(r'\b(AND|OR|NOT)\b', query, re.IGNORECASE))

        if has_operators:
            result_set = self._evaluate_boolean(query)
        else:
            result_set = self._and_query(query)

        results = [(doc_id, 1.0) for doc_id in sorted(result_set)]
        return results[:top_k]

    def _evaluate_boolean(self, query):
        """
        Parse and evaluate a boolean expression.
        Handles AND, OR, NOT with proper precedence using recursive descent.
        """
        tokens = self._tokenize_query(query)
        pos = [0]

        def peek():
            return tokens[pos[0]] if pos[0] < len(tokens) else None

        def parse_or():
            left = parse_and()
            while peek() == 'OR':
                pos[0] += 1
                right = parse_and()
                left = left | right
            return left

        def parse_and():
            left = parse_not()
            # Loop while next token is AND, NOT (implicit AND), or a term/paren
            # (implicit-AND between two terms is intentionally not enabled — only
            # implicit AND before NOT, which is the common case "cat NOT dog").
            while True:
                tok = peek()
                if tok == 'AND':
                    pos[0] += 1
                    right = parse_not()
                    left = left & right
                elif tok == 'NOT':
                    # Implicit AND: "cat NOT dog" → "cat AND NOT dog"
                    right = parse_not()
                    left = left & right
                else:
                    break
            return left

        def parse_not():
            if peek() == 'NOT':
                pos[0] += 1
                # Bare 'NOT' with no operand — treat as empty rather than
                # returning the entire collection.
                if peek() is None or peek() in self.OPERATORS or peek() == ')':
                    return set()
                operand = parse_primary()
                return self.all_doc_ids - operand
            return parse_primary()

        def parse_primary():
            tok = peek()
            if tok == '(':
                pos[0] += 1
                result = parse_or()
                if peek() == ')':
                    pos[0] += 1
                # Unmatched paren: just stop, don't crash.
                return result

            if tok is None:
                return set()

            pos[0] += 1
            processed = preprocess(tok)
            if processed:
                postings = self.index.get_postings(processed[0])
                return set(postings.keys())
            return set()

        return parse_or()

    def _tokenize_query(self, query):
        """
        Tokenize a boolean query into terms, operators (uppercased), and parens.
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
                j = i
                while j < len(query) and not query[j].isspace() and query[j] not in '()':
                    j += 1
                word = query[i:j]
                # Normalize operators to uppercase; leave terms alone.
                if word.upper() in self.OPERATORS:
                    tokens.append(word.upper())
                else:
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
