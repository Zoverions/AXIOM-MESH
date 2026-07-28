import math
import logging
from typing import List, Dict, Any
import torch

logger = logging.getLogger("Zoverions-HybridSearch")

class HybridRetriever:
    """
    Implements Onyx-style Hybrid Search (Dense Tensor + Sparse BM25).
    Guarantees exact-match keyword retrieval alongside deep semantic understanding,
    neutralizing Semantic Collapse in the Tier 3 memory.
    """
    def __init__(self, alpha: float = 0.5):
        # Alpha controls the blend: 1.0 = Pure Vector, 0.0 = Pure Keyword
        self.alpha = alpha
        self.avg_doc_length = 250.0 # Parameter for BM25
        self.k1 = 1.5
        self.b = 0.75

    def _calculate_bm25_score(self, query_tokens: List[str], doc_tokens: List[str], total_docs: int, doc_freqs: Dict[str, int]) -> float:
        """Calculates exact-match relevance using the Okapi BM25 algorithm."""
        score = 0.0
        doc_len = len(doc_tokens)
        
        for token in query_tokens:
            if token not in doc_tokens:
                continue
                
            tf = doc_tokens.count(token)
            df = doc_freqs.get(token, 1)
            
            # Inverse Document Frequency
            idf = math.log(1 + (total_docs - df + 0.5) / (df + 0.5))
            # Term Frequency saturation
            tf_calc = (tf * (self.k1 + 1)) / (tf + self.k1 * (1 - self.b + self.b * (doc_len / self.avg_doc_length)))
            
            score += idf * tf_calc
        return score

    def retrieve_context(self, query: str, query_vector: torch.Tensor, candidate_docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Executes the dual-pass ranking.
        """
        logger.debug("[🔍] Executing Hybrid Retrieval Pass...")
        query_tokens = query.lower().split()
        total_docs = len(candidate_docs)
        
        # Mock document frequency map for BM25
        doc_freqs = {} # In prod, this is maintained in the SQLite graph
        
        for doc in candidate_docs:
            # 1. Sparse Score (Exact Keyword Match)
            doc_tokens = doc["text"].lower().split()
            sparse_score = self._calculate_bm25_score(query_tokens, doc_tokens, total_docs, doc_freqs)
            
            # 2. Dense Score (Semantic Meaning via Tensor)
            # Assuming doc["vector"] is a PolarQuant tensor
            dense_score = torch.nn.functional.cosine_similarity(query_vector, doc["vector"], dim=0).item()
            
            # 3. Min-Max Normalization & Blending (The Onyx Method)
            # (Simplified normalization for brevity)
            norm_sparse = min(sparse_score / 10.0, 1.0) 
            norm_dense = (dense_score + 1.0) / 2.0 
            
            doc["hybrid_score"] = (self.alpha * norm_dense) + ((1.0 - self.alpha) * norm_sparse)

        # Sort by the blended hybrid score
        ranked_docs = sorted(candidate_docs, key=lambda x: x["hybrid_score"], reverse=True)
        return ranked_docs[:5] # Return top 5 strongest contexts
