import requests
import os

GATEWAY_REST_URL = "http://localhost:3000/api/v1/intent/process"
GATEWAY_API_KEY = os.environ.get("GATEWAY_API_KEY")

# Attempt to load from .env file if available and python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
    if not GATEWAY_API_KEY:
        GATEWAY_API_KEY = os.environ.get("GATEWAY_API_KEY")
except ImportError:
    pass

def send_intent(content: str):
    payload = {
        "channel": "cli",
        "content": content,
        "metadata": {}
    }
    print(f"Sending: {content}")
    headers = {}
    if GATEWAY_API_KEY:
        headers["Authorization"] = f"Bearer {GATEWAY_API_KEY}"

    try:
        response = requests.post(GATEWAY_REST_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        print(f"Response: {data.get('response', data)}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    print("AxiomMesh CLI - Interactive Mode")
    print("Type 'exit' to quit.")
    while True:
        try:
            content = input("> ")
            if content.lower() in ['exit', 'quit']:
                break
            if content:
                send_intent(content)
        except KeyboardInterrupt:
            break
