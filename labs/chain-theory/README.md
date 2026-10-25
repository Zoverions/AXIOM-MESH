# Chain Theory clean-room reproduction

Status: **TEST**, not adoption.

This laboratory independently reconstructs the finite record census and
normalization published in A. D. Wissner-Gross, *A Parameter-Free Candidate
for the Fine-Structure Constant from Entangled Qudits* (2026-10-23). It uses
only the mathematical description in the paper:

- four slots with `8, 3, 8, 3` traceless letters;
- products across the six distinct slot pairs;
- three antisymmetric qubit commutators;
- exchange-sector weights `1`, `sqrt(2)`, `sqrt(3)`, and `sqrt(6)`; and
- readout normalization `(8 * 3) * 36 * 36`.

The implementation enumerates exchange-orbit combinations rather than copying
or translating the author's Lean source. On 2026-10-25, the upstream Lean file
was independently retrieved from the Apache-2.0-licensed
`physical-superintelligence/chain-theory` repository at exact commit
`a28db8998bce5bd5ef11195c05f13c86cd9dac5c`. Its pinned Lean 4.35.0 kernel
check, source audit, committed axiom-report comparison, and definition-mutation
suite passed without vendoring or translating the source into AXIOM-MESH. See
`provenance.json` for the exact digests, commands, observations, and limits.

Run the focused reproduction:

```sh
node --test mesh/test/chain-theory-cleanroom.test.mjs
```

The tests keep the published construction as the positive control and vary
one bounded choice at a time: the same-end off-diagonal sector, cross-end
exchange-orbit count, qubit-commutator inclusion, sector amplitudes, and
normalization. Each tested alternative fails to reproduce the published
readout. These controls establish definition sensitivity within this finite
clean-room model; they are not a probability over alternative definitions,
an exhaustive null distribution, or evidence that the selected construction
was physically derived rather than chosen.

A matching census proves only that this independent finite combinatorial
reconstruction agrees with the published `172` records, sector counts
`79/48/42/3`, normalization `31104`, and resulting numerical candidate.
The independent Lean build verifies that the pinned formalization elaborates
and that its reported theorem dependencies are Lean's standard axioms listed
in the upstream report; it does not make the paper's definitions physically
correct.
It does **not** validate the physical axiom, deterministic postselection,
Born-probability recovery, causality or no-signalling, the photon conjecture,
the claimed on-shell identification, local gauge dynamics, or any integration
with The Stack/ITH-M.

This lab is offline and dependency-free. It grants no operational, policy,
identity, cognition, state, merge, deployment, or scientific authority.
