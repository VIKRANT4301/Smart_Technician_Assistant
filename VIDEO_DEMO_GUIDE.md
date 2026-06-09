# Video Demo Guide: Smart Technician Assistant

## Goal
Create a working demo of the Smart Technician Assistant app showing:
1. backend startup
2. mobile app launch
3. image/audio diagnostic analysis
4. chat / RAG search example
5. result review and voice output

## Prerequisites
- Windows with Python 3.11+ installed
- Node 20+ and npm installed
- Expo CLI installed globally: `npm install -g expo-cli`
- A working API key in `backend_HF/.env` for either **GEMINI_API_KEY** or **HF_TOKEN**
- Local network access between mobile device and backend (same Wi-Fi) if using a phone

## Backend startup
1. Open PowerShell.
2. Navigate to the backend folder:
   ```powershell
   cd "c:\Smart Technician Assistant\backend_HF"
   ```
3. Activate the backend virtual environment and install dependencies:
   ```powershell
   if (-Not (Test-Path .venv)) {
     python -m venv .venv
   }
   . .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
4. Start the FastAPI backend:
   ```powershell
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
5. Confirm the backend is live by opening `http://127.0.0.1:8000/docs` in a browser.

## Mobile app startup
1. Open a second PowerShell window.
2. Navigate to the mobile app folder:
   ```powershell
   cd "c:\Smart Technician Assistant\mobile-app"
   ```
3. Install frontend dependencies:
   ```powershell
   npm install
   ```
4. Start Expo:
   ```powershell
   npm run start
   ```
5. If you want to run the app in a browser, use `npm run web`.

## Backend URL configuration
The mobile app uses the backend URL configured in `mobile-app/src/services/api.ts`:
- Web: `http://127.0.0.1:8000`
- Phone/Android: `http://192.168.1.9:8000`

If your machine uses a different local IP, update the backend URL in the mobile app settings screen.

## Demo use case
### 1. Start the system
- Backend running on `http://127.0.0.1:8000` or the local LAN IP.
- Expo running and the app visible in the simulator or phone.

### 2. Configure backend URL in the app
- Open **Settings** inside the mobile app.
- Set the backend URL to the host machine IP, for example:
  - `http://192.168.1.9:8000`
- Save settings.

### 3. Run a sample diagnostic
- Open the **Camera** or **Upload** screen.
- Capture or choose an equipment image.
- Optionally record an audio description of the fault.
- Enter a query like:
  - `The compressor is leaking near the front casing and the unit is overheating. What should I check first?`
- Send the analysis request.

### 4. Review output
- The app should display:
  - detected issue
  - safety notes
  - suggested repair steps
  - confidence / grounding scores
  - annotated image overlay
  - generated voice guidance if available

### 5. Try chat and knowledge retrieval
- Open the **Chat** tab.
- Send a question such as:
  - `Why is the HVAC compressor overheating?`
- Observe the response and the cited manual sources.

## Example demo script
1. Launch backend and show terminal logs.
2. Launch Expo and show the QR code or simulator.
3. Set backend URL in app settings.
4. Upload an image or choose a fallback image.
5. Send a diagnostic query.
6. Show the response screen and audio playback.
7. Open chat and ask a follow-up question.
8. Close with `History` and `Feedback` screen.

## Recording tips
- Use Windows Xbox Game Bar: `Win + G`
- Or use OBS Studio for a desktop recording
- Record the backend terminal, Expo terminal, and app screen together
- Narrate the key steps:
  - ``Starting backend``
  - ``Connecting app to backend``
  - ``Running diagnostics``
  - ``Inspecting the results``

## Notes
- If no API key is configured, the backend may run in local/mock fallback mode.
- For reliable mobile testing, use the same Wi-Fi network and confirm the device can reach the backend URL.

---

## Optional scripts
Use the provided PowerShell scripts to launch backend and mobile services quickly.
