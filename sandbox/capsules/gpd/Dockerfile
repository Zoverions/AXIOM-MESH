FROM python:3.11-slim

# Install get-physics-done tool
RUN pip install uv && uv tool install get-physics-done

# Add uv tools to PATH
ENV PATH="/root/.local/bin:${PATH}"

# Set up workspace
WORKDIR /workspace

# Copy required capsule directories and contracts
COPY SKILL_MANIFEST.json SOURCE_DESCRIPTOR.json REBUILD_ATTESTATION.json SIGNATURE.sig /workspace/
COPY adapter/ /workspace/adapter/
COPY runtime/ /workspace/runtime/
COPY schemas/ /workspace/schemas/
COPY sbom/ /workspace/sbom/

# Optional .gpd if it still applies
# COPY .gpd/ /workspace/.gpd/

# Set entrypoint to use our adapter instead of direct gpd tool
ENTRYPOINT ["python3", "/workspace/adapter/tool_translation.py"]
