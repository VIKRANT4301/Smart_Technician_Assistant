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
    Uses normalized matching, a weighted scoring system, and synonyms:
    - Exact normalized model number match in query: 100 points
    - Exact normalized product name match in query: 80 points
    - Model number token match: 40 points per token
    - Manufacturer match: 30 points
    - Product name token match: 25 points per token
    - Synonym mapping match (including stems/substrings): 20 points per match
    """
    if not query or not all_products:
        return None
        
    normalized_query = normalize_text(query)
    best_product = None
    best_score = 0
    
    query_tokens = set(re.findall(r'[a-zA-Z0-9]+', query.lower()))
    
    # Standard synonyms and keyword maps for precise product identification
    synonyms_map = {
        "COOLMAX-R10": {"refrigerator", "fridge", "freezer", "coolmax", "whirlpool"},
        "VIVID-4K": {"tv", "television", "vivid", "backlight", "screen", "display", "lg"},
        "LT-PRO X15": {"laptop", "lt-pro", "lt_pro", "computer", "notebook", "asus", "battery"},
        "AC-X300": {"hvac", "compressor", "ac", "condenser", "samsung", "breaker"},
        "AC-X200": {"hvac", "compressor", "ac", "condenser", "samsung", "breaker"},
        "CP-100": {"pump", "centrifugal", "leak", "fluid", "casing", "valve"},
        "SOP-ELEC-04": {"cabinet", "electrical", "wiring", "switch", "relay", "capacitor", "breaker", "loto"}
    }
    
    for p in all_products:
        score = 0
        model_number = p["model_number"]
        product_name = p["product_name"]
        manufacturer = p["manufacturer"]
        
        model_norm = normalize_text(model_number)
        name_norm = normalize_text(product_name)
        man_norm = normalize_text(manufacturer)
        
        # 1. Exact normalized matches
        if model_norm and model_norm in normalized_query:
            score += 100
        if name_norm and name_norm in normalized_query:
            score += 80
            
        # 2. Manufacturer match (case-insensitive word match)
        if man_norm and man_norm in query_tokens:
            score += 30
            
        # 3. Model tokens match
        model_tokens = [tok.lower() for tok in re.findall(r'[a-zA-Z0-9]+', model_number) if len(tok) > 1]
        for tok in model_tokens:
            if tok in query_tokens:
                score += 40
                
        # 4. Product name tokens match
        name_tokens = [tok.lower() for tok in re.findall(r'[a-zA-Z0-9]+', product_name) if len(tok) > 2]
        for tok in name_tokens:
            if tok in query_tokens:
                score += 25
                
        # 5. Synonym/Keyword Map matching for registered models
        for key, synonyms in synonyms_map.items():
            if key.lower().replace(" ", "").replace("-", "") == model_norm:
                # Count matching tokens (including substring/stem matches)
                match_count = 0
                for syn in synonyms:
                    for q_tok in query_tokens:
                        if syn == q_tok or (len(syn) >= 3 and len(q_tok) >= 3 and (syn in q_tok or q_tok in syn)):
                            match_count += 1
                            break # Move to next synonym
                score += match_count * 20
                break

        # 6. Deprioritize crawled/dynamic manuals on general queries
        is_crawled = "crawled" in model_norm or "crawled" in p.get("manual_filename", "").lower()
        if is_crawled:
            base_model_norm = model_norm.replace("crawled", "")
            if base_model_norm and len(base_model_norm) >= 3 and base_model_norm in normalized_query:
                pass
            else:
                score -= 60
                
        if score > best_score:
            best_score = score
            best_product = p
            
    # Return best product if it exceeds minimum score threshold
    if best_product and best_score >= 10:
        best_product["match_score"] = best_score
        return best_product
        
    return None
