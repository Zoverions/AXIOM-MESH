import sys
import json
import select
import urllib.request
import urllib.parse
try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    pass

def map_intent_to_search_args(normalized_intent):
    """
    Translates a canonical intent into web search operations.
    """
    task = normalized_intent.get("canonical_task")
    query = normalized_intent.get("query", "")
    params = normalized_intent.get("parameters", {})

    if task == "search":
        # Actual search API integration using duckduckgo html search
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            results = []
            if 'requests' in sys.modules:
                try:
                    response = requests.get('https://html.duckduckgo.com/html/', params={'q': query}, headers=headers, timeout=10)
                    response.raise_for_status()
                    soup = BeautifulSoup(response.text, 'html.parser')
                    for item in soup.find_all('div', class_='result'):
                        title = item.find('a', class_='result__a')
                        snippet = item.find('a', class_='result__snippet')
                        if title and snippet:
                            results.append(f"{title.get_text(strip=True)}: {snippet.get_text(strip=True)}")
                        if len(results) >= 5:
                            break
                except Exception:
                    pass

            if not results:
                # Fallback to wikipedia API using urllib if requests/duckduckgo blocked us
                url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
                    "action": "query", "list": "search", "srsearch": query, "format": "json"
                })
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=10) as wiki_resp:
                    data = json.loads(wiki_resp.read().decode('utf-8'))
                    for search_item in data.get('query', {}).get('search', [])[:5]:
                        results.append(f"{search_item.get('title')}: {search_item.get('snippet')}")

            return {"operation": "search", "query": query, "results": results if results else ["No results found"]}
        except Exception as e:
            return {"error": str(e), "operation": "search", "query": query}
    elif task == "scrape":
        url = normalized_intent.get("url", "")
        if not url:
            return {"error": "Missing URL for scrape task"}
        try:
            # Basic scrape
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            text = soup.get_text(separator=' ', strip=True)
            return {"operation": "scrape", "url": url, "text": text[:1000] + "..." if len(text) > 1000 else text}
        except Exception as e:
            return {"error": str(e)}
    else:
        return {"error": "Unknown task"}

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
