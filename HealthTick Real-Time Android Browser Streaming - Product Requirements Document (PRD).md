### Product Requirements Document: HealthTick Real-Time Android Browser Streaming

#### 1\. Product Vision & Strategic Constraints

The mission is to architect and deploy a high-performance system capable of streaming a live Android OS to a web browser within a high-pressure 72-hour recruitment cycle. This project is designed to evaluate a candidate's mastery of real-time systems, network proxies, and low-level protocol management.The following fundamental constraints are non-negotiable:

* **Licensing:**  100% Free and Open-Source Software (FOSS). The solution must rely on open standards (e.g., GPL-3.0) and avoid proprietary dependencies.  
* **Infrastructure:**  Mandatory Cloud VM hosting. This constraint is specifically intended to test the candidate’s ability to manage network tunneling, buffer management, and Linux environment configuration.  
* **Commercial SaaS Prohibition:**  Explicitly prohibit commercial SDKs or platforms such as Appetize.io.  
* **Timeline:**  A fixed, 72-hour development window from inception to delivery.  
* **Deployment Status:**  While local development is expected, the  **Final Success Criterion**  is a stable deployment on a Cloud VM accessible via a Public HTTPS URL.

#### 2\. Scope & Technical Boundaries

To maintain engineering velocity, we are strictly defining the boundaries of this technical assessment:| In-Scope | Explicitly Out-of-Scope || \------ | \------ || Support for 2 to 3 simultaneous isolated Android instances. | Multi-region clusters or global CDN distribution. || Single-machine hosting on a Cloud VM. | Automated horizontal autoscaling (K8s/HPA). || Real-time mirroring and Normalized Input Forwarding. | Enterprise-grade hardware load balancers. || Secure Context (HTTPS) implementation for WebCodecs. | iOS support or Chrome DevTools Protocol proxying. |

#### 3\. Functional Requirements (30% Weighting)

The core engineering objectives focus on protocol efficiency and input precision.

* **FR-1: Continuous Real-Time Streaming:**  The architecture must provide a persistent stream without manual refreshes. While H.264 Baseline support is the minimum requirement for compatibility, the pipeline should be "codec-agnostic," designed to support modern encoders like H.265 or AV1 as the hardware allows.  
* **FR-2: Normalized Input Forwarding:**  Capture and forward tap, swipe, and scroll events. Coordinates must be normalized to match native device resolution. A senior implementation must utilize  **i16-fixed-point scroll**  values and provide a UI toggle between  **D-pad and Touch modes**  to handle different app interaction models (e.g., Leanback TV apps vs. standard mobile apps).  
* **FR-3: Latency Benchmarking:**  Implementation of a standardized benchmarking methodology. The gold standard for this requirement is a  **"Visual Loopback" test** : displaying a millisecond clock on the Android OS and comparing it to the rendered frame in the browser to quantify total action-to-render delay.  
* **FR-4: Reproducible Execution:**  The system must be launchable via a single-machine setup driven by automated scripts (e.g., docker-compose.yml or start.sh).  
* **FR-5: Public Accessibility:**  The deployment must be reachable via a public browser-accessible link. Candidates must ensure the stream functions in a remote environment, navigating the complexities of public IPs and firewall rules.

#### 4\. Optional Bonus Features (25% Weighting)

High-value extensions that demonstrate advanced systems architectural thinking.**BR-1: Isolated Instance per User**   **Success Definition:**  Implementation of a session-management layer ensuring zero state or file leakage between isolated user environments.**BR-2: On-Demand Lifecycle Management**   **Success Definition:**  Orchestration logic that triggers the spin-up of an Android instance upon user handshake and executes a cleanup/termination sequence when the session becomes idle.**BR-3: Two-Way Clipboard Synchronization**   **Success Definition:**  Implementation of computer-to-device text sync. This requires integration with STFService.apk or specific ADB shell commands to bridge the local and remote clipboards.**BR-4: Kiosk Mode Enforcement**   **Success Definition:**  Server-side enforcement locking the streaming session to a single application, preventing user escape to the OS settings or other unauthorized apps.**BR-5: Automated Session Recording**   **Success Definition:**  Server-side video capture where the stream is multiplexed and simultaneously piped to a storage-backed file tied to a unique Session ID.

#### 5\. AI Compliance & Audit Trail (25% Weighting)

As a senior technical assessment, the use of AI must be transparent and demonstrate critical problem-solving.

* **PROCESS\_LOG.md:**  An append-only file containing verbatim AI prompts with timestamps and public chat links.  
* **Pivot Decisions:**  Documentation of instances where AI provided incorrect or suboptimal architectural advice. Candidates must explain the  *architectural why*  behind their decision to pivot.  
* **Decision Summary:**  A distinct section in the documentation summarizing high-level "Human vs. AI" contributions. This should highlight unique engineering logic (e.g., custom protocol handling) vs. AI-generated boilerplate.

#### 6\. Mandatory Deliverables Checklist

1.   **Public Git Repository:**  Complete source code and commit history.  
2.   **Deployed Public Link:**  A live testing URL for the evaluation team.  
3.   **Narrated Demo Video:**  3–5 minutes, unedited, demonstrating the live stream and input.  
4.   **Project README.md:**  Setup instructions, host location, and documented limits.  
5.   **Architecture Write-Up:**  1–2 pages explaining the data flow and protocol choices.  
6.   **"What Went Wrong" Post-Mortem:**  Analysis of technical hurdles encountered.  
7.   **"With More Time" Roadmap:**  Strategy for scaling, security, and enterprise features.  
8.   **AI Compliance Log (**  **PROCESS\_LOG.md**  **):**  Chronological audit of AI usage.  
9.   **Human vs. AI Decision Summary:**  Clarity on the candidate’s unique value-add.

#### 7\. Evaluation Matrix & Engineering Quality

Criteria,Weighting  
Core Functionality,30%  
Bonus Feature Depth,25%  
Problem Solving & AI Record,25%  
Engineering Quality & Documentation,20%

##### Senior Engineering Best Practices

Senior candidates are expected to handle complex "Tricky Cases" mentioned in the source context:

* **Edge Case Handling:**  Explicitly handle "searching with no input," "special characters like ' or &," and "window resizing" without breaking the UI or stream.  
* **Architectural Separation:**  Strict adherence to the Single Responsibility Principle (SRP) in class structure and a clear separation between the presentation layer and the business/proxy layer.  
* **Robustness:**  Implementation of proper Pointer-Lock API for mouse control and error-resilient demultiplexing.

#### 8\. Technical Implementation Guidance

The recommended architectural flow is:  **Cloud Node.js Server → ADB Proxy →**  **scrcpy-server**  **(on device) → WebSocket Multiplexing → Browser WebCodecs.**

* **Protocol Management:**  To ensure protocol efficiency, you must implement a  **1-byte channel prefix**  for multiplexing the video, audio, and control sockets into the single WebSocket stream. This prevents protocol overhead and simplifies demultiplexing at the client.  
* **Decoding Strategy:**  Use the  **WebCodecs API (VideoDecoder)**  for low-latency H.264/H.265 rendering. Do not rely on high-latency WASM fallbacks.  
* **Secure Context Requirement:**  WebCodecs is restricted to  **Secure Contexts** . While http\://localhost is a valid exception during development, remote Cloud VM streaming will fail with a  **Browser Error 1006**  if the connection is not served over HTTPS. Candidates must implement a TLS/SSL solution (e.g., reverse proxy) for the final deployment.

