from sandbox.capsules.education.runtime.persona_runtime import EducationPersonaRuntime


def test_subject_expert_runtime_returns_policy_tags_and_output():
    runtime = EducationPersonaRuntime()

    response = runtime.run(
        "subject_expert",
        student_id="student-42",
        topic="linear algebra",
        question="How do eigenvectors work?",
        age=17,
        guardian_consent=False,
    )

    assert response["persona"] == "subject_expert"
    assert "linear algebra" in response["output"]
    assert "self_guided" in response["policy_tags"]
    assert response["escalation_required"] is False


def test_childhood_psychologist_requires_escalation_without_guardian_for_under_16():
    runtime = EducationPersonaRuntime()

    response = runtime.run(
        "childhood_psychologist",
        student_id="student-8",
        topic="math confidence",
        question="I feel overwhelmed by fractions",
        age=13,
        guardian_consent=False,
        observations=["mild distress during timed quizzes"],
    )

    assert response["persona"] == "childhood_psychologist"
    assert "under_16" in response["policy_tags"]
    assert "guardian_required" in response["policy_tags"]
    assert response["escalation_required"] is True


def test_unsupported_persona_is_rejected():
    runtime = EducationPersonaRuntime()

    try:
        runtime.run(
            "unknown_persona",
            student_id="student-err",
            topic="history",
            question="",
            age=18,
            guardian_consent=False,
        )
        assert False, "Expected ValueError for unsupported persona"
    except ValueError as exc:
        assert "Unsupported persona" in str(exc)
