@0xd30d07ce540e009f;

struct EducationTomeRequest {
    studentId @0 :Text;
    action @1 :Text;
    parameters @2 :Text; # JSON blob containing observation, topic, question etc.
}

struct EducationTomeResponse {
    persona @0 :Text;
    studentId @1 :Text;
    output @2 :Text; # The main response (analysis, recommendation, pathway, answer)
    trustScore @3 :Float64;
    error @4 :Text;
}
