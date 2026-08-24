{
  "schema": "axiom-local-context-semantic-review-evidence-threat-model.v1",
  "repository": "Zoverions/AXIOM-MESH",
  "phase": "a7-sovereign-context-owner-review-evidence",
  "scope": "Verification-only evidence that one exact human-owner context semantic-review request was accepted in a Grid-signed intent.accepted event. The evidence may support later classification, quarantine or rejection handling but does not itself mutate storage, authorize instruction use, grant vault access or grant execution authority.",
  "core_invariant": "A Grid-signed accepted owner review may authenticate one exact classification decision relative to the supplied trusted Grid key. It is not proof of current chain head, persistence, instruction authority, vault access, execution authority, or a globally trusted Grid identity.",
  "attack_classes": [
    {
      "id": "review-target-substitution",
      "risks": ["review a different claim", "swap candidate bytes", "apply a decision to a newer trust state", "change target semantic class after acceptance"],
      "controls": ["exact claim id", "exact candidate digest", "exact prior trust digest", "decision and target semantic class included in typed intent input", "intent input digest and canonical request digest matched to accepted event"]
    },
    {
      "id": "owner-or-intent-substitution",
      "risks": ["non-owner review", "machine principal masquerades as owner", "different action/purpose/data scope reuses digest", "accepted event actor differs from owner"],
      "controls": ["human owner principal required", "owner must equal candidate/trust owner", "fixed context.semantic.review action", "fixed govern-context-semantic-trust purpose", "single fixed context:semantic:review data scope", "accepted event actor and payload principal must equal owner"]
    },
    {
      "id": "fabricated-acceptance",
      "risks": ["invent intent.accepted payload", "alter accepted payload", "recompute event hash without Grid key", "substitute another Grid key"],
      "controls": ["payload digest recomputation", "event hash recomputation", "Ed25519 verification over event hash", "caller supplies the trusted Grid public key", "Grid trust-root source remains an explicit nonclaim"]
    },
    {
      "id": "chain-currentness-overclaim",
      "risks": ["old signed event treated as current", "signed event treated as proof of retained latest head", "event anchor treated as full-chain inclusion proof"],
      "controls": ["verification_scope limited to supplied-grid-key-and-signed-accepted-event-only", "event_chain_currentness_verified=false", "grid_trust_root_source_verified=false", "later persistence/currentness gate required"]
    },
    {
      "id": "review-to-authority-laundering",
      "risks": ["owner-reviewed text becomes executable instruction", "review grants tool use", "review grants policy mutation", "review grants vault access", "review self-persists"],
      "controls": ["classification_effect=evidence-only", "instruction_semantics=false", "owner_instruction_use_enabled=false", "authority_effect=none", "vault/execution/tool/policy/self-persistence claims hard false"]
    },
    {
      "id": "review-state-confusion",
      "risks": ["accept-data reported as reject", "quarantine reported as owner-reviewed", "instruction-candidate label interpreted as instruction permission"],
      "controls": ["decision-to-review-state mapping is deterministic", "closed evidence schema", "instruction-candidate remains a semantic label only", "instruction use remains hard false for every decision"]
    }
  ],
  "known_nonclaims": [
    "This gate does not prove the supplied Grid public key is globally authoritative; that trust root is supplied out of band.",
    "This gate does not prove the accepted event is the current or retained latest Grid chain head.",
    "This gate does not persist or apply the review to the Sovereign Vault or Context Broker state.",
    "This gate does not enable owner-approved instruction execution.",
    "This gate does not grant vault access, tool authority, policy authority or execution authority.",
    "This gate does not replace the accepted Context/Vault persistence path or create a second memory store."
  ],
  "next_gates": [
    "persist semantic review evidence append-only on the accepted Sovereign Context/Vault path",
    "bind current semantic-trust projection to persisted accepted review evidence without creating a second write authority",
    "prove restart/rebuild preserves review and prior-trust lineage",
    "keep instruction execution disabled unless a separately reviewed product need and authority path are explicitly designed"
  ],
  "boundaries": {
    "accepted_intent_verified_relative_to_supplied_grid_key": true,
    "grid_trust_root_source_verified": false,
    "event_chain_currentness_verified": false,
    "review_evidence_verified": true,
    "classification_effect": "evidence-only",
    "review_applied_to_store": false,
    "instruction_semantics": false,
    "owner_instruction_use_enabled": false,
    "authority_effect": "none",
    "grants_vault_access": false,
    "grants_execution_authority": false,
    "network_effect": false,
    "filesystem_effect": false,
    "capability_promotion_enabled": false
  }
}
