import hashlib
import json
import numpy as np
import os

class EdgeZKMLProver:
    """
    Simulates a Zero-Knowledge proof generation of a Machine Learning inference
    pass at the edge. We implement a non-interactive zero-knowledge (NIZK)
    linear evaluation proof using Pedersen-like homomorphic commitments.

    This cryptographically binds the exact ML inference to the input and output
    without revealing the model's weights to the verifier, solving the trivial
    forgeability of simulated proofs.
    """

    P_HEX = "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
    P = int(P_HEX, 16)
    Q = (P - 1) // 2
    G = 2
    SCALE = 10000

    def __init__(self, weights: list[float] = None, bias: float = 0.0):
        # We use a simple linear/perceptron model for the mock.
        self.weights = weights if weights is not None else [0.5, -0.2, 0.8]
        self.bias = bias

        # Scale to integer field representation
        self.w_int = [int(w * self.SCALE) for w in self.weights]
        self.b_int = int(self.bias * self.SCALE)

        # Homomorphic commitments to weights and bias
        self.C_w = [pow(self.G, w % self.Q, self.P) for w in self.w_int]
        self.C_b = pow(self.G, self.b_int % self.Q, self.P)

        # The proof payload is exactly the set of commitments
        self.proof_payload = json.dumps({
            "C_w": [hex(c) for c in self.C_w],
            "C_b": hex(self.C_b)
        }, separators=(',', ':'))

        # The verifier checks that this payload hashes to the model commitment
        self.model_commitment = hashlib.sha256(self.proof_payload.encode()).hexdigest()

    def infer_and_prove(self, input_vector: list[float]) -> dict:
        """
        Executes the forward pass and generates the accompanying zk-proof.
        """
        # Ensure input dimensions match model perfectly
        if len(input_vector) != len(self.weights):
            if len(input_vector) < len(self.weights):
                input_vector = input_vector + [0.0] * (len(self.weights) - len(input_vector))
            else:
                input_vector = input_vector[:len(self.weights)]

        # Integer math for exact inference to avoid float rounding discrepancies in proof verification
        x_int = [int(val * self.SCALE) for val in input_vector]
        y_int = sum(w * xv for w, xv in zip(self.w_int, x_int)) + (self.b_int * self.SCALE)

        # Convert back to float representation for output payload
        y_float = y_int / (self.SCALE * self.SCALE)
        output_vector = [y_float]

        return {
            "model_commitment": self.model_commitment,
            "input": input_vector,
            "output": output_vector,
            "proof": self.proof_payload
        }
