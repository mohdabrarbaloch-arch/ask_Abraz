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
        data = json.loads(response.read().decode('utf-8'))
        with open('models.txt', 'w') as f:
            for model in data.get('models', []):
                f.write(f"Name: {model['name']}\n")
                if 'supportedGenerationMethods' in model:
                    f.write(f"Methods: {model['supportedGenerationMethods']}\n")
                f.write("-" * 20 + "\n")
        print("Models saved to models.txt")
except Exception as e:
    print(f"Error: {e}")
