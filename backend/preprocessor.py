"""
Text Preprocessing Pipeline
Handles tokenization, stopword removal, and stemming for the IR system.
"""
import re
import nltk
from nltk.stem import PorterStemmer
from nltk.corpus import stopwords


# Ensure NLTK data is available
def ensure_nltk_data():
    """Download required NLTK data if not present."""
    for resource in ['punkt', 'stopwords', 'punkt_tab']:
        try:
            nltk.data.find(f'corpora/{resource}' if resource == 'stopwords' else f'tokenizers/{resource}')
        except LookupError:
            nltk.download(resource, quiet=True)


ensure_nltk_data()

# Initialize stemmer and stopwords
_stemmer = PorterStemmer()
_stop_words = set(stopwords.words('english'))

# Additional domain-specific stopwords for IR literature
_extra_stopwords = {
    'also', 'however', 'thus', 'therefore', 'may', 'would', 'could',
    'shall', 'might', 'must', 'various', 'many', 'several', 'one',
    'two', 'three', 'four', 'five', 'used', 'using', 'use', 'paper',
    'discussed', 'described', 'presented'
}
_stop_words.update(_extra_stopwords)


def tokenize(text):
    """
    Tokenize text into a list of lowercase alphabetic tokens.
    
    Args:
        text: Input string
    
    Returns:
        List of tokens
    """
    if not text:
        return []
    
    text = text.lower()
    tokens = re.findall(r'\b[a-z]{2,}\b', text)
    return tokens


def remove_stopwords(tokens):
    """
    Remove English stopwords from token list.
    
    Args:
        tokens: List of tokens
    
    Returns:
        Filtered list without stopwords
    """
    return [t for t in tokens if t not in _stop_words]


def stem_tokens(tokens):
    """
    Apply Porter Stemmer to each token.
    
    Args:
        tokens: List of tokens
    
    Returns:
        List of stemmed tokens
    """
    return [_stemmer.stem(t) for t in tokens]


def preprocess(text, do_stem=True, do_remove_stopwords=True):
    """
    Full preprocessing pipeline: tokenize → stopword removal → stemming.
    
    Args:
        text: Input string
        do_stem: Whether to apply stemming (default: True)
        do_remove_stopwords: Whether to remove stopwords (default: True)
    
    Returns:
        List of preprocessed tokens
    """
    tokens = tokenize(text)
    
    if do_remove_stopwords:
        tokens = remove_stopwords(tokens)
    
    if do_stem:
        tokens = stem_tokens(tokens)
    
    return tokens


def preprocess_query(query_text, do_stem=True, do_remove_stopwords=True):
    """
    Preprocess a search query with the same pipeline as documents.
    
    Args:
        query_text: The raw query string
        do_stem: Whether to stem
        do_remove_stopwords: Whether to remove stopwords
    
    Returns:
        List of preprocessed query tokens
    """
    return preprocess(query_text, do_stem, do_remove_stopwords)


def get_config_signature():
    """
    Return a stable fingerprint of the preprocessing config.
    If anyone changes stopwords, the tokenizer regex, or the stemmer,
    the cached inverted index becomes invalid.
    """
    import hashlib
    parts = [
        'tokenizer:' + r'\b[a-z]{2,}\b',
        'stemmer:' + _stemmer.__class__.__name__,
        'stopwords:' + ','.join(sorted(_stop_words)),
    ]
    blob = '|'.join(parts).encode('utf-8')
    return hashlib.sha256(blob).hexdigest()[:16]


def get_document_text(doc):
    """
    Combine document title and abstract for indexing.
    
    Args:
        doc: Document dict with 'title' and 'abstract' fields
    
    Returns:
        Combined text string
    """
    parts = []
    if doc.get('title'):
        parts.append(doc['title'])
    if doc.get('abstract'):
        parts.append(doc['abstract'])
    return ' '.join(parts)


if __name__ == '__main__':
    # Demo
    sample = "Information retrieval systems are designed to help users find relevant documents."
    print(f"Original: {sample}")
    print(f"Tokens: {tokenize(sample)}")
    print(f"No stopwords: {remove_stopwords(tokenize(sample))}")
    print(f"Stemmed: {stem_tokens(remove_stopwords(tokenize(sample)))}")
    print(f"Full pipeline: {preprocess(sample)}")
