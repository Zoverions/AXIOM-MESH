from hypervisor.src.zkml.prover import EdgeZKMLProver

prover = EdgeZKMLProver()
res = prover.infer_and_prove([1.0, 2.0, 3.0])
print(res)
