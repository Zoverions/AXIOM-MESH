# Bilateral Recognition Profiles

**Status:** experimental interoperability architecture; not a treaty, accreditation, or legal-recognition claim.

Institutions often need to recognize one another without becoming one another.

A university may accept a course-completion credential from another school. A research consortium may recognize a lab-safety certification. Two public bodies may accept one another's attestations for a narrow administrative purpose. Two machine organizations may accept a bounded verifier result.

The safe pattern is **purpose-bound bilateral recognition**.

```text
issuer evidence
  -> bilateral recognition profile
  -> local verifier / assurance / freshness checks
  -> local policy
  -> local decision
```

Recognition does not skip the last step.

## No automatic transitive trust

If A recognizes B and B recognizes C, A does not automatically recognize C.

Any A<->C relationship needs its own explicit profile or another separately authorized federation mechanism.

This blocks one compromised or overly permissive institution from silently widening the trust domain of every participant.

## Recognition is not equivalence

Recognizing one claim class for one purpose does not mean:

- universal credential equivalence;
- institutional accreditation;
- membership;
- program admission;
- professional licensing;
- eligibility;
- execution authority.

For example, a college might recognize another university's course-completion proof for prerequisite review while still applying its own program-admission criteria.

## Assurance and privacy

Recognition profiles define minimum evidence and verifier requirements while allowing the relying institution to impose stricter local rules.

They also define the narrowest disclosures permitted for the purpose.

A relying institution should not receive a full transcript merely because it needs to know whether one prerequisite was completed.

## Revocation and offline use

Profiles declare currentness/revocation obligations and what stale evidence becomes offline.

Possible behavior includes:

- deny required proof;
- hold pending reconnect;
- downgrade to advisory-only.

Connectivity loss cannot silently broaden recognition.

## Amendment and withdrawal

Recognition agreements evolve.

A material amendment that widens claim classes, purposes, data disclosure, assurance semantics, or authority-relevant context requires explicit renewed acceptance.

Either party retains withdrawal ability under the declared notice process.

Withdrawal changes future reliance but does not erase historical evidence about what was validly recognized at the time.

## Disputes

Recognition disputes feed into a declared review/dispute profile.

Any consequential remedy remains separately authorized.

## Governing rule

**Recognize claims narrowly. Keep authority local. Deny transitivity by default.**
