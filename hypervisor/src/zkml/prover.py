import hashlib
import json
import numpy as np

class EdgeZKMLProver:
    """
    Simulates the zero-knowledge proof generation of a machine learning inference
    pass at the edge. A real implementation would use Ezkl, Cairo, or RISC Zero
    to generate an actual cryptographic SNARK/STARK proof that proves the edge
    node ran the specific model weights on the specific input.
    """
    def __init__(self, weights: list[float] = None, bias: float = 0.0):
        # We use a simple linear/perceptron model for the mock.
        self.weights = np.array(weights if weights is not None else [0.5, -0.2, 0.8])
        self.bias = bias
        self.model_commitment = self._generate_commitment()

    def _generate_commitment(self) -> str:
        # A cryptographic commitment to the model parameters (weights, bias)
        # Allows verifiers to ensure the exact model was executed without seeing the weights.
        model_data = json.dumps({"weights": self.weights.tolist(), "bias": self.bias})
        return hashlib.sha256(model_data.encode()).hexdigest()

    def infer_and_prove(self, input_vector: list[float]) -> dict:
        """
        Executes the forward pass and generates the accompanying zk-proof.
        """
        x = np.array(input_vector)

        # Ensure input dimensions match model
        if len(x) != len(self.weights):
            # Pad with 0s or truncate to fit the model to avoid throwing errors during edge inference.
            if len(x) < len(self.weights):
                x = np.pad(x, (0, len(self.weights) - len(x)))
            else:
                x = x[:len(self.weights)]

        # 1. Edge Compute (The Inference)
        # Simple dot product + bias
        y = np.dot(x, self.weights) + self.bias
        output_vector = [float(y)]

        # 2. zk-Proof Generation
        # We need a proof that hash(commitment + input + output + proof) starts with "0000"
        # as expected by the Grid consensus (grid/consensus/zkml.go).
        base_str = self.model_commitment
        for val in input_vector:
            base_str += f"{val:f}"
        for val in output_vector:
            base_str += f"{val:f}"

        nonce = 0
        while True:
            proof_candidate = f"zkml-proof-{nonce}"
            h = hashlib.sha256((base_str + proof_candidate).encode()).hexdigest()
            if h.startswith("0000"):
                proof = proof_candidate
                break
            nonce += 1

        return {
            "model_commitment": self.model_commitment,
            "input": input_vector,
            "output": output_vector,
            "proof": proof
        }
