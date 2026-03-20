import os
import torch
from safetensors.torch import load_file
import hypervisor.inference.latent_hooks as latent_hooks

def load_vector(file_path: str) -> torch.Tensor:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Tensor file not found: {file_path}")
    tensors = load_file(file_path)
    return next(iter(tensors.values()))

def get_steering_vector_for_intent(intent: str, tensors_dir: str = ".") -> torch.Tensor:
    intent_lower = intent.lower()
    if "rust" in intent_lower:
        file_name = "skill_rust_coder.safetensors"
    elif "thermodynamic" in intent_lower or "ethic" in intent_lower:
        file_name = "ethics_thermodynamic_v1.safetensors"
    else:
        file_name = "default_steering.safetensors"

    file_path = os.path.join(tensors_dir, file_name)
    return load_vector(file_path)

def apply_expert_memory(model_instance, intent: str, tensors_dir: str = "."):
    steering_vector = get_steering_vector_for_intent(intent, tensors_dir)
    latent_hooks.register_steering_hook(model_instance, steering_vector)
