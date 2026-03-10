#!/bin/bash
# Initialization script for Phase 1 of AxiomMesh v2.4.0
# Builds the TypeScript Omni-Gateway (Pillar 4) and the Python Cognitive Hypervisor (Pillar 2).

echo "Starting Phase 1 Scaffolding..."

# Omni-Gateway (Pillar 4)
mkdir -p gateway
cd gateway
if [ ! -f package.json ]; then
    npm init -y
fi
npm install typescript @types/node tsx --save-dev
npx tsc --init
mkdir -p src
touch src/index.ts
echo "Omni-Gateway scaffolded."
cd ..

# Cognitive Hypervisor (Pillar 2)
mkdir -p hypervisor
cd hypervisor
if [ ! -f requirements.txt ]; then
    touch requirements.txt
fi
echo "fastapi" >> requirements.txt
echo "uvicorn" >> requirements.txt
mkdir -p src
touch main.py
echo "Cognitive Hypervisor scaffolded."
cd ..

echo "Phase 1 Initialization Complete."
