import urllib.request
import json
import ssl

API_KEY = "AIzaSyCU2efXPYjGcev2-KEM4T1EDeJQJgua5UY"
URL = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"

try:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    req = urllib.request.Request(URL)
    with urllib.request.urlopen(req, context=ctx) as response:
        print(f"Status: {response.status}")
        data = json.loads(response.read().decode('utf-8'))
        print("Available Models:")
        for model in data.get('models', []):
            print(f"- {model['name']}")
            if 'supportedGenerationMethods' in model:
                 print(f"  Methods: {model['supportedGenerationMethods']}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
