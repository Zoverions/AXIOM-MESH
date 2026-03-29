from sandbox.capsules.education.runtime.education_engine import EducationEngine


def test_build_handwriting_plan_includes_trace_and_print_exercises():
    engine = EducationEngine()
    plan = engine.build_handwriting_plan("student-1", focus_letters="ab", include_printing=True)

    assert plan["student_id"] == "student-1"
    assert plan["focus_letters"] == ["A", "B"]
    types = [entry["type"] for entry in plan["exercises"]]
    assert "trace" in types
    assert "print" in types
    assert "sentence" in types


def test_build_handwriting_plan_can_disable_printing():
    engine = EducationEngine()
    plan = engine.build_handwriting_plan("student-2", focus_letters="c", include_printing=False)
    types = [entry["type"] for entry in plan["exercises"]]

    assert "trace" in types
    assert "print" not in types
