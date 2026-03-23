# Contributing to AXIOM-MESH

First off, thank you for considering contributing to AXIOM-MESH! It's people like you that make AXIOM-MESH such a great tool.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. We expect all contributors to maintain a welcoming and inclusive environment.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally: `git clone https://github.com/your-username/AXIOM-MESH.git`
3.  **Create a new branch** for your feature or bug fix: `git checkout -b feature/your-feature-name`
4.  **Install dependencies**:
    *   For the Hypervisor (Python), run `cd hypervisor && pip install uv && uv pip install -r requirements.txt --system`.
    *   For Gateway/Sandbox (TypeScript), run `npm install` in the respective directories.
    *   For Grid (Go), ensure Go is installed and run `go build ./...`.
    *   For Contracts (Solidity), run `cd grid/contracts && npm install && npx hardhat compile`.

## Development Setup

We have four core pillars: Gateway, Hypervisor, Sandbox, and Grid. Refer to `docs/HOWTO/run-local-stack.md` to set up and run the full stack locally.

## Pull Request Process

1.  **Update documentation**: Ensure any changes to APIs, contracts, or interfaces are reflected in the relevant documentation under `docs/`.
2.  **Add tests**: Write tests for your changes. Ensure they pass locally before submitting.
3.  **Update `MASTER-TODO.md`**: If your PR relates to an active task in `docs/MASTER-TODO.md`, update the list.
4.  **Submit your PR**: Open a Pull Request from your branch to the main AXIOM-MESH repository.
5.  **Code Review**: A maintainer will review your PR. You may need to make changes based on their feedback.

## Reporting Bugs

If you find a bug, please create an issue on GitHub with a clear description, steps to reproduce, and any relevant logs or error messages.

Thank you for contributing!
