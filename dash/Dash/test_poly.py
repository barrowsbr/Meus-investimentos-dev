import urllib.request
import json

url = "https://gamma-api.polymarket.com/events?limit=5&active=true&closed=false"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print(json.dumps(data[:2], indent=2))
except Exception as e:
    print(f"Error: {e}")
