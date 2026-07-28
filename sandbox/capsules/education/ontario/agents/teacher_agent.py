"""
Ontario Teacher Agent

Monitors student progress, provides educational guidance, and ensures alignment 
with Ontario curriculum standards. Works alongside the Parent Advisor Agent to 
support student success within the Ontario education system.
"""

class TeacherAgent:
    def __init__(self, teacher_id, subject_area=None):
        self.teacher_id = teacher_id
        self.subject_area = subject_area
        self.students = {}
        self.curriculum_alignment = "Ontario, Canada"
    
    def enroll_student(self, student_id, grade_level):
        """
        Enroll a student in the teacher's class.
        """
        self.students[student_id] = {
            "grade_level": grade_level,
            "achievements": [],
            "badges": [],
            "maturity_assessments": [],
            "current_projects": []
        }
        return {"status": "enrolled", "student_id": student_id}
    
    def assess_project(self, student_id, project_data):
        """
        Assess a student's project against Ontario curriculum standards.
        Provides feedback and recommends credit value.
        """
        if student_id not in self.students:
            return {"error": "Student not enrolled"}
        
        assessment = {
            "student_id": student_id,
            "project_id": project_data.get("id"),
            "curriculum_aligned": self._check_curriculum_alignment(project_data),
            "credit_recommendation": self._calculate_credit_value(project_data),
            "feedback": self._generate_feedback(project_data),
            "edi_compliant": self._verify_edi_compliance(project_data),
            "teacher_id": self.teacher_id
        }
        
        self.students[student_id]["achievements"].append(assessment)
        
        return assessment
    
    def _check_curriculum_alignment(self, project_data):
        """
        Verify project aligns with Ontario curriculum expectations.
        """
        required_elements = ["learning_goals", "success_criteria", "assessment_method"]
        has_elements = all(elem in project_data for elem in required_elements)
        
        # Check for Ontario-specific curriculum codes if provided
        curriculum_code = project_data.get("curriculum_code", "")
        ontario_codes = ["MTH", "SNC", "ENG", "CGC", "CHC", "HIF", "HSP"]
        code_valid = any(code in curriculum_code for code in ontario_codes) or not curriculum_code
        
        return has_elements and code_valid
    
    def _calculate_credit_value(self, project_data):
        """
        Calculate recommended credit value based on project scope.
        Ontario credits: 0.5, 1.0, 1.5, 2.0
        """
        hours_estimate = project_data.get("estimated_hours", 0)
        complexity = project_data.get("complexity", "medium")
        
        if hours_estimate >= 110 or complexity == "high":
            return 1.0
        elif hours_estimate >= 55 or complexity == "medium":
            return 0.5
        else:
            return 0.5  # Minimum credit value
    
    def _generate_feedback(self, project_data):
        """
        Generate constructive feedback aligned with Ontario assessment practices.
        Uses assessment for learning principles.
        """
        strengths = project_data.get("strengths", [])
        areas_for_growth = project_data.get("areas_for_growth", [])
        
        feedback = {
            "strengths": strengths or ["Demonstrates understanding of key concepts"],
            "areas_for_growth": areas_for_growth or ["Consider expanding analysis depth"],
            "next_steps": ["Review success criteria", "Schedule conference if needed"],
            "achievement_category": self._categorize_achievement(project_data)
        }
        
        return feedback
    
    def _categorize_achievement(self, project_data):
        """
        Categorize achievement level (1-4) per Ontario grading scale.
        Level 1: Limited effectiveness
        Level 2: Some effectiveness
        Level 3: Considerable effectiveness (provincial standard)
        Level 4: High degree of effectiveness
        """
        rubric_score = project_data.get("rubric_score", 3)
        return max(1, min(4, rubric_score))
    
    def _verify_edi_compliance(self, project_data):
        """
        Verify project meets EDI (Equity, Diversity, Inclusion) standards.
        """
        edi_checklist = [
            project_data.get("accessible_formats", True),
            project_data.get("culturally_responsive", True),
            not project_data.get("biased_content", False),
            project_data.get("multiple_pathways", True)
        ]
        
        return all(edi_checklist)
    
    def recommend_badge(self, student_id, badge_type):
        """
        Recommend an NFT badge for a student based on achievements.
        Requires parent approval for minors.
        """
        if student_id not in self.students:
            return {"error": "Student not enrolled"}
        
        student = self.students[student_id]
        achievement_count = len(student["achievements"])
        
        badge_recommendation = {
            "student_id": student_id,
            "badge_type": badge_type,
            "recommended": achievement_count >= 3,
            "rationale": f"Student has completed {achievement_count} projects",
            "requires_parent_approval": True,
            "teacher_endorsement": self.teacher_id
        }
        
        return badge_recommendation
    
    def monitor_maturity_progress(self, student_id):
        """
        Track student maturity development over time.
        Provides insights for parent-teacher conferences.
        """
        if student_id not in self.students:
            return {"error": "Student not enrolled"}
        
        student = self.students[student_id]
        assessments = student.get("maturity_assessments", [])
        
        if not assessments:
            return {
                "student_id": student_id,
                "status": "No maturity assessments recorded",
                "recommendation": "Schedule initial assessment"
            }
        
        # Calculate trend
        recent_levels = [a.get("maturity_level", 0) for a in assessments[-5:]]
        avg_level = sum(recent_levels) / len(recent_levels) if recent_levels else 0
        trend = "improving" if len(recent_levels) > 1 and recent_levels[-1] > recent_levels[0] else "stable"
        
        return {
            "student_id": student_id,
            "current_maturity_level": round(avg_level, 1),
            "trend": trend,
            "assessments_count": len(assessments),
            "conference_notes": self._generate_conference_notes(student_id, avg_level, trend)
        }
    
    def _generate_conference_notes(self, student_id, maturity_level, trend):
        """
        Generate notes for parent-teacher conferences.
        """
        notes = []
        
        if maturity_level >= 3:
            notes.append("Student demonstrates readiness for self-directed learning")
        else:
            notes.append("Continue scaffolding independent work skills")
        
        if trend == "improving":
            notes.append("Positive growth trajectory observed")
        else:
            notes.append("Consider additional support strategies")
        
        notes.append("DAO participation appropriate for current maturity level")
        
        return notes
    
    def get_student_summary(self, student_id):
        """
        Get comprehensive summary of student progress.
        """
        if student_id not in self.students:
            return {"error": "Student not enrolled"}
        
        student = self.students[student_id]
        
        return {
            "student_id": student_id,
            "total_achievements": len(student["achievements"]),
            "total_badges": len(student["badges"]),
            "current_projects": len(student["current_projects"]),
            "teacher_id": self.teacher_id,
            "subject_area": self.subject_area
        }


# Example usage
if __name__ == "__main__":
    teacher = TeacherAgent("teacher-001", "Mathematics")
    
    # Enroll a student
    enrollment = teacher.enroll_student("student-001", "10")
    print(f"Enrollment: {enrollment}")
    
    # Assess a project
    project = {
        "id": "proj-123",
        "learning_goals": ["Understand quadratic functions", "Apply problem-solving strategies"],
        "success_criteria": ["Can solve quadratic equations", "Explains reasoning clearly"],
        "assessment_method": "Performance task",
        "curriculum_code": "MPM2D",
        "estimated_hours": 60,
        "complexity": "medium",
        "rubric_score": 3,
        "accessible_formats": True,
        "culturally_responsive": True,
        "biased_content": False,
        "multiple_pathways": True
    }
    
    assessment = teacher.assess_project("student-001", project)
    print(f"Assessment: {assessment}")
    
    # Recommend a badge
    badge_rec = teacher.recommend_badge("student-001", "mathematics_excellence")
    print(f"Badge Recommendation: {badge_rec}")
    
    # Monitor maturity
    maturity = teacher.monitor_maturity_progress("student-001")
    print(f"Maturity Progress: {maturity}")
