import requests

GATEWAY_REST_URL = "http://localhost:3000/api/v1/intent/process"

def send_intent(content: str):
    payload = {
        "channel": "cli",
        "content": content,
        "metadata": {}
    }
    print(f"Sending: {content}")
    try:
        response = requests.post(GATEWAY_REST_URL, json=payload)
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
