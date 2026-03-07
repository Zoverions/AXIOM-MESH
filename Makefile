.PHONY: up down cli test

up:
	docker-compose up -d --build

down:
	docker-compose down

cli:
	python3 cli/axiom_cli.py

test:
	curl http://localhost:3000/health
	curl http://localhost:8000/health
	curl http://localhost:4000/health
	curl http://localhost:5000/health
