import urllib.request
import json
import ssl

API_KEY = "AIzaSyCU2efXPYjGcev2-KEM4T1EDeJQJgua5UY"
MODEL = "gemini-pro"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"

data = {
    "contents": [{
        "parts": [{"text": "Hello"}]
    }]
}

json_data = json.dumps(data).encode('utf-8')

try:
    # Bypass SSL verification if needed (for local dev environments sometimes)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    req = urllib.request.Request(URL, data=json_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, context=ctx) as response:
        print(f"Status: {response.status}")
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
