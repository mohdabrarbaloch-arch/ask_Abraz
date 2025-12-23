import os
import urllib.request
import json
import ssl
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("API_KEY") or os.getenv("VITE_API_KEY")

if not API_KEY:
    print("API_KEY not found in environment!")
    exit(1)

print(f"Testing API Key: {API_KEY[:5]}...{API_KEY[-4:]}")

MODEL = "gemini-1.5-flash"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"

data = {
    "contents": [{
        "parts": [{"text": "Hello"}]
    }]
}

json_data = json.dumps(data).encode('utf-8')

try:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    req = urllib.request.Request(URL, data=json_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, context=ctx) as response:
        print(f"Status: {response.status}")
        print("Response headers:")
        print(response.headers)
        body = response.read()
        print("Body:", body.decode('utf-8', errors='replace'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print("Error headers:")
    print(e.headers)
    body = e.read()
    print("Error Body:", body.decode('utf-8', errors='replace'))
except Exception as e:
    print(f"General Error: {e}")
