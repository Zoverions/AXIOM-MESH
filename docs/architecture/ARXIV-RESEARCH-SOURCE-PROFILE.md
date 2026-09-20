# arXiv Complete Research Source Profile v0

## Status

This is an inert, source-specific ingestion profile for the public `secemp9/arxiv-complete` snapshot. It composes the existing Agent-Native Research Artifacts v0 contracts and does not create a new knowledge, execution, or authority plane.

Issue: #1751.

The profile performs no network fetch, provider call, package install, subprocess execution, credential access, Gateway effect, capability mutation, Grid write, model training, redistribution, deployment, or production promotion.

## External snapshot

The referenced dataset card reports:

- dataset: `secemp9/arxiv-complete`;
- metadata snapshot: 2026-08-30;
- file snapshot: 2026-09-05;
- metadata, version, and file-index configs are intended to support selection before downloading content;
- paper licences vary and the compilation-level CC0 dedication does not relicense paper content;
- the dataset is a one-off snapshot rather than a live currentness service.

The repository does not vendor or mirror the 16 TB corpus in v0.

## Role in AXIOM

```text
arXiv Complete metadata/version rows
  -> deterministic arXiv index record
  -> conservative licence classification
  -> source selection
  -> admitted owner-local paper_text bytes only
  -> existing Research Source Manifest v0
  -> existing Research Knowledge Projection / composition / adjudication
```

Knowledge remains evidence. It never becomes authority.

The profile intentionally reuses:

- `axiom-research-source-manifest.v0`;
- Research Knowledge Projection v0;
- Research Composition Graph v0;
- Research Claim Adjudication v0.

No source-specific capability is added to `mesh/config/capabilities.json`.

## Metadata-first indexing

`normalizeArxivIndexRecord(...)` accepts the bounded arXiv metadata fields needed for selection and provenance:

- paper identifier;
- title;
- category set and primary category;
- exact recorded paper licence;
- version count;
- first/latest version dates inside the snapshot;
- arXiv abstract locator.

The derived record binds:

- dataset ID;
- metadata snapshot date;
- files snapshot date;
- conservative ingestion policy;
- canonical SHA-256 record digest.

Metadata indexing does not imply that full text is admitted.

## Fail-closed licence profile

This v0 policy is deliberately narrower than the set of uses a licence might legally permit. It is an automatic-ingestion policy, not legal advice.

Automatic owner-local full-text ingestion is enabled only for the explicit allowlist:

- CC0 1.0;
- CC BY 3.0;
- CC BY 4.0.

Everything else remains metadata-only in the automatic path until a separate reviewed use policy exists. That includes:

- arXiv's non-exclusive distribution licence;
- missing licence metadata;
- share-alike licences;
- non-commercial licences;
- no-derivatives licences;
- unrecognized licence URLs.

Even for the automatic allowlist, v0 sets:

- model training: denied;
- redistribution: denied.

Those uses require their own later policy/authority/legal review rather than inheriting permission from ingestion.

## Full-text binding

`buildArxivResearchSourceManifest(...)` requires exact agreement across:

- indexed `paper_id`;
- version-row `paper_id`;
- `paper_text` `paper_id`;
- recorded licence;
- title;
- primary category;
- text SHA-256.

Any mismatch fails closed.

The output uses the existing `axiom-research-source-manifest.v0` semantic verifier.

The `manuscript_digest` is the dataset's exact `paper_text.text_sha256` prefixed as an AXIOM SHA-256 digest. The profile does not hash a metadata row and mislabel it as manuscript bytes.

## Currentness rule

The dataset is a snapshot. Therefore `is_latest_version: true` means only "latest version represented by this snapshot."

It does not prove live arXiv currentness.

The profile maps:

- latest-in-snapshot -> `currentness_state: unknown`;
- superseded-in-snapshot -> `currentness_state: stale_revision`.

A future independently refreshed arXiv adapter may establish stronger currentness, but v0 never writes `current`.

## Storage and retrieval direction

The intended scale path remains metadata-first and lazy:

1. index metadata/version/file inventories;
2. select relevant papers locally;
3. retrieve only admitted content classes under a separate network-capable adapter;
4. verify row/file digests;
5. project source-bounded knowledge into the existing research substrate;
6. retain exact paper/version/licence provenance.

This profile itself implements only steps 1, policy classification, and local transformation of already-supplied rows. It does not download anything.

## Non-claims

Passing the profile tests does not establish:

- permission to train on the paper corpus;
- permission to redistribute paper content;
- correctness of arXiv papers;
- peer-review status;
- live arXiv currentness;
- complete source-version correspondence;
- scientific truth;
- autonomous literature review;
- network-safe corpus fetching;
- production research ingestion;
- any runtime or repository authority.

It establishes only deterministic metadata normalization, conservative source-policy classification, exact source binding, and generation of an existing Research Source Manifest for already-supplied rows that pass the v0 automatic-ingestion gate.
