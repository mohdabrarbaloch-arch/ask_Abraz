import urllib.request
import json
import ssl

API_KEY = "AIzaSyDYfB-Xd6-Y0GeOR8Rz1bhPztU9aEziUJc"
URL = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"

print(f"Testing Key: {API_KEY[:5]}...{API_KEY[-4:]}")

try:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    req = urllib.request.Request(URL, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, context=ctx) as response:
        print(f"Status: {response.status}")
        data = json.loads(response.read().decode('utf-8'))
        print("Available Models:")
        for m in data.get('models', []):
            if 'generateContent' in m.get('supportedGenerationMethods', []):
                print(f"- {m['name']}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
