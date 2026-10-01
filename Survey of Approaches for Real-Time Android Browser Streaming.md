### Technical Report: PRD-Aligned Survey of Android-to-Browser Streaming Approaches

##### 1\. Executive Directive & Assignment Scope

The objective of this report is to define and evaluate high-performance architectural approaches for streaming real-time Android environments to web-based frontends. To meet the specific requirements of the HealthTick Health-Tech platform, all surveyed solutions are measured against the following four primary PRD constraints:

* **100% Free and Open Source Software (FOSS):**  Absolute compliance with FOSS licensing (GPL, AGPL, or MIT) is required to ensure long-term maintainability and cost-efficiency.  
* **Real Android OS:**  The solution must run a native Android ART runtime capable of executing standard APKs; WebAssembly-based UI simulations or "skin-only" previews are non-compliant.  
* **Cloud VM Hostability:**  Architectures must be capable of deployment on standard Cloud VM providers (AWS, GCP, Azure) without proprietary hardware dependencies.  
* **Sub-100ms Latency:**  End-to-end "glass-to-glass" latency must remain under 100ms to facilitate a responsive, interactive user experience.

##### 2\. Primary Recommendation: Dockerized Android (redroid) \+ WebSocket Relay / WebCodecs

The recommended production architecture utilizes  **redroid**  for containerized Android instances and  **ws-scrcpy-web**  as the streaming bridge.**Architectural Mechanism**  This approach leverages a vanilla scrcpy-server binary pushed to the Android environment via ADB. The server multiplexes the video (H.264/H.265), audio, and control TCP sockets into a single WebSocket stream. This is managed via a  **1-byte channel prefix**  that identifies whether the incoming packet is Video, Audio, or Control data. On the frontend, the browser demultiplexes the stream and decodes the payload using the  **WebCodecs API** .**The Secure Context Requirement**  A critical architectural hurdle is the browser’s "Secure Context" requirement. Modern browsers withhold the VideoDecoder API in non-secure environments. Evaluation of Chromium-based browsers confirms that flags such as \--unsafely-treat-insecure-origin-as-secure are often insufficient for restoring VideoDecoder functionality. Consequently, the deployment must terminate TLS at the reverse proxy to expose the interface over HTTPS or Localhost.**Performance & Scaling Profile**

* **Zero Video-Transcoding CPU Overhead:**  The host forwards raw H.264/H.265 packets directly from the container, avoiding costly server-side re-encoding.  
* **Sub-50ms Glass-to-Glass Latency:**  The direct WebSocket-to-WebCodecs pipeline eliminates the buffer-heavy latency typical of HLS or MPEG-DASH.  
* **Per-User Container Isolation:**  Using redroid ensures isolated ART runtimes. This prevents APK collisions and provides secure, per-user session sandboxing, which is essential for a "Real Android" PRD compliant environment.**Evaluation**  This approach is the gold standard for HealthTick because it is  **100% FOSS (GPL-3.0)**  and provides the highest degree of architectural flexibility for cloud scaling.

##### 3\. Alternative Approach: WebRTC Direct Peer Streaming (webscreen)

The  **webscreen**  approach utilizes WebRTC for peer-to-peer data flow, established via a Go-based backend.**Architectural Mechanism**  The system establishes a WebRTC connection for high-quality video streaming (H.264/H.265) and leverages  **DataChannels**  for User Interface Device (UHID) input, including keyboard, mouse, and gamepad reporting. To host this on a Linux-based Cloud VM, the environment requires specific prerequisites such as  **Xvfb, Sway, or wf-recorder**  to handle the Linux recorder component.**Pros and Cons**| Pros | Cons || \------ | \------ || **Ultra-low latency:**  UDP transport minimizes packet-retransmission delay. | **Complex Cloud Networking:**  Strict UDP/STUN/TURN requirements in VPCs. || **Native Support:**  Broad WebRTC browser compatibility for video/audio. | **AGPL-3.0 License:**  Potentially restrictive for specific commercial integration. || **Input Precision:**  DataChannels handle high-frequency HID events effectively. | **Signaling Overhead:**  High architectural complexity for session negotiation. |

##### 4\. Legacy Solution: Socket Framebuffer Injection (OpenSTF / scrcpy-web)

Legacy methods rely on the  **OpenSTF**  ecosystem (now maintained by  **DeviceFarmer** ) or FIFO-based pipelines found in projects like moothz/scrcpy-web.**Architectural Mechanism**  These pipelines typically utilize minicap for frame capture or use ffmpeg to process raw H.264 streams into a FIFO pipeline. The frontend then relies on  **jmuxer**  for browser-side decoding and display.**Constraint Conflict**

* **Resource Overhead:**  These implementations suffer from higher server CPU/RAM usage due to the intermediate FIFO and ffmpeg processing layers.  
* **Latency Profile:**  While stable, the end-to-end delay typically resides in the  **100ms–150ms**  range, which exceeds the sub-100ms PRD target.  
* **Maintenance Debt:**  OpenSTF is no longer under active development by the original authors; moving to modern containerized solutions like redroid is preferred for long-term support.

##### 5\. Discouraged & Non-Compliant Approaches (Disqualification Matrix)

The following methodologies were evaluated and subsequently disqualified for failing to meet the HealthTick PRD.| Approach | Constraint Violated | Technical Rationale || \------ | \------ | \------ || **ADB Screencap Polling** | Sub-100ms Latency | Repeated process invocation and polling overhead leads to \>300ms latency. || **Appetize.io / SaaS** | 100% FOSS / Cloud Hostability | Proprietary commercial services violate the self-hosted FOSS requirement. || **FlutterFlow Preview** | Real Android OS | Uses WebAssembly UI simulations; cannot execute native APKs or the ART runtime. |

##### 6\. PRD Compliance Evaluation Matrix

Approach,FOSS Status,OS Type,Hostability,Latency (ms),PRD Pass/Fail  
Docker \+ WebCodecs,GPL-3.0,Real Android,Cloud VM,\<50ms,PASS  
WebRTC (webscreen),AGPL-3.0,Real Android,Cloud VM,\<50ms,PASS  
Legacy (OpenSTF),Apache-2.0,Real Android,Cloud VM,100ms+,FAIL  (Latency)  
Screencap Polling,N/A,Real Android,Cloud VM,\>300ms,FAIL  (Latency)  
Commercial SaaS,Proprietary,Real Android,External,\<100ms,FAIL  (FOSS)  
WASM Simulation,Mixed,Simulation,Cloud VM,\<50ms,FAIL  (Real OS)

##### 7\. Concrete Execution Recommendations for HealthTick

To implement the recommended  **redroid \+ WebCodecs**  solution, follow this deployment roadmap:

1. **Environment Setup:**  Deploy a Linux-based Cloud VM with Docker. Initialize redroid containers with appropriate memory limits to ensure per-user isolation.  
2. **Stream Layer Integration:**  Deploy  **ws-scrcpy-web**  as the WebSocket proxy. Ensure the proxy is configured to multiplex Video, Audio, and Control sockets.  
3. **Security & API Access:**  Configure a TLS-terminating reverse proxy (Caddy or Nginx). The proxy  **must**  forward the X-Forwarded-Proto: https header. This ensures the app recognizes a secure context and enables the WebCodecs VideoDecoder API in the browser.  
4. **Frontend Implementation:**  Use the programmatic WsScrcpy.startStream() API to embed the interactive device view into the primary application UI.

##### 8\. Architectural Standards for Submission

When presenting this solution for the HealthTick assignment, adhere to these professional standards. Internal data suggests that reviewers spend only  **5 to 20 minutes**  evaluating takehome submissions; clarity and robustness are paramount.

* **Edge Case Resilience:**  Formally document how the system handles network discovery failures and sudden device disconnects. Reviewers look for robust error handling in the WebSocket lifecycle.  
* **Persistence & Documentation:**  Explicitly define the config.json structure and the wsscrcpy.db (SQLite) schema. Use the SQLite store for persisting user state, such as device labels and theme preferences (dark/light), to demonstrate an understanding of stateful architecture.  
* **Functional Prototyping Strategy:**  Follow the "Prototype quickly, build nicely after" methodology. Prioritize a stable, functional H.264 stream first. Once the core latency targets are met, document extension points for multi-codec support (H.265/AV1) and UI enhancements.

