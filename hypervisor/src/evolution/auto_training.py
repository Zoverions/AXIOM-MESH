import threading
import time
import random
import requests
import json
import os
import ast
import hmac
import hashlib
import uuid
from datetime import datetime, timezone

SANDBOX_URL = os.environ.get("SANDBOX_URL", "http://localhost:4000/execute")

def build_signed_headers(api_key: str, payload: dict) -> dict:
    timestamp_ms = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    nonce = str(uuid.uuid4())
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    body_hash = hashlib.sha256(payload_bytes).hexdigest()
    signature_payload = f"{timestamp_ms}:{nonce}:{body_hash}"
    signature = hmac.new(api_key.encode("utf-8"), signature_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return {
        "Authorization": f"Bearer {api_key}",
        "X-Axiom-Timestamp": timestamp_ms,
        "X-Axiom-Nonce": nonce,
        "X-Axiom-Signature": signature,
    }

class ModificationPolicy:
    """
    Governs rules for allowed self-mutations during AutoTraining.
    """
    def __init__(self):
        self.allowed_modules = {"math", "random", "datetime", "typing", "collections", "itertools"}
        self.forbidden_names = {
            "__import__", "eval", "exec", "open", "compile",
            "globals", "locals", "vars", "dir",
            "getattr", "setattr", "delattr", "hasattr",
        }
        self.max_lines = 100

    def evaluate(self, code_str: str) -> bool:
        """
        Evaluates the proposed code against safety and policy rules.
        """
        lines = code_str.strip().split('\n')
        if len(lines) > self.max_lines:
            return False

        try:
            tree = ast.parse(code_str)
        except SyntaxError:
            return False

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split(".")[0] not in self.allowed_modules:
                        return False
            elif isinstance(node, ast.ImportFrom):
                if not node.module or node.module.split(".")[0] not in self.allowed_modules:
                    return False
            elif isinstance(node, ast.Name):
                # Block known dangerous built-ins and all double-underscore variables/attributes
                if node.id in self.forbidden_names or node.id.startswith("__"):
                    return False
            elif isinstance(node, ast.Attribute):
                # Block accessing any double-underscore attributes (e.g., __class__, __dict__, __globals__)
                if node.attr in self.forbidden_names or node.attr.startswith("__"):
                    return False
            elif isinstance(node, ast.Constant):
                # Block any string literal containing "__" to prevent dynamic bypasses
                if isinstance(node.value, str) and "__" in node.value:
                    return False
        return True


class CodeMutator(ast.NodeTransformer):
    def visit_Constant(self, node):
        # Mutate numeric constants slightly
        if isinstance(node.value, (int, float)):
            mutation = random.uniform(0.1, 1.5)
            # Create a new Constant node with the mutated value
            return ast.Constant(value=mutation)
        return node

class AutoTrainingLoop:
    def __init__(self, human_approval_required: bool = False):
        self.running = False
        self.thread = None
        self.best_loss = float('inf')
        self.policy = ModificationPolicy()
        self.human_approval_required = human_approval_required
        self.best_code = """
def train():
    loss = 1.0
    return loss
print(f"loss={train()}")
"""

    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._run_loop, daemon=True)
            self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()

    def _run_loop(self):
        while self.running:
            time.sleep(15) # Wait between experiments
            self._experiment()

    def _mutate_code(self, code):
        try:
            tree = ast.parse(code)
            mutator = CodeMutator()
            mutated_tree = mutator.visit(tree)
            ast.fix_missing_locations(mutated_tree)
            return ast.unparse(mutated_tree)
        except Exception as e:
            print(f"[AutoTraining] AST mutation failed: {e}")
            return code

    def _request_approval(self, proposed_code: str, loss: float) -> bool:
        """
        Human or automatic gate for self-modification.
        """
        if not self.human_approval_required:
            # Automatic gate
            print(f"[AutoTraining Gate] Automatic approval granted for loss {loss:.4f}.")
            return True
        else:
            # Simulated human gate
            print(f"[AutoTraining Gate] Human approval required for loss {loss:.4f}.")
            print(f"Proposed Code:\n{proposed_code}")
            # Real implementation would block/wait for external input.
            approval = os.environ.get("AUTO_TRAINING_APPROVAL", "auto")
            if approval.lower() in ("yes", "true", "1", "auto"):
                print("[AutoTraining Gate] Approval granted.")
                return True
            else:
                print("[AutoTraining Gate] Approval denied.")
                return False

    def _experiment(self):
        print(f"[AutoTraining] Starting new experiment. Current best loss: {self.best_loss}")
        proposed_code = self._mutate_code(self.best_code)

        if not self.policy.evaluate(proposed_code):
            print(f"[AutoTraining] Proposed code failed policy evaluation. Discarded.")
            return

        try:
            sandbox_api_key = os.environ.get("SANDBOX_API_KEY")
            if not sandbox_api_key:
                print("[AutoTraining] Experiment failed: SANDBOX_API_KEY is not configured")
                return

            sandbox_payload = {"language": "python", "code": proposed_code}
            headers = build_signed_headers(sandbox_api_key, sandbox_payload)

            # Execute in the secure Node.js Sandbox container
            res = requests.post(SANDBOX_URL, json=sandbox_payload, headers=headers)
            res.raise_for_status()
            result_data = res.json()
            stdout = result_data.get("result", {}).get("stdout", "")

            # Parse the loss from stdout (e.g., looking for 'loss=0.842')
            loss = None
            for line in stdout.split('\n'):
                if "loss=" in line:
                    try:
                        loss = float(line.split("loss=")[1].strip())
                    except ValueError:
                        pass

            if loss is not None:
                print(f"[AutoTraining] Experiment finished. Loss: {loss:.4f}")
                if loss < self.best_loss:
                    print(f"[AutoTraining] Improved!")
                    if self._request_approval(proposed_code, loss):
                        print(f"[AutoTraining] Updating best code.")
                        self.best_loss = loss
                        self.best_code = proposed_code
                    else:
                        print(f"[AutoTraining] Update rejected by gate.")
                else:
                    print(f"[AutoTraining] Discarded.")
            else:
                print(f"[AutoTraining] Failed to parse loss from output:\n{stdout}")

        except Exception as e:
            print(f"[AutoTraining] Experiment failed: {e}")
