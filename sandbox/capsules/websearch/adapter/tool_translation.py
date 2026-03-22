import sys
import requests
import json
import select
from bs4 import BeautifulSoup

def map_intent_to_search_args(normalized_intent):
    """
    Translates a canonical intent into web search operations.
    """
    task = normalized_intent.get("canonical_task")
    query = normalized_intent.get("query", "")
    params = normalized_intent.get("parameters", {})

    if task == "search":
        # Simulate search by fetching a page
        try:
            # For demo, fetch a search URL or a specific page
            url = params.get("url", f"https://www.google.com/search?q={query}")
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                title = soup.title.string if soup.title else "No title"
                # Extract some text
                text = soup.get_text()[:1000]  # First 1000 chars
                return {"operation": "search", "query": query, "title": title, "snippet": text}
            else:
                return {"error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"error": str(e)}
    else:
        return {"error": "Unknown task"}

def execute_search_operation(args):
    """
    Executes the search operation.
    """
    return args

if __name__ == "__main__":
    # If run as a script, check stdin
    intent_processed = False

    dr, _, _ = select.select([sys.stdin], [], [], 0.0)
    if dr:
        raw_intent = sys.stdin.read()
        if raw_intent.strip():
            from normalize_intent import normalize_intent
            normalized = normalize_intent(raw_intent)
            result = map_intent_to_search_args(normalized)
            print(json.dumps(result))
            intent_processed = True

    if not intent_processed:
        # Default
        result = {"message": "Web search capsule ready"}
        print(json.dumps(result))