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
- `paper_text` is assembled from the unversioned source package and does not itself carry an arXiv version;
- PDFs are versioned and the versions table identifies the SHA-256 of held PDFs;
- paper licences vary and the compilation-level CC0 dedication does not relicense paper content;
- the dataset is a one-off snapshot rather than a live currentness service.

The repository does not vendor or mirror the 16 TB corpus in v0.

## Role in AXIOM

```text
arXiv Complete metadata/version/file rows
  -> deterministic arXiv index record
  -> conservative licence classification
  -> source selection
  -> admitted owner-local paper_text or versioned PDF evidence
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

## paper_text provenance rule

The dataset's `paper_text` rows provide a paper-level SHA-256 but no version number. Source packages are unversioned in this snapshot.

Therefore `buildArxivPaperTextManifest(...)` deliberately records:

- `source_version: unversioned-source-snapshot:2026-09-05`;
- `currentness_state: unknown`;
- a provenance marker stating that source version is not proven.

It must never attach a paper-text digest to an arbitrary `vN`.

The `manuscript_digest` is the exact `paper_text.text_sha256`.

## Exact versioned PDF provenance

`buildArxivVersionedPdfManifest(...)` is the exact-version path.

It requires agreement across:

- indexed `paper_id`;
- version-row `paper_id` and version number;
- PDF-row `paper_id` and version number;
- recorded paper licence;
- `has_pdf: true`;
- `version_row.pdf_sha256`;
- `pdf_row.sha256`;
- arXiv PDF locator.

Any mismatch fails closed.

Only this path writes `source_version: vN`.

## Currentness rule

The dataset is a snapshot. Therefore `is_latest_version: true` means only "latest version represented by this snapshot."

It does not prove live arXiv currentness.

For versioned PDF manifests the profile maps:

- latest-in-snapshot -> `currentness_state: unknown`;
- superseded-in-snapshot -> `currentness_state: stale_revision`.

For `paper_text`, currentness is always `unknown` because the source package is not version-bound.

A future independently refreshed arXiv adapter may establish stronger currentness, but v0 never writes `current`.

## Storage and retrieval direction

The intended scale path remains metadata-first and lazy:

1. index metadata/version/file inventories;
2. select relevant papers locally;
3. retrieve only admitted content classes under a separate network-capable adapter;
4. verify row/file digests;
5. project source-bounded knowledge into the existing research substrate;
6. retain exact provenance and explicitly preserve when version provenance is unavailable.

This profile itself implements only steps 1, policy classification, and local transformation of already-supplied rows. It does not download anything.

## Non-claims

Passing the profile tests does not establish:

- permission to train on the paper corpus;
- permission to redistribute paper content;
- correctness of arXiv papers;
- peer-review status;
- live arXiv currentness;
- version provenance for `paper_text`;
- scientific truth;
- autonomous literature review;
- network-safe corpus fetching;
- production research ingestion;
- any runtime or repository authority.

It establishes only deterministic metadata normalization, conservative source-policy classification, exact digest binding, explicit version-provenance limits, and generation of an existing Research Source Manifest for already-supplied rows that pass the v0 automatic-ingestion gate.
