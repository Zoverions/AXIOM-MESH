import sys
sys.path.append('sandbox/capsules/websearch/adapter')
from tool_translation import map_intent_to_search_args
import json

intent = {"canonical_task": "search", "query": "hypervisor", "parameters": {}}
result = map_intent_to_search_args(intent)
print(json.dumps(result, indent=2))
