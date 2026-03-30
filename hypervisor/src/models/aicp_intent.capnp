@0xd30d07ce540e009c;
using Go = import "go.capnp";
$Go.package("types");
$Go.import("axiom/grid/types");

enum Modality {
  text @0;
  latentVector @1;
  graphDelta @2;
  zkProof @3;
}

enum ProposalType {
  unspecified @0;
  modelRun @1;
}

struct ProposalTensor {
  proposalType @0 :ProposalType;
  tensorShape @1 :List(UInt32);
  tensorDtype @2 :Text;
}

struct EpistemicState {
  entropyLevel @0 :Float32;
  lyapunovDepth @1 :Float32;
  thrashingFlag @2 :Bool;
}

struct IntentPayload {
  id @0 :Data;
  senderPubKey @1 :Data;
  timestamp @2 :UInt64;
  modality @3 :Modality;
  payload @4 :Data;
  proposalTensor @7 :ProposalTensor;
  epistemicState @5 :EpistemicState;
  signature @6 :Data;
}


struct StateWitness {
  domainId @0 :UInt32;
  key @1 :Data;
  valueHash @2 :Data;
}

struct TurboQuantEdge {
  source @0 :UInt32;
  target @1 :UInt32;
  radius @2 :Float32;
  polarAngle @3 :UInt8;
  qjlResidual @4 :Int8;
}

struct ExecutionArtifact {
  attentionScope @0 :List(UInt32);
  readSet @1 :List(StateWitness);
  writeSet @2 :List(StateWitness);
  graphEdges @3 :List(TurboQuantEdge);
}
