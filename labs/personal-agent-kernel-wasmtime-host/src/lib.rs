#![forbid(unsafe_code)]

use std::collections::BTreeSet;
use wasmtime::component::{Component, Linker};
use wasmtime::{Engine, Store};

const ALLOWED_IMPORTS: [&str; 3] = [
    "axiom:personal-kernel/mesh-authority",
    "axiom:personal-kernel/effect-host",
    "axiom:personal-kernel/mesh-observer",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostAssessment {
    pub imports: Vec<String>,
    pub blockers: Vec<String>,
}

impl HostAssessment {
    pub fn allowed(&self) -> bool {
        self.blockers.is_empty()
    }

    pub fn grants_authority(&self) -> bool {
        false
    }
}

pub fn assess_component(engine: &Engine, wat: &str) -> wasmtime::Result<HostAssessment> {
    let component = Component::new(engine, wat)?;
    let mut imports = Vec::new();
    let mut blockers = BTreeSet::new();

    for (name, _) in component.component_type().imports(engine) {
        imports.push(name.to_string());
        if !ALLOWED_IMPORTS.contains(&name) {
            blockers.insert(format!("unapproved-component-import:{name}"));
        }
    }
    imports.sort();

    Ok(HostAssessment {
        imports,
        blockers: blockers.into_iter().collect(),
    })
}

pub fn instantiate_with_effect_host_only(
    engine: &Engine,
    wat: &str,
) -> wasmtime::Result<HostAssessment> {
    let assessment = assess_component(engine, wat)?;
    if !assessment.allowed() {
        return Err(wasmtime::Error::msg(format!(
            "component import policy denied: {}",
            assessment.blockers.join(",")
        )));
    }

    let component = Component::new(engine, wat)?;
    let mut linker = Linker::<()>::new(engine);
    linker.root().func_wrap(
        "axiom:personal-kernel/effect-host",
        |_store, _params: ()| Ok(()),
    )?;

    let mut store = Store::new(engine, ());
    linker.instantiate(&mut store, &component)?;
    Ok(assessment)
}
