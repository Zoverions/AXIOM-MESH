from hypervisor.src.zkml.prover import EdgeZKMLProver

prover = EdgeZKMLProver(weights=[0.5, -0.2, 0.8, 1.2])
res = prover.infer_and_prove([1.0, 2.0, -1.0])
print(res)

import requests
try:
    x = requests.post("http://localhost:5000/zkml/verify", json=res)
    print(x.text)
except:
    pass
