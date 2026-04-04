#!/bin/bash

# AXIOM-MESH: Pre-Public Release Security Hardening Script
# This script performs a quick security check and setup for the repository.

set -e

echo "🚀 Starting AXIOM-MESH Security Hardening..."

# 1. Create necessary directories
mkdir -p .github/workflows
mkdir -p scripts
mkdir -p docs
mkdir -p certs

# 2. Check for sensitive files that shouldn't be committed
echo "🔍 Checking for sensitive files..."
SENSITIVE_FILES=(".env" "certs/*.key" "certs/*.pem" "certs/*.pfx" "certs/*.p12")
for file in "${SENSITIVE_FILES[@]}"; do
    if git ls-files --error-unmatch "$file" > /dev/null 2>&1; then
        echo "⚠️ WARNING: $file appears to be tracked by git! Run 'git rm --cached $file' to stop tracking it."
    fi
done

# 3. Verify .gitignore exists and contains security entries
if [ ! -f .gitignore ]; then
    echo "⚠️ .gitignore not found! Creating a basic one..."
    cat > .gitignore <<EOF
.env
.env.*
!.env.example
node_modules/
dist/
build/
certs/*.key
certs/*.pem
certs/*.pfx
certs/*.p12
!certs/.gitkeep
EOF
else
    echo "✅ .gitignore found."
fi

# 4. Check for SECURITY.md
if [ ! -f .github/SECURITY.md ]; then
    echo "⚠️ SECURITY.md not found! Please create one in .github/ directory."
else
    echo "✅ SECURITY.md found."
fi

# 5. Check for Dependabot configuration
if [ ! -f .github/dependabot.yml ]; then
    echo "⚠️ dependabot.yml not found! Please create one in .github/ directory."
else
    echo "✅ dependabot.yml found."
fi

# 6. Set correct permissions for scripts
echo "🔑 Setting script permissions..."
chmod +x scripts/*.sh 2>/dev/null || true

echo "✅ Hardening check complete! Please review any warnings above."
echo "💡 Recommendation: Run a secret scanner like 'trufflehog' locally before pushing."
