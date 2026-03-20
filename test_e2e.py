import urllib.request
import json
import time
import subprocess

with open('cli/skill-sign/signed_capsule.json', 'r') as f:
    payload = json.load(f)

# we need to start the sandbox server with the correct public key
with open('cli/skill-sign/public.pem', 'r') as f:
    pub = f.read()

import os
env = os.environ.copy()
env['CAPSULE_PUBLIC_KEY'] = pub
env['SANDBOX_PORT'] = '4444'

proc = subprocess.Popen(["npx", "ts-node", "src/index.ts"], cwd="sandbox", env=env)
time.sleep(4)

try:
    req = urllib.request.Request("http://localhost:4444/capsule/publish", data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    res = urllib.request.urlopen(req)
    print("Publish status:", res.status)

    id = payload['manifest']['id']
    req = urllib.request.Request(f"http://localhost:4444/capsule/{id}/verify")
    res = urllib.request.urlopen(req)
    data = json.loads(res.read())
    print("Verify status:", data)
    assert data['verified'] == True
finally:
    proc.kill()
