import requests
import os

api_key = os.getenv('GEOAPIFY_API_KEY', 'your_geoapify_api_key_here')
url = f"https://api.geoapify.com/v1/geocode/search?text=Paris&apiKey={api_key}"

response = requests.get(url)
if response.status_code == 200:
    print("✅ API key works!")
    print(response.json())
else:
    print("❌ Error:", response.status_code, response.text)
