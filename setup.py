"""
Setup Script
Downloads the CISI dataset and builds the inverted index.
Run this once before starting the API.
"""
import os
import sys
import requests

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


CISI_BASE_URL = "https://raw.githubusercontent.com/dbvis-ukon/movekit/master/tests/cisi/"
CISI_FILES = {
    'CISI.ALL': 'https://raw.githubusercontent.com/selva86/datasets/master/CISI.ALL',
    'CISI.QRY': 'https://raw.githubusercontent.com/selva86/datasets/master/CISI.QRY',
    'CISI.REL': 'https://raw.githubusercontent.com/selva86/datasets/master/CISI.REL',
}

# Alternative URLs (fallback)
CISI_ALT_URLS = {
    'CISI.ALL': 'https://ir.dcs.gla.ac.uk/resources/test_collections/cisi/CISI.ALL',
    'CISI.QRY': 'https://ir.dcs.gla.ac.uk/resources/test_collections/cisi/CISI.QRY',
    'CISI.REL': 'https://ir.dcs.gla.ac.uk/resources/test_collections/cisi/CISI.REL',
}


def download_file(url, dest_path, alt_url=None):
    """Download a file from URL to dest_path, with optional fallback URL."""
    if os.path.exists(dest_path):
        print(f"  [SKIP] {os.path.basename(dest_path)} already exists")
        return True

    print(f"  [DOWNLOAD] {os.path.basename(dest_path)} ...")

    for attempt_url in [url, alt_url]:
        if attempt_url is None:
            continue
        try:
            response = requests.get(attempt_url, timeout=30)
            response.raise_for_status()
            with open(dest_path, 'w', encoding='utf-8') as f:
                f.write(response.text)
            print(f"    [OK] Downloaded from {attempt_url}")
            return True
        except Exception as e:
            print(f"    [FAIL] Failed from {attempt_url}: {e}")

    return False


def download_cisi_dataset(data_dir):
    """Download all CISI dataset files."""
    os.makedirs(data_dir, exist_ok=True)

    success = True
    for filename, url in CISI_FILES.items():
        dest = os.path.join(data_dir, filename)
        alt = CISI_ALT_URLS.get(filename)
        if not download_file(url, dest, alt):
            print(f"  [ERROR] Could not download {filename}")
            success = False

    return success


def build_index(data_dir, index_dir):
    """Parse the dataset and build the inverted index."""
    from backend.parser import load_cisi_dataset
    from backend.inverted_index import InvertedIndex
    from backend.preprocessor import preprocess, get_document_text

    documents, queries, relevance = load_cisi_dataset(data_dir)

    idx = InvertedIndex()
    idx.build(documents)

    os.makedirs(index_dir, exist_ok=True)
    index_path = os.path.join(index_dir, 'inverted_index.json')
    idx.save(index_path)

    # Print some stats
    stats = idx.get_stats()
    print(f"\n  Index Statistics:")
    print(f"    Documents: {stats['num_documents']}")
    print(f"    Vocabulary: {stats['vocabulary_size']} unique terms")
    print(f"    Total tokens: {stats['total_tokens']}")
    print(f"    Avg doc length: {stats['avg_doc_length']} tokens")

    return True


def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(project_root, 'cisi_dataset')
    index_dir = os.path.join(project_root, 'index_cache')

    print("=" * 50)
    print("  CISI Dataset Setup")
    print("=" * 50)

    # Step 1: Download
    print("\n[Step 1] Downloading CISI dataset...")
    if not download_cisi_dataset(data_dir):
        print("\n[ERROR] Failed to download dataset.")
        print("Please manually download CISI.ALL, CISI.QRY, CISI.REL")
        print(f"and place them in: {data_dir}")
        sys.exit(1)

    # Step 2: Build index
    print("\n[Step 2] Building inverted index...")
    build_index(data_dir, index_dir)

    print("\n" + "=" * 50)
    print("  Setup complete! Run the API with:")
    print("  python backend/api.py")
    print("=" * 50)


if __name__ == '__main__':
    main()
