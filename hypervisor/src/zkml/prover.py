import json
import numpy as np
import base64
import os
import tempfile
import torch
import ezkl
import hashlib
import asyncio
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
    """

    def __init__(self, weights: list[float] = None, bias: float = 0.0):
        # We use a simple linear/perceptron model.
        self.weights = weights if weights is not None else [0.5, -0.2, 0.8]
        self.bias = bias
        self.model_commitment = self._generate_commitment()

    def _generate_commitment(self) -> str:
        model_data = json.dumps({"weights": self.weights, "bias": self.bias})
        return hashlib.sha256(model_data.encode()).hexdigest()

    def _prepare_input(self, input_vector: list[float]) -> np.ndarray:
        x_np = np.array(input_vector)
        if len(x_np) != len(self.weights):
            if len(x_np) < len(self.weights):
                x_np = np.pad(x_np, (0, len(self.weights) - len(x_np)))
            else:
                x_np = x_np[:len(self.weights)]
        return x_np

    def _prepare_forward_pass(self, x_np: np.ndarray, tempdir: str) -> tuple[list[float], str, str, str]:
        model = SimpleModel(self.weights, self.bias)
        model.eval()

        x = torch.tensor([x_np], dtype=torch.float32)
        y = model(x)
        output_vector = y.detach().numpy()[0].tolist()

        onnx_path = os.path.join(tempdir, "network.onnx")
        input_path = os.path.join(tempdir, "input.json")
        settings_path = os.path.join(tempdir, "settings.json")

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

        data = dict(input_data=[[x.item() for x in x.flatten()]], output_data=[[y.item() for y in y.flatten()]])
        with open(input_path, "w") as f:
            json.dump(data, f)

        return output_vector, onnx_path, input_path, settings_path

    def _generate_zk_proof(self, onnx_path: str, input_path: str, settings_path: str, tempdir: str) -> tuple[str, str]:
        compiled_model_path = os.path.join(tempdir, "network.ezkl")
        vk_path = os.path.join(tempdir, "vk.key")
        pk_path = os.path.join(tempdir, "pk.key")
        proof_path = os.path.join(tempdir, "proof.json")
        witness_path = os.path.join(tempdir, "witness.json")
        srs_path = os.path.join(tempdir, "kzg.srs")

        ezkl.gen_settings(onnx_path, settings_path)
        ezkl.calibrate_settings(input_path, onnx_path, settings_path, "resources")
        ezkl.compile_circuit(onnx_path, compiled_model_path, settings_path)

        async def run_ezkl_commands():
            await ezkl.get_srs(settings_path, None, srs_path)
            ezkl.setup(compiled_model_path, vk_path, pk_path, srs_path)
            ezkl.gen_witness(input_path, compiled_model_path, witness_path, vk_path, srs_path)
            ezkl.prove(witness_path, compiled_model_path, pk_path, proof_path, srs_path)

        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                raise RuntimeError
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        if loop.is_running():
            import threading
            def run_in_thread():
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                new_loop.run_until_complete(run_ezkl_commands())
                new_loop.close()
            thread = threading.Thread(target=run_in_thread)
            thread.start()
            thread.join()
        else:
            loop.run_until_complete(run_ezkl_commands())

        return proof_path, vk_path

    def _extract_assets(self, proof_path: str, settings_path: str, vk_path: str) -> tuple[str, str, str]:
        with open(proof_path, "r") as f:
            proof_data = f.read()
        with open(settings_path, "r") as f:
            settings_data = f.read()
        with open(vk_path, "rb") as f:
            vk_data = base64.b64encode(f.read()).decode('utf-8')
        return proof_data, settings_data, vk_data

    def infer_and_prove(self, input_vector: list[float]) -> dict:
        """
        Executes the forward pass and generates the accompanying zk-proof.
        """
        x_np = self._prepare_input(input_vector)

        with tempfile.TemporaryDirectory() as tempdir:
            output_vector, onnx_path, input_path, settings_path = self._prepare_forward_pass(x_np, tempdir)
            proof_path, vk_path = self._generate_zk_proof(onnx_path, input_path, settings_path, tempdir)
            proof_data, settings_data, vk_data = self._extract_assets(proof_path, settings_path, vk_path)

        return {
            "model_commitment": self.model_commitment,
            "input": x_np.tolist(),
            "output": output_vector,
            "proof": proof_data,
            "vk": vk_data,
            "settings": settings_data
        }
