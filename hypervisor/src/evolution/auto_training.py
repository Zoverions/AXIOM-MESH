import threading
import time
import random
import requests
import json
import os
import ast

SANDBOX_URL = os.environ.get("SANDBOX_URL", "http://localhost:4000/execute")

class ModificationPolicy:
    """
    Governs rules for allowed self-mutations during AutoTraining.
    """
    def __init__(self):
        self.forbidden_modules = {"os", "sys", "subprocess", "shlex", "pty", "socket"}
        self.forbidden_funcs = {"__import__", "eval", "exec", "open"}
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
                    if alias.name.split(".")[0] in self.forbidden_modules:
                        return False
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module.split(".")[0] in self.forbidden_modules:
                    return False
            elif isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in self.forbidden_funcs:
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
            # Execute in the secure Node.js Sandbox container
            res = requests.post(SANDBOX_URL, json={"language": "python", "code": proposed_code})
            result_data = res.json()
            stdout = result_data.get("stdout", "")

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
