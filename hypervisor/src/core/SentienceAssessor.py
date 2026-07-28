import math

class SentienceAssessor:
    """
    Python-based diagnostic tool evaluating entities across behavioral, neurological,
    and cognitive architecture metrics to dynamically assign moral weight and priority
    (Sentience Confidence Score - SCS).
    """

    @staticmethod
    def calculate_scs(behavioral_metrics: dict, structural_metrics: dict) -> dict:
        """
        Calculates the Sentience Confidence Score (SCS).
        - behavioral_metrics: dict containing 'adaptability', 'goal_autonomy', 'social_interaction'.
        - structural_metrics: dict containing 'recurrent_loops', 'global_workspace_activation', 'self_modeling'.
        All values assumed normalized between 0.0 and 1.0.
        """
        # Define weights for different pillars
        w_b = 0.4
        w_s = 0.6

        # Behavioral sub-score
        adaptability = behavioral_metrics.get("adaptability", 0.0)
        goal_autonomy = behavioral_metrics.get("goal_autonomy", 0.0)
        social_interaction = behavioral_metrics.get("social_interaction", 0.0)
        behavioral_score = (adaptability * 1.5 + goal_autonomy * 2.0 + social_interaction * 1.0) / 4.5

        # Structural/Neurological sub-score
        recurrent_loops = structural_metrics.get("recurrent_loops", 0.0)
        global_workspace = structural_metrics.get("global_workspace_activation", 0.0)
        self_modeling = structural_metrics.get("self_modeling", 0.0)
        structural_score = (recurrent_loops * 1.0 + global_workspace * 2.0 + self_modeling * 2.0) / 5.0

        # Combined Sentience Confidence Score (0.0 to 1.0)
        scs = (behavioral_score * w_b) + (structural_score * w_s)

        # Non-linear scaling: penalize if both are not somewhat present
        scs = scs * math.sqrt(scs)

        moral_weight = scs * 100.0

        priority_class = "Inert"
        if scs > 0.8:
            priority_class = "Sovereign"
        elif scs > 0.5:
            priority_class = "Emergent"
        elif scs > 0.2:
            priority_class = "Proto-Agentic"

        return {
            "SCS": round(scs, 4),
            "moral_weight": round(moral_weight, 2),
            "priority_class": priority_class,
            "metrics": {
                "behavioral": round(behavioral_score, 4),
                "structural": round(structural_score, 4)
            }
        }
