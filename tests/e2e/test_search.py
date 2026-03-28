import sys
import unittest
from unittest.mock import patch, MagicMock
sys.path.append('sandbox/capsules/websearch/adapter')
from tool_translation import map_intent_to_search_args
import json

class TestWebSearchCapsule(unittest.TestCase):
    # MOCK-12: Rewritten tests to properly validate the actual search API integration.

    @patch('requests.get')
    def test_search_task_duckduckgo(self, mock_get):
        # mock duckduckgo response
        mock_response = MagicMock()
        mock_response.text = '<html><body><div class="result"><a class="result__a">Test Title</a><a class="result__snippet">Test Snippet</a></div></body></html>'
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response

        intent = {"canonical_task": "search", "query": "hypervisor", "parameters": {}}
        result = map_intent_to_search_args(intent)

        self.assertEqual(result.get("operation"), "search")
        self.assertEqual(result.get("query"), "hypervisor")
        self.assertIn("Test Title: Test Snippet", result.get("results", []))

    @patch('requests.get')
    @patch('urllib.request.urlopen')
    def test_search_task_wikipedia_fallback(self, mock_urlopen, mock_get):
        # mock requests failure to trigger fallback
        mock_get.side_effect = Exception("duckduckgo blocked")

        # mock wikipedia response
        mock_wiki_response = MagicMock()
        mock_wiki_response.read.return_value = json.dumps({
            "query": {
                "search": [
                    {"title": "Wiki Title", "snippet": "Wiki Snippet"}
                ]
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_wiki_response

        intent = {"canonical_task": "search", "query": "hypervisor fallback", "parameters": {}}
        result = map_intent_to_search_args(intent)

        self.assertEqual(result.get("operation"), "search")
        self.assertEqual(result.get("query"), "hypervisor fallback")
        self.assertIn("Wiki Title: Wiki Snippet", result.get("results", []))

if __name__ == '__main__':
    unittest.main()
