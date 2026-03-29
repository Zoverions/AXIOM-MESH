.PHONY: \
	up down cli test nemo-airgap \
	contracts-compile contracts-test contracts-deploy \
	build-schemas compile-capnp hardhat-compile \
	verify-transformer-toolchains transformer-grid-e2e transformer-hypervisor-e2e transformer-gate \
	validate-release-evidence verify-evidence-bundles verify-tokenomics-controls \
	test-reconciliation test-grid-authz verify-change-control test-provex-wrapper \
	test-mtls test-sandbox-identity test-zero-trust test-telemetry-alerts \
	verify-external-audit-artifacts verify-zkml-audit-pack verify-bridge-audit-pack \
	verify-gas-target verify-sbom verify-genesis-ceremony \
	generate-docs steering-index

generate-docs:
	@echo "Generating API Documentation..."
	# Gateway Docs (TypeDoc)
	cd gateway && npm install --save-dev @types/jest && echo '{"extends": "./tsconfig.json", "compilerOptions": {"types": ["jest", "node"]}, "exclude": ["**/*.test.ts", "**/*.spec.ts", "../testing/**/*"]}' > tsconfig.docs.json && npx typedoc --out ../docs/api/gateway --tsconfig tsconfig.docs.json src || true
	# Sandbox Docs (TypeDoc)
	cd sandbox && npm install --save-dev @types/jest @types/node && echo '{"extends": "./tsconfig.json", "compilerOptions": {"types": ["jest", "node"]}, "exclude": ["**/*.test.ts", "**/*.spec.ts", "../testing/**/*"]}' > tsconfig.docs.json && npx typedoc --out ../docs/api/sandbox --tsconfig tsconfig.docs.json src || true
	# Hypervisor Docs (pdoc)
	cd hypervisor && pip install -r requirements.txt && pip install pdoc && PYTHONPATH=src:../ pdoc -o ../docs/api/hypervisor ./src || true
	# Grid Docs (GoMarkDoc)
	export GOPATH=$$HOME/go && export PATH=$$PATH:$$GOPATH/bin && go install github.com/princjef/gomarkdoc/cmd/gomarkdoc@latest && mkdir -p docs/api/grid && cd grid && $$HOME/go/bin/gomarkdoc -o ../docs/api/grid/README.md ./... || true

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

build-schemas:
	@if ! command -v capnp >/dev/null 2>&1; then echo "capnp CLI not installed"; false; fi
	@if ! command -v capnpc-go >/dev/null 2>&1; then echo "capnpc-go CLI not installed"; false; fi
	mkdir -p grid/types hypervisor/src/models
	capnp compile -I schemas -ogo:grid/types schemas/aicp_intent.capnp
	capnp compile -I schemas -ocapnp schemas/aicp_intent.capnp
	capnp compile -I schemas -ogo:grid/types schemas/aicp_intent.capnp
	cp schemas/aicp_intent.capnp hypervisor/src/models/
	@echo 'For Python, pycapnp loads .capnp files at runtime'

compile-capnp:
	@command -v capnp >/dev/null 2>&1 || (echo "capnp CLI not installed"; exit 1)
	capnp compile -I schemas -ocapnp schemas/aicp_intent.capnp

verify-transformer-toolchains:
	@command -v go >/dev/null 2>&1 || (echo "go CLI not installed"; exit 1)
	@command -v python3 >/dev/null 2>&1 || (echo "python3 CLI not installed"; exit 1)
	@command -v node >/dev/null 2>&1 || (echo "node CLI not installed"; exit 1)
	@command -v npm >/dev/null 2>&1 || (echo "npm CLI not installed"; exit 1)
	@command -v capnp >/dev/null 2>&1 || (echo "capnp CLI not installed"; exit 1)
	@go version
	@python3 --version
	@node --version
	@npm --version
	@capnp --version

hardhat-compile:
	cd grid/contracts && npx hardhat compile

transformer-grid-e2e:
	cd grid && go test ./p2p -run 'TestRouteIntent_LatentVectorRoutesToProposalTensor|TestDecodeProposalTensor_RejectsNonModelRun|TestDecodeProposalTensor_UsesCapnpMetadataFallback'

transformer-hypervisor-e2e:
	PYTHONPATH=. pytest -q hypervisor/src/engine/aicp_e2e_test.py

transformer-gate: verify-transformer-toolchains compile-capnp hardhat-compile transformer-grid-e2e transformer-hypervisor-e2e

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

test-mtls:
	python3 scripts/test_mtls.py

test-sandbox-identity:
	python3 scripts/test_sandbox_identity.py

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

verify-gas-target:
	cd grid/contracts && npm run test:gas

verify-sbom:
	./scripts/generate_sbom.sh
	python3 scripts/verify_sbom.py

verify-genesis-ceremony:
	python3 scripts/test_genesis_ceremony.py

steering-index:
	python3 scripts/generate_agent_steering_index.py
