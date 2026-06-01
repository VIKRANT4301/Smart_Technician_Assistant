# Technical Architecture & Enterprise Scaling Specification
## Apex Industrial AI Platform

---

## 1. Enterprise System Architecture

Apex Industrial AI is designed to scale across multiple factory locations, supporting thousands of assets and technicians. The system adopts a hybrid edge-cloud architecture, ensuring low latency and complete operational continuity even during WAN/internet outages.

```
       +-------------------------------------------------------------+
       |                     ENTERPRISE CLOUD LAYER                  |
       |  - Global Knowledge Graph System    - Master Database       |
       |  - Central Administration Portal    - Enterprise API Gateway|
       +-------------------------------------------------------------+
                                      ^
                                      | Secure Sync (HTTPS/gRPC)
                                      v
       +-------------------------------------------------------------+
       |                      LOCAL PLANT EDGE LAYERS                |
       |  - Local Vector Cache               - Edge Inference Nodes  |
       |  - SQLite / Local Vector Store      - Local Asset Telemetry |
       +-------------------------------------------------------------+
            |                                                   |
            v Mobile API                                        v IoT Telemetry
       +--------------------+                              +--------------------+
       |  Field Technician  |                              | Asset Sensors      |
       |  Mobile Client     |                              | Temp, Vibration    |
       +--------------------+                              +--------------------+
```

### Multi-Tenant Data Partitioning
To support multiple manufacturing sites and organizational subdivisions securely, the database enforces strict logical schema partitioning:
* **Tenant Isolation**: Each client organization is mapped to a unique `Tenant ID`.
* **Site Isolation**: Factory locations (e.g., Munich Plant, Chennai Plant) are partitioned using `Site Code` scopes.
* **Role-Based Access Control (RBAC)**: Custom JWT credentials restrict access:
  - `Field Technicians` can read local manual vectors, perform scans, and log work orders.
  - `Plant Supervisors` can edit manuals, review metrics, and approve escalations.
  - `Reliability Engineers` can write to vector indices and inspect global failure graphs.

---

## 2. Technical Stack Specifications

### Backend (FastAPI Services)
* **Framework**: Python FastAPI (Uvicorn HTTP gateway).
* **AI Model Orchestration**:
  - Cloud reasoning: Google Gemini 2.5-Flash API for advanced multimodal analysis and semantic classification.
  - Edge/Offline reasoning: Ollama running local SLM weights (e.g., `phi3` or `llama3-8b`) on specialized local gateway nodes.
* **Vector Embeddings Store**: Local SQLite database combined with a NumPy Cosine Similarity calculation module, allowing lightweight and lightning-fast RAG operations without complex external vector databases.

### Frontend (Mobile React Native client)
* **Framework**: Expo SDK (React Native / TypeScript).
* **Styling & UI**: NativeWind Tailwind CSS, providing visual responsiveness and unified dark-cyberpunk styles.
* **State Management**: React Context API managing session history, server URL preferences, active diagnostic runs, and offline caches.
* **Speech Integration**: Expo AV for audio recording/playback, Google Text-to-Speech (gTTS) for vocal synthesized troubleshooting guidance.

---

## 3. Real-Time Telemetry & Simulation Layer

Industrial assets continuously emit telemetry (vibration frequency, temperature, pressure). To integrate this telemetry into the technician's diagnostic screen:
1. **Telemetry Feed**: The backend `/analyze` pipeline matches the scanned machine's serial/model to virtual sensor feeds.
2. **Curve Synthesis**: The backend creates representative telemetry curve arrays:
   - **Vibration Deviation Curve**: High deviation denotes shaft misalignment or loose components.
   - **Temperature Curve**: Rising thermal curves indicate bearing friction or electrical resistance.
3. **RUL Forecasting**: RUL is calculated by correlating sensor deviation severity with visual wear scores, providing a forecast percentage (e.g. 74% remaining).

---

## 4. Enterprise Integrations (ERP/CMMS/ServiceNow)

A key differentiator of Apex Industrial AI is its automated coordination with corporate ERP and CMMS suites:

### 1. SAP Plant Maintenance (PM) Integration
When a technician performs an inspection and detects an anomaly:
* The platform calls the `SAP PM OData REST API` to check for open maintenance notifications.
* If none exist, it triggers a `POST` request to create an SAP Work Order (Order Type: `PM01` - Planned Maintenance or `PM02` - Breakdown Maintenance).
* The backend caches the resulting SAP Work Order number (e.g., `WO-2026-90812`) and links it to the troubleshooting session.

### 2. IBM Maximo Asset Management Integration
* The system synchronizes the asset identity with Maximo's database using the `Maximo Integration Framework (MIF)`.
* Upon repair completion, the technician's rating and actual work duration are pushed back to update the asset's health index card in Maximo.

### 3. ServiceNow Integration
* If the RAG diagnostic confidence falls below the 60% safety threshold, the system blocks instructions and calls ServiceNow's `/api/now/table/incident` to open a high-priority incident.
* This alerts supervisors immediately and triggers safety escalation workflows.

---

## 5. Security & Compliance Policies

### Lockout/Tagout (LOTO) Compliance
The platform enforces strict safety SOP validation. If an electrical or hydraulic hazard is detected:
* The system requires the technician to check off safety check-boxes in the UI (e.g., "Confirm breaker is switched off", "Verify zero energy state with voltage detector").
* Suggested steps remain visually locked and TTS audio muted until all safety prerequisites are verified.

### Data Security & Privacy
* **Encryption in Transit**: All communications between mobile clients and local edge gateways use TLS 1.3 encryption.
* **On-Premise Deployment**: Vector stores, local databases, and inference nodes can be deployed completely within the client's private corporate network (intranet), ensuring zero leakage of proprietary manuals or operational statistics.
