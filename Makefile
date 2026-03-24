.PHONY: \
	up down cli test nemo-airgap \
	contracts-compile contracts-test contracts-deploy \
	compile-capnp hardhat-compile \
	transformer-grid-e2e transformer-hypervisor-e2e transformer-gate \
	validate-release-evidence verify-evidence-bundles verify-tokenomics-controls \
	test-reconciliation test-grid-authz verify-change-control test-provex-wrapper \
	test-zero-trust test-telemetry-alerts \
	verify-external-audit-artifacts verify-zkml-audit-pack verify-bridge-audit-pack \
	deploy-transformer-pulsechain-testnet verify-transformer-deployment

up:
	docker compose up -d --build

down:
	docker compose down

cli:
	python3 cli/axiom_cli.py

test:
	curl http://localhost:3000/health
	curl http://localhost:8000/health
	curl http://localhost:4000/health
	curl http://localhost:5000/health

nemo-airgap:
	cd sandbox && cargo build --manifest-path Cargo.toml --bin sandbox && cp target/debug/sandbox ./airgap && ./airgap

contracts-compile:
	cd grid/contracts && npm run compile

contracts-test:
	cd grid/contracts && npm test

contracts-deploy:
	cd grid/contracts && npm run deploy:localhost

compile-capnp:
	@command -v capnp >/dev/null 2>&1 || (echo "capnp CLI not installed"; exit 1)
	capnp compile -I schemas -ocapnp schemas/aicp_intent.capnp

hardhat-compile:
	cd grid/contracts && npm install --legacy-peer-deps && npx hardhat compile

transformer-grid-e2e:
	cd grid && go test ./p2p -run 'TestRouteIntent_LatentVectorRoutesToProposalTensor|TestDecodeProposalTensor_RejectsNonModelRun'

transformer-hypervisor-e2e:
	PYTHONPATH=. pytest -q hypervisor/src/engine/aicp_e2e_test.py

transformer-gate: compile-capnp hardhat-compile transformer-grid-e2e transformer-hypervisor-e2e

deploy-transformer-pulsechain-testnet:
	@test -n "$(PRIVATE_KEY)" || (echo "Set PRIVATE_KEY to a funded PulseChain testnet deployer key"; exit 1)
	cd grid/contracts && \
	PULSECHAIN_TESTNET_RPC_URL="$(PULSECHAIN_TESTNET_RPC_URL)" PRIVATE_KEY="$(PRIVATE_KEY)" \
	npx hardhat run ../../scripts/deploy-full-testnet.js --network pulsechainTestnet

verify-transformer-deployment:
	@test -n "$(BUNDLE_PATH)" || (echo "Usage: make verify-transformer-deployment BUNDLE_PATH=evidence/deployments/.../transformer-foundation-deployment.json"; exit 1)
	python3 scripts/verify_transformer_deployment_bundle.py $(BUNDLE_PATH) --check-chain

validate-release-evidence:
	@test -n "$(RC_PATH)" || (echo "Usage: make validate-release-evidence RC_PATH=release-evidence/RC-<date>-<tag>" && exit 1)
	python3 scripts/validate_release_evidence.py $(RC_PATH)

verify-evidence-bundles:
	python3 scripts/verify_evidence_bundles.py

verify-tokenomics-controls:
	python3 scripts/verify_tokenomics_controls.py

test-reconciliation:
	python3 scripts/run_reconciliation_drill.py

test-grid-authz:
	python3 scripts/test_grid_authz.py

verify-change-control:
	python3 scripts/verify_change_control.py

test-provex-wrapper:
	python3 scripts/test_provex_wrapper.py

test-zero-trust:
	python3 scripts/test_zero_trust.py

test-telemetry-alerts:
	python3 scripts/test_telemetry_alerts.py

verify-external-audit-artifacts:
	python3 scripts/verify_external_audit_artifacts.py

verify-zkml-audit-pack:
	python3 scripts/verify_zkml_audit_pack.py

verify-bridge-audit-pack:
	python3 scripts/verify_bridge_audit_pack.py
