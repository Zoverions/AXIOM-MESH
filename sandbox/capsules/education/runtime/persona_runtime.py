from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class PersonaResult:
    persona: str
    output: str
    trust_score: float
    policy_tags: List[str]
    escalation_required: bool = False


class EducationPersonaRuntime:
    """Policy-backed multi-persona runtime for education_tome flows."""

    def __init__(self):
        self.supported_personas = {
            "childhood_psychologist": self._childhood_psychologist,
            "guidance_counselor": self._guidance_counselor,
            "subject_expert": self._subject_expert,
        }

    def run(
        self,
        persona: str,
        *,
        student_id: str,
        topic: str,
        question: str,
        age: int,
        guardian_consent: bool,
        observations: List[str] | None = None,
    ) -> Dict:
        if persona not in self.supported_personas:
            raise ValueError(f"Unsupported persona: {persona}")

        effective_observations = observations or []
        policy_tags = self._policy_tags_for_age(age=age, guardian_consent=guardian_consent)

        result = self.supported_personas[persona](
            topic=topic,
            question=question,
            observations=effective_observations,
            policy_tags=policy_tags,
        )

        return {
            "student_id": student_id,
            "persona": result.persona,
            "output": result.output,
            "trust_score": result.trust_score,
            "policy_tags": result.policy_tags,
            "escalation_required": result.escalation_required,
        }

    def _policy_tags_for_age(self, *, age: int, guardian_consent: bool) -> List[str]:
        tags = ["education_tome", "policy_guarded"]
        if age < 16:
            tags.append("under_16")
            if guardian_consent:
                tags.append("guardian_consented")
            else:
                tags.append("guardian_required")
        else:
            tags.append("self_guided")
        return tags

    def _childhood_psychologist(self, *, topic: str, question: str, observations: List[str], policy_tags: List[str]) -> PersonaResult:
        concern_signals = [o for o in observations if "distress" in o.lower() or "panic" in o.lower()]
        escalation_required = "guardian_required" in policy_tags or len(concern_signals) > 0
        output = (
            "Emotional check-in complete. "
            f"Topic focus: {topic}. "
            "Recommend grounding exercise, short learning intervals, and reflective journaling."
        )
        if escalation_required:
            output += " Escalation advised to guardian/counselor due to age/potential distress signals."

        return PersonaResult(
            persona="childhood_psychologist",
            output=output,
            trust_score=0.91,
            policy_tags=policy_tags,
            escalation_required=escalation_required,
        )

    def _guidance_counselor(self, *, topic: str, question: str, observations: List[str], policy_tags: List[str]) -> PersonaResult:
        output = (
            f"Guidance pathway for {topic}: map prerequisites, pick a milestone project, "
            "and align coursework with apprenticeship options."
        )
        if question:
            output += f" Student question acknowledged: {question}"

        return PersonaResult(
            persona="guidance_counselor",
            output=output,
            trust_score=0.9,
            policy_tags=policy_tags,
        )

    def _subject_expert(self, *, topic: str, question: str, observations: List[str], policy_tags: List[str]) -> PersonaResult:
        output = (
            f"Subject expert briefing on {topic}: provide concept scaffold, worked example, "
            "and independent practice rubric with self-check answers."
        )
        if question:
            output += f" Answer focus: {question}"

        return PersonaResult(
            persona="subject_expert",
            output=output,
            trust_score=0.94,
            policy_tags=policy_tags,
        )
