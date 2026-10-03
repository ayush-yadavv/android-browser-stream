# Product Requirements Document: HealthTick Real-Time Android Browser Streaming

## 1. Product Vision & Strategic Constraints

The mission is to architect and deploy a high-performance system capable of streaming an interactive, live Android OS into a modern web browser within a 72-hour recruitment evaluation window. The project evaluates mastery across real-time systems, network proxies, video pipelines, container orchestration, and low-level protocol management.

The following constraints are non-negotiable:

* **Licensing & FOSS:** 100% Free and Open-Source Software (FOSS). Core solution must rely on open-source software and open standards (e.g., GPL-3.0, Apache-2.0).
* **Commercial SaaS Prohibition:** Absolutely no commercial streaming SDKs, paid emulator platforms, or hosted remote-device services (e.g., Appetize.io, AWS Device Farm, Genymotion SaaS).
* **Infrastructure & Hosting:** Solution must be deployed to a Cloud VM (e.g., AWS, GCP, Azure, Hetzner, DigitalOcean) and accessible via a public HTTPS URL. Generic cloud infrastructure (VMs, containers, storage, networking) may be free or paid.
* **Architectural Freedom:** Open-ended solution design. Candidates choose the languages, libraries, and framework architecture, provided dependencies remain FOSS.
* **Timeline & Time Tracking:** Fixed 72-hour completion window. Candidates must track and report their actual hours spent upon final submission.

---

## 2. Scope & Technical Boundaries

To maintain engineering velocity and avoid over-engineering, technical boundaries are strictly bounded:

| In-Scope | Explicitly Out-of-Scope |
| :--- | :--- |
| Support for 2 to 3 simultaneous isolated Android instances on a single host machine. | Multi-region clusters or global CDN distribution. |
| Single-machine Cloud VM deployment with automated setup scripts. | Automated horizontal autoscaling (Kubernetes HPA, Nomad clusters). |
| Real-time video mirroring and normalized input forwarding (touch, gestures, scroll, and keyboard typing). | Enterprise-grade hardware load balancers. |
| Secure Context (HTTPS/WSS) reverse proxy configuration for WebCodecs. | iOS device virtualization or Chrome DevTools Protocol (CDP) proxies. |

> **Scoping Principle:** A simple, resilient design that works reliably is strictly preferred over a complex system that is half-finished. Core requirements combined with 1 or 2 deeply implemented bonus features constitute a top-tier submission.

---

## 3. Core Functional Requirements (30% Evaluation Weight)

### FR-1: Continuous Real-Time Streaming
* The browser must display a live, persistent mirror of the running Android OS without manual page refreshes.
* Stream delivery must be sub-second action-to-render latency. While H.264 Baseline is the compatibility standard, the pipeline should be designed codec-agnostically to support modern encoders (H.265/AV1) where hardware acceleration permits.
* Video playback must utilize the browser's low-overhead **WebCodecs API (`VideoDecoder`)** rendered onto an HTML5 Canvas context.

### FR-2: Normalized Input Forwarding (Touch, Scroll, & Keyboard Typing)
* **Touch & Gestures:** Capture and forward tap, swipe, multi-pointer moves, and touch release events.
* **Coordinate Normalization:** Coordinates must be mathematically mapped from the client's rendered viewport to the native Android display resolution ($X \in [0, W]$, $Y \in [0, H]$), preserving aspect ratio with proper letterbox/pillarbox compensation across arbitrary browser window resizing.
* **Scroll & Navigation:** Transmit mouse-wheel scroll events using 16-bit signed fixed-point integer serialization (`i16-fixed-point`). Virtual navigation actions (Back, Home, App Switch) must be accessible.
* **Keyboard Typing & Text Injection:** The user must be able to type naturally into Android text fields from their physical keyboard or an in-browser text toolbar. Keystrokes must map browser `KeyboardEvent.code` to Android `KeyEvent.KEYCODE_*` codes and forward UTF-8 text strings directly into active Android input fields.

### FR-3: Latency Benchmarking & Metrics Reporting
* **Objective Measurement:** Measure glass-to-glass delay between a user action and visible screen update.
* **Standard Methodology:** Implement a reproducible benchmarking method, such as the **Visual Loopback Test** (rendering a high-precision millisecond counter on the Android OS and comparing it against the captured browser canvas frame).
* **Documented Reporting:** The measurement methodology must be explained in the documentation, and actual measured latency figures (action-to-render delay, network RTT, framerate, and jitter) must be reported in the submission deliverables and/or an in-app telemetry HUD.

### FR-4: Reproducible Single-Machine Execution
* The entire system (backend, frontend, Android container engine, and proxy services) must run on a single machine.
* Must provide clean, automated setup scripts (`run_local.sh`, `docker-compose.yml`, or equivalent) allowing an evaluator to reproduce the working environment without ad-hoc manual interventions.

### FR-5: Public Accessibility & Cloud Deployment
* The backend and frontend must run continuously on a remote Cloud VM, not on the candidate's personal computer.
* Must be reachable via a public, secure HTTPS/WSS link accessible by evaluators at any time without special client installations.

---

## 4. Bonus / Good-to-Have Requirements (25% Evaluation Weight)

*Judged on architectural depth, reliability, and security correctness rather than mere presence. Implementing 1 or 2 bonuses thoroughly is superior to attempting all 5 superficially.*

### BR-1: Dedicated Isolated Instance per User
* **Success Definition:** A session-management orchestration layer guaranteeing that two concurrent users receive completely separate, sandboxed Android environments.
* **Zero Leakage:** No crossover of user actions, file storage (`/sdcard`), installed APKs, OS settings, clipboard data, or container ports between users.

### BR-2: On-Demand Lifecycle Management & Leak Prevention
* **Success Definition:** Android instances are provisioned dynamically when a user initiates a session and decommissioned automatically upon session termination or inactivity.
* **No Pre-allocation Waste:** Nothing is reserved per user in advance.
* **Abandoned Session Cleanup:** Robust server-side cleanup policies must detect abandoned sessions (closed browser tabs, network dropouts, crashed sockets) and reclaim containers, ADB forwarding tunnels, and port allocations without leaking server resources.

### BR-3: Two-Way Bidirectional Clipboard Synchronization
* **Client-to-Device Sync:** Text copied on the user's host computer is seamlessly pasted into the Android device's clipboard.
* **Device-to-Client Sync:** Text copied inside the Android OS is captured and synced back to the user's browser clipboard.
* **Mechanism:** Integration with low-level ADB clipboard monitors, STFService, or scrcpy clipboard synchronization packets.

### BR-4: Restricted Access / Kiosk Mode Enforcement
* **Success Definition:** Locking the streaming session to a single selected application, preventing the user from escaping to other apps, system settings, or OS-level controls.
* **App Selection & Justification:** Candidate must explicitly document **which app was chosen and why**.
* **Defined Blocked Actions & Justification:** Candidate must define and document the **complete list of blocked actions** (e.g., `KEYCODE_HOME`, `KEYCODE_APP_SWITCH`, status bar swipe-down, notification shade expansion, intent URL navigation) and **justify why each is blocked**.
* **Server-Side Enforcement:** Enforcement must occur server-side or at the OS protocol layer so that tampering with client-side JavaScript cannot bypass restrictions.

### BR-5: Automated Session Recording, Playback & Download
* **Success Definition:** Automatic server-side capture of each streaming session, simultaneously multiplexing the H.264 stream to a storage-backed media file tagged with the unique Session ID.
* **In-Browser Playback:** The application must provide a playback mechanism (in-browser video player or video stream endpoint) allowing evaluators to review recorded sessions.
* **Session Download:** The system must provide an endpoint or UI button allowing recorded sessions to be downloaded locally in a standard container format (e.g. fragmented MP4 with faststart, or WebM).

---

## 5. AI Compliance, Process Audit, & Autonomous Decision Trail (25% Evaluation Weight)

Candidates are encouraged to leverage AI coding agents and LLMs, but must demonstrate rigorous verification, technical ownership, and transparent auditing.

* **Append-Only Process Log (`PROCESS_LOG.md`):** If using an AI coding agent, maintain an append-only log in the project root. For every meaningful step, record the timestamp, exact verbatim user prompt, actions taken, errors/failures encountered, and subsequent decisions. This log must be maintained continuously and committed to the Git history.
* **AI Chat Transcripts:** If using browser-based AI chats, provide public conversation links or exported transcripts in the repository.
* **Autonomous Human Decisions (Written in Candidate's Own Words):** A dedicated section in the write-up detailing major architectural and algorithmic decisions made independently of AI suggestions.
* **AI Failures & Pivot Points:** Document at least one concrete instance where the AI provided incorrect, suboptimal, or broken advice, describing how the candidate detected the error and the technical rationale for the pivot.
* **Integrity Warning:** Do not clean up, filter, or fabricate logs. A messy, authentic record of engineering problem-solving is valued; missing or edited records will incur severe penalties.

---

## 6. Mandatory Deliverables Checklist

| # | Deliverable | Required Content & Format |
| :---: | :--- | :--- |
| **1** | **Public Git Repository** | Full backend and frontend source code, automated scripts, clean commit history. |
| **2** | **Deployed Public Link** | Live HTTPS/WSS URL accessible to evaluators with any required credentials. |
| **3** | **Narrated Demo Video** | 3 to 5 minutes, **one continuous take without cuts**, recorded on the **live deployed Cloud VM** (no mock-ups). Must demonstrate real-time device responsiveness, walk through each built feature, and include candidate voiceover. |
| **4** | **Project README.md** | Step-by-step local setup instructions, hosting provider and server location, documented operational limits (e.g. max concurrent sessions), and test instructions for each feature. |
| **5** | **Architecture Write-Up** | 1 to 2 pages detailing video streaming pipeline, input forwarding, isolation mechanisms, and **a dedicated section on architectural alternatives considered and why they were rejected** (e.g., WebCodecs vs WebRTC, Redroid vs QEMU/Anbox). |
| **6** | **"What Went Wrong" Post-Mortem** | Honest analysis of dead ends, bugs, kernel/hardware compatibility obstacles, and how they were resolved. |
| **7** | **"With More Time" Roadmap** | Concrete engineering plan for multi-node horizontal scaling, GPU passthrough, enterprise security, and audio streaming. |
| **8** | **AI Record (`PROCESS_LOG.md`)** | Unedited chronological log or public conversation links documenting the full AI exchange. |
| **9** | **Human vs. AI Decision Summary** | In the candidate's own words: autonomous architectural decisions and documented AI failure recovery. |
| **10** | **Actual Time Spent** | Explicit accounting of the total hours spent building and deploying the assignment. |

---

## 7. Evaluation Matrix & Scoring Breakdown

| Evaluation Pillar | Weight | Focus Areas |
| :--- | :---: | :--- |
| **Core Functionality** | **30%** | Live stream stability, input forwarding accuracy (touch, scroll, typing), low-latency responsiveness, and rock-solid behaviour on the public deployment. |
| **Bonus Features** | **25%** | Depth, correctness, and architectural rigor of attempted bonus features (isolation, lifecycle management, two-way clipboard, kiosk mode, session recording). |
| **Problem Solving & Use of AI** | **25%** | Quality of research, recovery from technical dead ends, critical oversight of AI tools, and fidelity of the audit log (`PROCESS_LOG.md`). |
| **Engineering Quality** | **10%** | Clean Architecture, separation of concerns, robust error handling, idiomatic code, concurrency safety, and leak-free resource teardown. |
| **Communication** | **10%** | Clarity of architecture documentation, unedited video narration, and thoughtful articulation of engineering trade-offs. |

---

## 8. Technical Architecture Guidance

### Recommended Pipeline:
$$\text{Cloud Backend Service (Go Clean Architecture / Node.js)} \longrightarrow \text{ADB Proxy} \longrightarrow \text{scrcpy-server (on Redroid OS)} \longrightarrow \text{WebSocket Multiplexer} \longrightarrow \text{Browser WebCodecs (HTML5 Canvas)}$$

* **Protocol Framing & Multiplexing:** Use a 1-byte channel prefix to multiplex multiple data channels over a single WebSocket connection:
  - `0x00`: Raw H.264 Video NAL Units (Annex B format)
  - `0x01`: Audio PCM / AAC Stream (if implemented)
  - `0x02`: Binary Input & Control Messages (touch, scroll, keycode, text)
  - `0x03`: Ping / Pong Telemetry & Latency Probes
* **Video Decoding:** Hardware-accelerated WebCodecs API (`VideoDecoder` configured for `avc1.42e01f`) connected to an `OffscreenCanvas` or desynchronized 2D canvas context to minimize buffer queues.
* **Input Normalization:** Math-based projection mapping client mouse/touch coordinates across responsive canvas boundaries with aspect-ratio preservation.
* **Secure Context (HTTPS/WSS) Enforcement:** WebCodecs is restricted to Secure Contexts. While `http://localhost` is permitted during local development, remote Cloud VM connections require valid TLS termination (e.g. Caddy or Nginx reverse proxy with automated Let's Encrypt certificates) to avoid browser connection blocks and `1006` WebSocket drops.
