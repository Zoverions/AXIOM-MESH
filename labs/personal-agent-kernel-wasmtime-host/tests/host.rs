use axiom_personal_kernel_wasmtime_host_lab::{
    assess_component, instantiate_with_effect_host_only,
};
use wasmtime::Engine;

const ALLOWED_COMPONENT: &str = r#"
(component
  (import "axiom:personal-kernel/effect-host" (func $effect))
)
"#;

const AMBIENT_NETWORK_COMPONENT: &str = r#"
(component
  (import "wasi:sockets/tcp@0.3.0" (func $tcp))
)
"#;

const MIXED_COMPONENT: &str = r#"
(component
  (import "axiom:personal-kernel/effect-host" (func $effect))
  (import "wasi:filesystem/types@0.3.0" (func $filesystem))
)
"#;

#[test]
fn explicitly_linked_axiom_effect_import_instantiates() {
    let engine = Engine::default();
    let assessment = instantiate_with_effect_host_only(&engine, ALLOWED_COMPONENT)
        .expect("allowed AXIOM-only component should instantiate");
    assert!(assessment.allowed());
    assert_eq!(
        assessment.imports,
        vec!["axiom:personal-kernel/effect-host"]
    );
    assert!(!assessment.grants_authority());
}

#[test]
fn ambient_wasi_network_import_is_denied_before_instantiation() {
    let engine = Engine::default();
    let assessment =
        assess_component(&engine, AMBIENT_NETWORK_COMPONENT).expect("component compiles");
    assert!(!assessment.allowed());
    assert_eq!(
        assessment.blockers,
        vec!["unapproved-component-import:wasi:sockets/tcp@0.3.0"]
    );
    assert!(!assessment.grants_authority());
    assert!(instantiate_with_effect_host_only(&engine, AMBIENT_NETWORK_COMPONENT).is_err());
}

#[test]
fn a_valid_axiom_import_does_not_mask_an_ambient_wasi_import() {
    let engine = Engine::default();
    let assessment = assess_component(&engine, MIXED_COMPONENT).expect("component compiles");
    assert!(!assessment.allowed());
    assert!(
        assessment
            .blockers
            .contains(&"unapproved-component-import:wasi:filesystem/types@0.3.0".to_string())
    );
    assert!(instantiate_with_effect_host_only(&engine, MIXED_COMPONENT).is_err());
}

#[test]
fn raw_linker_without_explicit_import_still_cannot_instantiate_component() {
    let engine = Engine::default();
    let component = wasmtime::component::Component::new(&engine, ALLOWED_COMPONENT)
        .expect("component compiles");
    let linker = wasmtime::component::Linker::<()>::new(&engine);
    let mut store = wasmtime::Store::new(&engine, ());
    assert!(linker.instantiate(&mut store, &component).is_err());
}
