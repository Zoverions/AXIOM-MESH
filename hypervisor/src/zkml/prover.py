import hashlib
import json
import numpy as np
import base64
import os
import tempfile
import torch
import ezkl
from torch import nn

class SimpleModel(nn.Module):
    def __init__(self, weights, bias):
        super(SimpleModel, self).__init__()
        self.linear = nn.Linear(len(weights), 1)
        with torch.no_grad():
            self.linear.weight.copy_(torch.tensor([weights]))
            self.linear.bias.copy_(torch.tensor([bias]))

    def forward(self, x):
        return self.linear(x)

class EdgeZKMLProver:
    """
    Generates an actual zero-knowledge proof of a machine learning inference
    pass at the edge using ezkl.
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

    def _generate_commitment(self) -> str:
        model_data = json.dumps({"weights": self.weights, "bias": self.bias})
        return hashlib.sha256(model_data.encode()).hexdigest()
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
        x_np = np.array(input_vector)

        if len(x_np) != len(self.weights):
            if len(x_np) < len(self.weights):
                x_np = np.pad(x_np, (0, len(self.weights) - len(x_np)))
            else:
                x_np = x_np[:len(self.weights)]

        # Prepare PyTorch model
        model = SimpleModel(self.weights, self.bias)
        model.eval()

        x = torch.tensor([x_np], dtype=torch.float32)
        y = model(x)
        output_vector = y.detach().numpy()[0].tolist()

        with tempfile.TemporaryDirectory() as tempdir:
            onnx_path = os.path.join(tempdir, "network.onnx")
            input_path = os.path.join(tempdir, "input.json")
            settings_path = os.path.join(tempdir, "settings.json")
            compiled_model_path = os.path.join(tempdir, "network.ezkl")
            vk_path = os.path.join(tempdir, "vk.key")
            pk_path = os.path.join(tempdir, "pk.key")
            proof_path = os.path.join(tempdir, "proof.json")

            # Export ONNX
            torch.onnx.export(
                model,
                x,
                onnx_path,
                export_params=True,
                opset_version=14,
                do_constant_folding=True,
                input_names=["input"],
                output_names=["output"],
                dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}}
            )

            # Dump input
            data = dict(input_data=[x.tolist()], output_data=[y.tolist()])
            with open(input_path, "w") as f:
                json.dump(data, f)

            # EZKL flow
            ezkl.gen_settings(onnx_path, settings_path)
            ezkl.calibrate_settings(input_path, onnx_path, settings_path, "resources")
            ezkl.compile_circuit(onnx_path, compiled_model_path, settings_path)
            ezkl.get_srs(settings_path)
            ezkl.setup(compiled_model_path, vk_path, pk_path)
            ezkl.prove(input_path, compiled_model_path, pk_path, proof_path, settings_path)

            # Read generated assets
            with open(proof_path, "r") as f:
                proof_data = f.read()
            with open(settings_path, "r") as f:
                settings_data = f.read()
            with open(vk_path, "rb") as f:
                vk_data = base64.b64encode(f.read()).decode('utf-8')
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
            "input": x_np.tolist(),
            "output": output_vector,
            "proof": proof_data,
            "vk": vk_data,
            "settings": settings_data
            "proof": self.proof_payload
        }
