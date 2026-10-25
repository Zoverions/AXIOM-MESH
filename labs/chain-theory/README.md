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
or translating the author's Lean source. The source file was not imported or
executed because no explicit reuse licence was located in the paper or its
public source references during the 2026-10-24 review. See
`provenance.json` for the pinned review boundary.

Run the focused reproduction:

```sh
node --test mesh/test/chain-theory-cleanroom.test.mjs
```

The test includes a dimension-drift negative control. A matching census proves
only that this independent finite combinatorial reconstruction agrees with the
published `172` records, sector counts `79/48/42/3`, normalization `31104`, and
the resulting numerical candidate. It does **not** validate the physical
axiom, the postselection interpretation, the photon conjecture, the claimed
on-shell identification, or any integration with The Stack/ITH-M.

This lab is offline and dependency-free. It grants no operational, policy,
identity, cognition, state, merge, deployment, or scientific authority.
