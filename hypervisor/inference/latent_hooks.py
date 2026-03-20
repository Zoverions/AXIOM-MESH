import torch
import math

def register_steering_hook(model_instance, steering_vector: torch.Tensor):
    modules = list(model_instance.children())
    total_layers = len(modules)

    if total_layers == 0:
        return

    target_idx = math.floor(total_layers * 0.67)
    target_module = modules[target_idx]

    def forward_hook(module, input, output):
        return output + steering_vector

    target_module.register_forward_hook(forward_hook)
