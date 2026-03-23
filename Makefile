.PHONY: up down cli test validate-release-evidence verify-evidence-bundles

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


validate-release-evidence:
	@test -n "$(RC_PATH)" || (echo "Usage: make validate-release-evidence RC_PATH=release-evidence/RC-<date>-<tag>" && exit 1)
	python3 scripts/validate_release_evidence.py $(RC_PATH)

verify-evidence-bundles:
	python3 scripts/verify_evidence_bundles.py
