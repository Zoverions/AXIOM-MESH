with open("hypervisor/src/memory/archive.py", "r") as f:
    code = f.read()

code = code.replace("timeout=5.0,\n                        timeout=5.0", "timeout=5.0")
with open("hypervisor/src/memory/archive.py", "w") as f:
    f.write(code)
