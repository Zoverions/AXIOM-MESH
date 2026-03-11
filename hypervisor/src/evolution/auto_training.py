import threading
import time
import random
import requests
import json
import os
import ast

SANDBOX_URL = os.environ.get("SANDBOX_URL", "http://localhost:4000/execute")

class CodeMutator(ast.NodeTransformer):
    def visit_Constant(self, node):
        # Mutate numeric constants slightly
        if isinstance(node.value, (int, float)):
            mutation = random.uniform(0.1, 1.5)
            # Create a new Constant node with the mutated value
            return ast.Constant(value=mutation)
        return node

class AutoTrainingLoop:
    def __init__(self):
        self.running = False
        self.thread = None
        self.best_loss = float('inf')
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

    def _experiment(self):
        print(f"[AutoTraining] Starting new experiment. Current best loss: {self.best_loss}")
        proposed_code = self._mutate_code(self.best_code)

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
                    print(f"[AutoTraining] Improved! Updating best code.")
                    self.best_loss = loss
                    self.best_code = proposed_code
                else:
                    print(f"[AutoTraining] Discarded.")
            else:
                print(f"[AutoTraining] Failed to parse loss from output:\n{stdout}")

        except Exception as e:
            print(f"[AutoTraining] Experiment failed: {e}")
