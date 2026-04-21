"""
Evaluation Module
Computes Precision@K, Recall@K, MAP, and F1 metrics for retrieval models.
"""


class Evaluator:
    """
    Evaluates retrieval model performance using standard IR metrics.
    """
    
    def __init__(self, relevance_judgments):
        """
        Args:
            relevance_judgments: dict of {query_id: set(relevant_doc_ids)}
        """
        self.relevance = relevance_judgments
    
    def precision_at_k(self, retrieved, relevant, k=10):
        """
        Compute Precision@K.
        
        P@K = |relevant ∩ retrieved[:k]| / k
        
        Args:
            retrieved: Ordered list of doc_ids
            relevant: Set of relevant doc_ids
            k: Cutoff position
        
        Returns:
            Precision value (0.0 to 1.0)
        """
        if k == 0:
            return 0.0
        
        retrieved_at_k = set(retrieved[:k])
        relevant_retrieved = retrieved_at_k & relevant
        
        return len(relevant_retrieved) / k
    
    def recall_at_k(self, retrieved, relevant, k=10):
        """
        Compute Recall@K.
        
        R@K = |relevant ∩ retrieved[:k]| / |relevant|
        
        Args:
            retrieved: Ordered list of doc_ids
            relevant: Set of relevant doc_ids
            k: Cutoff position
        
        Returns:
            Recall value (0.0 to 1.0)
        """
        if not relevant:
            return 0.0
        
        retrieved_at_k = set(retrieved[:k])
        relevant_retrieved = retrieved_at_k & relevant
        
        return len(relevant_retrieved) / len(relevant)
    
    def f1_at_k(self, retrieved, relevant, k=10):
        """
        Compute F1@K = 2 * P@K * R@K / (P@K + R@K)
        """
        p = self.precision_at_k(retrieved, relevant, k)
        r = self.recall_at_k(retrieved, relevant, k)
        
        if p + r == 0:
            return 0.0
        
        return 2 * p * r / (p + r)
    
    def average_precision(self, retrieved, relevant):
        """
        Compute Average Precision for a single query.
        
        AP = (1/|relevant|) × Σ(k=1..n) [P@k × rel(k)]
        where rel(k) = 1 if document at position k is relevant, else 0
        
        Args:
            retrieved: Ordered list of doc_ids
            relevant: Set of relevant doc_ids
        
        Returns:
            Average precision value
        """
        if not relevant:
            return 0.0
        
        num_relevant_found = 0
        precision_sum = 0.0
        
        for i, doc_id in enumerate(retrieved):
            if doc_id in relevant:
                num_relevant_found += 1
                precision_at_i = num_relevant_found / (i + 1)
                precision_sum += precision_at_i
        
        return precision_sum / len(relevant)
    
    def evaluate_query(self, query_id, retrieved_doc_ids, k_values=[5, 10, 20]):
        """
        Evaluate a single query's results.
        
        Args:
            query_id: The query ID
            retrieved_doc_ids: Ordered list of retrieved document IDs
            k_values: List of K values for P@K and R@K
        
        Returns:
            Dict with metric values
        """
        relevant = self.relevance.get(query_id, set())
        
        if not relevant:
            return None
        
        result = {
            'query_id': query_id,
            'num_relevant': len(relevant),
            'num_retrieved': len(retrieved_doc_ids),
            'average_precision': round(self.average_precision(retrieved_doc_ids, relevant), 4),
        }
        
        for k in k_values:
            result[f'precision_at_{k}'] = round(self.precision_at_k(retrieved_doc_ids, relevant, k), 4)
            result[f'recall_at_{k}'] = round(self.recall_at_k(retrieved_doc_ids, relevant, k), 4)
            result[f'f1_at_{k}'] = round(self.f1_at_k(retrieved_doc_ids, relevant, k), 4)
        
        return result
    
    def evaluate_model(self, model, queries, k_values=[5, 10, 20], top_k=100):
        """
        Evaluate a model across all queries.
        
        Args:
            model: Retrieval model with a search(query, top_k) method
            queries: dict of {query_id: query_text}
            k_values: List of K values
            top_k: Number of documents to retrieve per query
        
        Returns:
            Dict with per-query and aggregated metrics
        """
        per_query_results = []
        
        for query_id, query_text in queries.items():
            if query_id not in self.relevance:
                continue
            
            results = model.search(query_text, top_k=top_k)
            retrieved_ids = [doc_id for doc_id, _ in results]
            
            eval_result = self.evaluate_query(query_id, retrieved_ids, k_values)
            if eval_result:
                per_query_results.append(eval_result)
        
        if not per_query_results:
            return {'error': 'No queries with relevance judgments found'}
        
        # Aggregate metrics
        num_queries = len(per_query_results)
        
        aggregated = {
            'model_name': model.get_name() if hasattr(model, 'get_name') else 'Unknown',
            'num_queries_evaluated': num_queries,
        }
        
        # MAP
        ap_values = [r['average_precision'] for r in per_query_results]
        aggregated['MAP'] = round(sum(ap_values) / num_queries, 4)
        
        # Mean P@K, R@K, F1@K
        for k in k_values:
            p_values = [r[f'precision_at_{k}'] for r in per_query_results]
            r_values = [r[f'recall_at_{k}'] for r in per_query_results]
            f1_values = [r[f'f1_at_{k}'] for r in per_query_results]
            
            aggregated[f'mean_precision_at_{k}'] = round(sum(p_values) / num_queries, 4)
            aggregated[f'mean_recall_at_{k}'] = round(sum(r_values) / num_queries, 4)
            aggregated[f'mean_f1_at_{k}'] = round(sum(f1_values) / num_queries, 4)
        
        return {
            'aggregated': aggregated,
            'per_query': per_query_results
        }
    
    def compare_models(self, models, queries, k_values=[5, 10, 20], top_k=100):
        """
        Compare multiple models on the same queries.
        
        Args:
            models: List of retrieval model instances
            queries: dict of {query_id: query_text}
            k_values: List of K values
            top_k: Number of documents to retrieve per query
        
        Returns:
            List of evaluation results, one per model
        """
        comparisons = []
        
        for model in models:
            print(f"  Evaluating {model.get_name()}...")
            result = self.evaluate_model(model, queries, k_values, top_k)
            comparisons.append(result)
        
        return comparisons
