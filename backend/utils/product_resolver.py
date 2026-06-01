import re
from typing import Dict, Any, List, Optional

def normalize_text(text: str) -> str:
    """
    Remove all non-alphanumeric characters and lowercase the string.
    """
    if not text:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', text).lower()

def resolve_product_by_query(query: str, all_products: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Resolves the best matching product from the database based on query text.
    Uses normalized matching and a weighted scoring system:
    - Exact normalized model number match in query: 100 points
    - Exact normalized product name match in query: 80 points
    - Model number token match: 15 points per token
    - Manufacturer match: 20 points
    - Product name token match: 5 points per token
    """
    if not query or not all_products:
        return None
        
    normalized_query = normalize_text(query)
    best_product = None
    best_score = 0
    
    query_tokens = set(re.findall(r'[a-zA-Z0-9]+', query.lower()))
    
    for p in all_products:
        score = 0
        model_norm = normalize_text(p["model_number"])
        name_norm = normalize_text(p["product_name"])
        man_norm = normalize_text(p["manufacturer"])
        
        # 1. Exact normalized matches
        if model_norm and model_norm in normalized_query:
            score += 100
        if name_norm and name_norm in normalized_query:
            score += 80
            
        # 2. Manufacturer match (case-insensitive word match)
        if man_norm and man_norm in query_tokens:
            score += 20
            
        # 3. Model tokens match
        model_tokens = [tok.lower() for tok in re.findall(r'[a-zA-Z0-9]+', p["model_number"]) if len(tok) > 1]
        for tok in model_tokens:
            if tok in query_tokens:
                score += 15
                
        # 4. Product name tokens match
        name_tokens = [tok.lower() for tok in re.findall(r'[a-zA-Z0-9]+', p["product_name"]) if len(tok) > 2]
        for tok in name_tokens:
            if tok in query_tokens:
                score += 5
                
        if score > best_score:
            best_score = score
            best_product = p
            
    # Return best product if it exceeds minimum score threshold
    if best_product and best_score >= 10:
        # Include the matched score for confidence calculation
        best_product["match_score"] = best_score
        return best_product
        
    return None
