import requests

GRID_URL = "http://localhost:5000/skills"

class NetworkSync:
    def sync_skills(self):
        try:
            res = requests.get(GRID_URL)
            return res.json()
        except Exception as e:
            return {"error": str(e)}

    def publish_skill(self, skill_data):
        try:
            requests.post(GRID_URL, json=skill_data)
        except Exception as e:
            print(f"Error publishing skill: {e}")
