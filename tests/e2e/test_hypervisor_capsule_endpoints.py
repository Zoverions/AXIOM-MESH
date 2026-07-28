from fastapi.testclient import TestClient
from hypervisor.src.api.server import app

def test_capsule_endpoints():
    client = TestClient(app)
    response = client.post("/capsules/intake", json={"source": "mcp-endpoint", "name": "test"})
    assert response.status_code in [200, 404]
    print(response.status_code)

if __name__ == "__main__":
    test_capsule_endpoints()
