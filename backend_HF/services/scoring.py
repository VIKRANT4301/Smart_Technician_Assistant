from typing import Dict

class ScoringEngine:
    @staticmethod
    def parse_percentage(val) -> float:
        """
        Parses percentage strings or numeric types to a float between 0.0 and 1.0.
        """
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            if val > 1.0:
                return float(val) / 100.0
            return float(val)
        
        # String processing
        val_str = str(val).strip().replace("%", "")
        try:
            parsed = float(val_str)
            if parsed > 1.0:
                return parsed / 100.0
            return parsed
        except ValueError:
            return 0.5 # Safe mid-point default

    @classmethod
    def calculate_metrics(
        cls,
        vision_confidence: float,
        rag_similarity: float,
        llm_reasoning_confidence: float,
        historical_success_rate: float
    ) -> Dict[str, str]:
        """
        Computes dynamic confidence score and repair success probability based on:
        - Vision Confidence: 35% weight (if image is present)
        - RAG Match Score: 25% weight
        - LLM Reasoning Confidence: 25% weight
        - Historical Success Rate: 15% weight
        
        If no image was provided, the weights are redistributed proportionally:
        - RAG Match: 38%
        - LLM Reasoning: 38%
        - Historical Success Rate: 24%
        """
        v_conf = cls.parse_percentage(vision_confidence)
        r_score = cls.parse_percentage(rag_similarity)
        l_conf = cls.parse_percentage(llm_reasoning_confidence)
        h_rate = cls.parse_percentage(historical_success_rate)
        
        # Dynamic weights based on visual input presence
        if v_conf > 0.0:
            final_confidence = (0.35 * v_conf) + (0.25 * r_score) + (0.25 * l_conf) + (0.15 * h_rate)
        else:
            # Re-normalized: RAG (0.25 / 0.65) + LLM (0.25 / 0.65) + History (0.15 / 0.65)
            final_confidence = (0.38 * r_score) + (0.38 * l_conf) + (0.24 * h_rate)

        # Repair Success Probability
        # RAG relevance (20%) + LLM diagnostic confidence (30%) + Historical success of repairs (50%)
        success_probability = (0.20 * r_score) + (0.30 * l_conf) + (0.50 * h_rate)

        # Ensure bounds
        final_confidence = max(0.0, min(1.0, final_confidence))
        success_probability = max(0.0, min(1.0, success_probability))

        return {
            "confidence_score": f"{final_confidence * 100:.1f}%",
            "repair_success_probability": f"{success_probability * 100:.1f}%"
        }

scoring_engine = ScoringEngine()
