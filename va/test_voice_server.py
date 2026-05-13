
import requests
import os
import base64

def test_transcribe():
    url = "http://127.0.0.1:5000/transcribe"
    # Create a dummy silent wav file if possible, or just send a small file
    # For now, let's just see if the server responds to a malformed request
    try:
        print("Testing health endpoint...")
        r = requests.get("http://127.0.0.1:5000/health")
        print(f"Health: {r.status_code} - {r.json()}")
        
        print("\nTesting empty transcription...")
        # Sending empty request
        r = requests.post(url, files={})
        print(f"Empty status: {r.status_code} - {r.json()}")
        
    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == "__main__":
    test_transcribe()
