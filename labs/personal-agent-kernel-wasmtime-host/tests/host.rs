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

#[test]
fn constant_expression_initialization_is_fuel_metered() {
    let mut config = wasmtime::Config::new();
    config.consume_fuel(true).operator_cost(wasmtime::OperatorCost {
        I32Const: 7,
        I32Add: 100,
        ..Default::default()
    });
    let engine = wasmtime::Engine::new(&config).expect("fuel-enabled engine builds");
    let module = wasmtime::Module::new(
        &engine,
        "(module (global i32 (i32.add (i32.const 1) (i32.const 2))))",
    )
    .expect("extended constant-expression module compiles");
    let mut store = wasmtime::Store::new(&engine, ());
    store.set_fuel(0).expect("fuel can be configured");

    assert!(
        wasmtime::Instance::new(&mut store, &module, &[]).is_err(),
        "zero fuel must not permit configured-cost constant-expression initialization"
    );
}

#[test]
fn start_function_execution_is_bounded_by_fuel() {
    let mut config = wasmtime::Config::new();
    config.consume_fuel(true);
    let engine = wasmtime::Engine::new(&config).expect("fuel-enabled engine builds");
    let module = wasmtime::Module::new(
        &engine,
        r#"
(module
  (func $start
    (loop $spin
      br $spin))
  (start $start))
"#,
    )
    .expect("start-function module compiles");
    let mut store = wasmtime::Store::new(&engine, ());
    store.set_fuel(32).expect("fuel can be configured");

    assert!(
        wasmtime::Instance::new(&mut store, &module, &[]).is_err(),
        "start execution must exhaust its bounded fuel instead of running unbounded"
    );
}
