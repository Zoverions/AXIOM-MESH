import httpx

GRID_URL = "http://localhost:5000/skills"

class NetworkSync:
    async def sync_skills(self):
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(GRID_URL)
                return res.json()
        except Exception as e:
            return {"error": str(e)}

    async def publish_skill(self, skill_data):
        try:
            async with httpx.AsyncClient() as client:
                await client.post(GRID_URL, json=skill_data)
        except Exception as e:
            print(f"Error publishing skill: {e}")
