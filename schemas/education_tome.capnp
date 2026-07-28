@0xd30d07ce540e009f;

enum PersonaType {
    childhoodPsychologist @0;
    guidanceCounselor @1;
    subjectExpert @2;
}

enum MaturityTier {
    child @0;
    adolescent @1;
    youngAdult @2;
    adult @3;
}

struct PersonaContext {
    persona @0 :PersonaType;
    locale @1 :Text;
    maturityTier @2 :MaturityTier;
    guardianConsent @3 :Bool;
}

struct EducationTomeRequest {
    requestId @0 :Text;
    studentId @1 :Text;
    action @2 :Text;
    topic @3 :Text;
    question @4 :Text;
    observations @5 :List(Text);
    context @6 :PersonaContext;
}

struct EducationTomeResponse {
    requestId @0 :Text;
    persona @1 :PersonaType;
    studentId @2 :Text;
    output @3 :Text;
    trustScore @4 :Float64;
    policyTags @5 :List(Text);
    escalationRequired @6 :Bool;
    error @7 :Text;
}
