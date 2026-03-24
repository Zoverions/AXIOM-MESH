enum Modality {
  text @0;
  latentVector @1;
  graphDelta @2;
  zkProof @3;
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
  epistemicState @5 :EpistemicState;
  signature @6 :Data;
}
