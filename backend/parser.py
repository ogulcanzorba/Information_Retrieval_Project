"""
CISI Dataset Parser
Parses CISI.ALL, CISI.QRY, and CISI.REL files into Python data structures.
"""
import re
import os


def parse_cisi_documents(filepath):
    """
    Parse CISI.ALL file into a list of document dictionaries.
    
    Each document has fields:
      - id: int
      - title: str
      - author: str
      - abstract: str
      - cross_references: str
    
    CISI format uses markers: .I (id), .T (title), .A (author), .W (abstract), .X (cross-refs)
    """
    documents = {}
    
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    # Split by document markers
    entries = re.split(r'\.I\s+', content)
    
    for entry in entries:
        entry = entry.strip()
        if not entry:
            continue
        
        lines = entry.split('\n')
        
        # First line is the document ID
        try:
            doc_id = int(lines[0].strip())
        except ValueError:
            continue
        
        doc = {
            'id': doc_id,
            'title': '',
            'author': '',
            'abstract': '',
            'cross_references': ''
        }
        
        # Parse sections
        current_field = None
        field_content = []
        
        for line in lines[1:]:
            stripped = line.strip()
            
            if stripped == '.T':
                if current_field and field_content:
                    doc[current_field] = ' '.join(field_content).strip()
                current_field = 'title'
                field_content = []
            elif stripped == '.A':
                if current_field and field_content:
                    doc[current_field] = ' '.join(field_content).strip()
                current_field = 'author'
                field_content = []
            elif stripped == '.W':
                if current_field and field_content:
                    doc[current_field] = ' '.join(field_content).strip()
                current_field = 'abstract'
                field_content = []
            elif stripped == '.X':
                if current_field and field_content:
                    doc[current_field] = ' '.join(field_content).strip()
                current_field = 'cross_references'
                field_content = []
            elif stripped.startswith('.B'):
                if current_field and field_content:
                    doc[current_field] = ' '.join(field_content).strip()
                current_field = None
                field_content = []
            else:
                if current_field:
                    field_content.append(line.strip())
        
        # Don't forget the last field
        if current_field and field_content:
            doc[current_field] = ' '.join(field_content).strip()
        
        documents[doc_id] = doc
    
    return documents


def parse_cisi_queries(filepath):
    """
    Parse CISI.QRY file into a dict of {query_id: query_text}.
    """
    queries = {}
    
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    entries = re.split(r'\.I\s+', content)
    
    for entry in entries:
        entry = entry.strip()
        if not entry:
            continue
        
        lines = entry.split('\n')
        
        try:
            query_id = int(lines[0].strip())
        except ValueError:
            continue
        
        current_field = None
        field_content = []
        
        for line in lines[1:]:
            stripped = line.strip()
            if stripped == '.W':
                current_field = 'text'
                field_content = []
            elif re.match(r'^\.[A-Z]\b', stripped):
                # Real CISI marker (e.g. .T, .A, .B, .X) — terminate the .W body.
                if current_field == 'text' and field_content:
                    break
            else:
                if current_field == 'text':
                    field_content.append(line.strip())
        
        queries[query_id] = ' '.join(field_content).strip()
    
    return queries


def parse_cisi_relevance(filepath):
    """
    Parse CISI.REL file into a dict of {query_id: set(doc_ids)}.
    
    Each line typically has format: query_id  doc_id  ...
    """
    relevance = {}
    
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 2:
                try:
                    query_id = int(parts[0].strip())
                    doc_id = int(parts[1].strip())
                    
                    if query_id not in relevance:
                        relevance[query_id] = set()
                    relevance[query_id].add(doc_id)
                except ValueError:
                    continue
    
    return relevance


def load_cisi_dataset(data_dir):
    """
    Load the entire CISI dataset from the given directory.
    
    Returns:
        documents: dict of {doc_id: doc_dict}
        queries: dict of {query_id: query_text}
        relevance: dict of {query_id: set(doc_ids)}
    """
    docs_path = os.path.join(data_dir, 'CISI.ALL')
    queries_path = os.path.join(data_dir, 'CISI.QRY')
    rel_path = os.path.join(data_dir, 'CISI.REL')
    
    documents = parse_cisi_documents(docs_path)
    queries = parse_cisi_queries(queries_path)
    relevance = parse_cisi_relevance(rel_path)
    
    print(f"[Parser] Loaded {len(documents)} documents, {len(queries)} queries, "
          f"{len(relevance)} query-relevance mappings")
    
    return documents, queries, relevance


if __name__ == '__main__':
    import sys
    data_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'cisi_dataset')
    docs, queries, rel = load_cisi_dataset(data_dir)
    
    # Print sample
    sample_id = list(docs.keys())[0]
    print(f"\n--- Sample Document (ID={sample_id}) ---")
    print(f"Title: {docs[sample_id]['title'][:100]}")
    print(f"Author: {docs[sample_id]['author'][:100]}")
    print(f"Abstract: {docs[sample_id]['abstract'][:200]}...")
    
    print(f"\n--- Sample Query (ID=1) ---")
    if 1 in queries:
        print(f"Query: {queries[1][:200]}")
    
    print(f"\n--- Sample Relevance (Query 1) ---")
    if 1 in rel:
        print(f"Relevant docs: {sorted(rel[1])[:20]}")
