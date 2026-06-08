import urllib.request
import urllib.parse
import json

def test_root():
    try:
        url = 'http://127.0.0.1:8000/'
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            print("=== ROOT ENDPOINT RESPONSE ===")
            print(json.dumps(data, indent=2))
            return True
    except Exception as e:
        print(f"Root endpoint failed: {e}")
        return False

def test_config():
    try:
        url = 'http://127.0.0.1:8000/config'
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            print("\n=== CONFIG ENDPOINT RESPONSE ===")
            print(json.dumps(data, indent=2))
            return True
    except Exception as e:
        print(f"Config endpoint failed: {e}")
        return False

def test_analyze():
    try:
        url = 'http://127.0.0.1:8000/analyze'
        
        # We need to construct a multipart/form-data request manually in urllib
        # since we are sending Form data.
        boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
        data = []
        
        # Add 'query' field
        data.append(f'--{boundary}')
        data.append('Content-Disposition: form-data; name="query"')
        data.append('')
        data.append('HVAC AC-X200 cooling issue')
        
        # Add 'session_id' field
        data.append(f'--{boundary}')
        data.append('Content-Disposition: form-data; name="session_id"')
        data.append('')
        data.append('test_session_123')
        
        data.append(f'--{boundary}--')
        data.append('')
        
        body = '\r\n'.join(data).encode('utf-8')
        
        req = urllib.request.Request(url, data=body)
        req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
        
        print("\n=== SENDING ANALYZE REQUEST ===")
        with urllib.request.urlopen(req, timeout=60) as response:
            resp_data = json.loads(response.read().decode())
            print("=== ANALYZE ENDPOINT RESPONSE ===")
            # Just print keys and basic details to avoid massive output
            print(f"Keys in response: {list(resp_data.keys())}")
            print(f"Detected Issue: {resp_data.get('detected_issue')}")
            print(f"Confidence: {resp_data.get('confidence_score')}")
            print(f"Estimated Repair Time: {resp_data.get('resolution_workflow', {}).get('estimated_repair_time')}")
            print(f"First 2 steps: {resp_data.get('suggested_steps')[:2] if resp_data.get('suggested_steps') else []}")
            return True
    except Exception as e:
        print(f"Analyze endpoint failed: {e}")
        if hasattr(e, 'read'):
            try:
                print("Error response content:", e.read().decode())
            except Exception:
                pass
        return False

if __name__ == '__main__':
    print("Starting backend integration tests...")
    r1 = test_root()
    r2 = test_config()
    r3 = test_analyze()
    print(f"\nSummary: Root: {r1}, Config: {r2}, Analyze: {r3}")
