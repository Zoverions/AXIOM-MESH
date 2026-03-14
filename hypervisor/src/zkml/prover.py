import json
import random
import numpy as np

# Use the same Safe Prime P (RFC 3526 1536-bit MODP Group) as in zkp.go
P_HEX = "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF"
P = int(P_HEX, 16)
Q = (P - 1) // 2

# Generators for Pedersen Commitments
G = 2
H = 3  # H can be any generator where log_G(H) is unknown

# Scaling factor to convert floats to integers for cryptographic operations
SCALE = 10000

class EdgeZKMLProver:
    """
    Implements a Zero-Knowledge Proof for Machine Learning Inference using
    Homomorphic Pedersen Commitments over the RFC 3526 1536-bit MODP Group.

    This proves that an edge node correctly executed a specific linear model
    (dot product + bias) on the given inputs without revealing the model's weights.
    """
    def __init__(self, weights: list[float] = None, bias: float = 0.0):
        # We use a linear/perceptron model.
        self.weights = np.array(weights if weights is not None else [0.5, -0.2, 0.8])
        self.bias = bias

        # Cryptographic state for ZKP
        self.r_weights = [random.randrange(1, Q) for _ in self.weights]
        self.r_bias = random.randrange(1, Q)

        self.model_commitment = self._generate_commitment()

    def _generate_commitment(self) -> str:
        """
        Generates Pedersen Commitments C = G^v * H^r (mod P) for the weights and bias.
        Allows verifiers to ensure the exact model was executed without seeing the weights.
        """
        commitments = {"C_w": [], "C_b": ""}

        for w, r in zip(self.weights, self.r_weights):
            v = int(round(w * SCALE))
            # Handle negative values using modular arithmetic (v mod Q)
            v = v % Q
            c = (pow(G, v, P) * pow(H, r, P)) % P
            commitments["C_w"].append(hex(c))

        # The bias is added to sum(w * x), where w and x are both scaled by SCALE.
        # Thus, sum(w * x) is effectively scaled by SCALE^2.
        # To match, the bias must also be scaled by SCALE^2.
        v_b = int(round(self.bias * (SCALE ** 2)))
        v_b = v_b % Q
        c_b = (pow(G, v_b, P) * pow(H, self.r_bias, P)) % P
        commitments["C_b"] = hex(c_b)

        return json.dumps(commitments)

    def infer_and_prove(self, input_vector: list[float]) -> dict:
        """
        Executes the forward pass and generates the accompanying zk-proof.
        """
        x = np.array(input_vector)

        # Ensure input dimensions match model
        if len(x) != len(self.weights):
            if len(x) < len(self.weights):
                x = np.pad(x, (0, len(self.weights) - len(x)))
            else:
                x = x[:len(self.weights)]

        # 1. Edge Compute (The Inference)
        # Compute exact float output to avoid scaling error cascade in ML application,
        # but the proof works on scaled fixed-point integers.
        y = np.dot(x, self.weights) + self.bias
        output_vector = [float(y)]

        # 2. zk-Proof Generation
        # Homomorphic property: C_y = prod(C_w_i ^ x_i) * C_b = G^y * H^{sum(r_w_i * x_i) + r_b}
        # The proof is simply the combined randomness r_y.
        r_y = self.r_bias
        for xi, rwi in zip(x, self.r_weights):
            x_scaled = int(round(xi * SCALE))
            r_y = (r_y + x_scaled * rwi) % Q

        proof = hex(r_y)

        return {
            "model_commitment": self.model_commitment,
            "input": x.tolist(),
            "output": output_vector,
            "proof": proof
        }
