#![forbid(unsafe_code)]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PrincipalEvidence<'a> {
    pub subject: &'a str,
    pub verified: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapabilityEvidence<'a> {
    pub capability: &'a str,
    pub authorized: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConsentEvidence {
    pub required: bool,
    pub valid: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EffectBudgetEvidence {
    pub required: bool,
    pub remaining: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthorityEvidence<'a> {
    pub principal: PrincipalEvidence<'a>,
    pub capability: CapabilityEvidence<'a>,
    pub consent: ConsentEvidence,
    pub budget: EffectBudgetEvidence,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DenyReason {
    UnverifiedPrincipal,
    UnauthorizedCapability,
    MissingRequiredConsent,
    ExhaustedEffectBudget,
}

/// A validated authority token. Callers cannot construct one directly.
///
/// Authority grants are intentionally non-copyable so later effect-bearing APIs
/// can consume a grant rather than accidentally treating it as reusable ambient
/// authority.
///
/// ```compile_fail
/// use axiom_trust_core_lab::{
///     AuthorityEvidence, CapabilityEvidence, ConsentEvidence, EffectBudgetEvidence,
///     PrincipalEvidence, evaluate_authority,
/// };
///
/// let grant = evaluate_authority(AuthorityEvidence {
///     principal: PrincipalEvidence { subject: "principal:test", verified: true },
///     capability: CapabilityEvidence { capability: "synthetic.effect", authorized: true },
///     consent: ConsentEvidence { required: false, valid: false },
///     budget: EffectBudgetEvidence { required: false, remaining: 0 },
/// }).unwrap();
/// let consumed = grant;
/// let reused = grant;
/// # let _ = (consumed, reused);
/// ```
///
/// ```compile_fail
/// use axiom_trust_core_lab::AuthorityGrant;
/// let _ = AuthorityGrant {
///     subject: "principal:test",
///     capability: "synthetic.effect",
/// };
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthorityGrant<'a> {
    subject: &'a str,
    capability: &'a str,
}

impl<'a> AuthorityGrant<'a> {
    pub fn subject(&self) -> &'a str {
        self.subject
    }

    pub fn capability(&self) -> &'a str {
        self.capability
    }
}

pub fn evaluate_authority<'a>(
    evidence: AuthorityEvidence<'a>,
) -> Result<AuthorityGrant<'a>, DenyReason> {
    if !evidence.principal.verified {
        return Err(DenyReason::UnverifiedPrincipal);
    }

    if !evidence.capability.authorized {
        return Err(DenyReason::UnauthorizedCapability);
    }

    if evidence.consent.required && !evidence.consent.valid {
        return Err(DenyReason::MissingRequiredConsent);
    }

    if evidence.budget.required && evidence.budget.remaining == 0 {
        return Err(DenyReason::ExhaustedEffectBudget);
    }

    Ok(AuthorityGrant {
        subject: evidence.principal.subject,
        capability: evidence.capability.capability,
    })
}
