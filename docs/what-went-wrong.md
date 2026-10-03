# What Went Wrong: Engineering Post-Mortem & Lessons Learned

Building a real-time, sub-50ms cloud-native streaming engine under a 72-hour deadline involves navigating complex interactions between Linux kernel modules, container virtualization, Android OS boot milestones, video codecs, and browser rendering lifecycles.

This document details the critical failures, race conditions, memory leaks, and architectural dead ends encountered during development, along with their root cause analyses and engineering solutions.

---

## 1. The First-Frame Disconnection & Container Destruction Loop

### Severity: Critical (Score: 95)
### Symptoms:
The streaming pipeline connected, negotiated scrcpy sockets, and began relaying video. However, the exact moment the very first video frame rendered on the browser canvas, the stream crashed, the WebSocket closed with code 1000/1006, and the backend instantly destroyed the Android container. A subsequent automatic reconnection attempt failed immediately with `HTTP 410 Gone`.

### Root Cause Analysis:
In React, state updates trigger component re-renders. The chain of events was:
1. The first H.264 frame arrived over WebSocket.
2. `useVideoDecoder` decoded the frame and invoked `onFirstFrame()`.
3. `DeviceCanvas.tsx` ran `setHasFirstFrame(true)`.
4. `DeviceCanvas` re-rendered to reveal the canvas element.
5. In `DeviceCanvas.tsx`, `onVideoPacket` was defined as an inline arrow function: `(nalData, ptsUs) => { feedPacket(...) }`.
6. On re-render, `onVideoPacket` was assigned a new function reference.
7. `useWebSocket.ts` listed `onVideoPacket` in the dependency array of its `connect` callback, which was in turn listed in `useEffect(..., [connect])`.
8. The dependency change caused React's `useEffect` to execute its cleanup function: `disconnect()`.
9. The WebSocket closed.
10. On the backend, `StreamController.HandleStream` reached its `defer` block: `sc.sessionUsecase.DestroySession(cleanupCtx, sessionID)`.
11. The ephemeral container was stopped, removed, and marked `terminated`.
12. The client attempted to reconnect, only to find the session dead (`HTTP 410 Gone`).

### Solution:
Decoupled WebSocket transport lifecycle from React component rendering using the `useRef` trampoline pattern:
```typescript
// frontend/src/hooks/useWebSocket.ts
const callbacksRef = useRef({ onVideoPacket, onOpen, onClose, onError });
useEffect(() => {
  callbacksRef.current = { onVideoPacket, onOpen, onClose, onError };
});

const connect = useCallback(() => {
  // Uses callbacksRef.current inside event listeners
}, [sessionId]); // STRICTLY depends only on sessionId
```
Callback mutations now update the mutable ref without invalidating `connect` or triggering effect cleanup.

---

## 2. Docker Desktop on Linux Socket Discovery Failure

### Severity: High
### Symptoms:
Running `./run_local.sh` or creating a session threw:
```
provision container: create container: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
```
Even though Docker Desktop for Linux was actively running and `docker ps` worked in the host terminal.

### Root Cause Analysis:
On standard Linux installations, Docker Engine runs as a system-wide root daemon listening at `/var/run/docker.sock`. However, modern **Docker Desktop for Linux** runs in rootless/user-space mode. The daemon socket is located at:
`unix:///home/<user>/.docker/desktop/docker.sock`
When the Go Docker SDK (`client.NewClientWithOpts(client.FromEnv)`) initializes with an empty `DOCKER_HOST` environment variable, it defaults to `/var/run/docker.sock`. Because `/var/run/docker.sock` did not exist, all container provisioning attempts failed.

### Solution:
Implemented multi-path auto-discovery in `backend/infrastructure/docker/client.go`:
```go
// Fallback socket discovery if DOCKER_HOST is not explicitly set
if os.Getenv("DOCKER_HOST") == "" {
    if _, err := os.Stat("/var/run/docker.sock"); os.IsNotExist(err) {
        homeDir, _ := os.UserHomeDir()
        desktopSock := filepath.Join(homeDir, ".docker/desktop/docker.sock")
        if _, err := os.Stat(desktopSock); err == nil {
            opts = append(opts, client.WithHost("unix://"+desktopSock))
        }
    }
}
```
Updated `run_local.sh` to auto-detect active Docker contexts and export `DOCKER_HOST` automatically.

---

## 3. WebCodecs Standalone SPS/PPS Parameter Set Dropping

### Severity: High
### Symptoms:
The video decoder would periodically stall or throw `DOMException: A keyframe was required after reset`. Frames were being transmitted by scrcpy, but the canvas remained completely blank.

### Root Cause Analysis:
scrcpy sends video configuration in two modes:
1. At stream initialization, it emits a standalone SPS (Sequence Parameter Set, NAL type 7) and PPS (Picture Parameter Set, NAL type 8) packet marked with the 64-bit flag `PTS_CONFIG_FLAG` (bit 63). This packet has no video slice data (NAL type 5 IDR).
2. If `useVideoDecoder.ts` configured `waitingForKeyframe = true` and ignored any packet that was not an IDR slice, the standalone SPS/PPS configuration packet was discarded.
3. When the subsequent keyframe slice arrived without embedded inline parameter sets, WebCodecs failed to decode it because it lacked decoder configuration metadata.

### Solution:
1. Created `frontend/src/lib/h264.ts` with NAL boundary parsing (`findNalUnits`).
2. Implemented `cachedConfigRef` in `useVideoDecoder.ts` to cache incoming parameter sets (`isConfig === true`).
3. If an IDR keyframe arrives without an embedded SPS header, the cached SPS/PPS buffer is prepended to the chunk before feeding it to `VideoDecoder.decode()`.

---

## 4. SQLite Lock Contention in High-Frequency Activity Tracking

### Severity: Medium (Identified during Code Review, Score: 80)
### Symptoms:
Integration tests and concurrent streaming under `-race` showed database lock contention errors (`database is locked` / `busy`).

### Root Cause Analysis:
In `backend/usecase/stream_usecase.go`, an `activityTrackingWriter` wrapped the scrcpy control socket to update `LastActiveAt` on the session record whenever user input was forwarded.
During high-frequency touch drags or mouse movements (60–120 events per second), every pointer event triggered a synchronous SQL `UPDATE sessions SET last_active_at = ? WHERE id = ?`.
Because SQLite uses database-level locking for writes, concurrent updates from multiple active streams clashed, resulting in lock contention.

### Solution:
Throttled database activity updates to at most **once every 5 seconds** using an asynchronous background goroutine:
```go
if now.Sub(w.lastUpdated) >= 5*time.Second {
    w.lastUpdated = now
    go func() {
        ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
        defer cancel()
        _ = w.repo.UpdateLastActive(ctx, w.sessionID, now)
    }()
}
```

---

## 5. scrcpy Port Forward & ADB Connection Leaks

### Severity: Medium (Score: 75)
### Symptoms:
Repeatedly creating and destroying sessions caused local ADB forward tables (`adb forward --list`) to grow indefinitely. Eventually, ADB rejected new forward rules with `cannot bind listener`.

### Root Cause Analysis:
When `scrcpy.Server` started, it issued:
`adb forward tcp:<LocalPort> localabstract:scrcpy`
When the session terminated, the container was stopped and removed, but the host's ADB forward rule remained in the host ADB daemon's table.

### Solution:
1. Implemented `ForwardRemove(serial, localPort)` in `backend/infrastructure/adb/client.go`.
2. Invoked `ForwardRemove` inside `server.Close()` in `backend/infrastructure/scrcpy/server.go`.
3. Injected `domain.ADBDisconnector` into `SessionUsecase` and invoked `adb.Disconnect(serial)` during session teardown.

---

## 6. Unbounded Memory Allocation Guard in Video Packet Reader

### Severity: Medium (Score: 70)
### Symptoms:
Potential denial-of-service / memory exhaustion if scrcpy or a corrupt TCP stream returned a malformed packet size header.

### Root Cause Analysis:
`backend/infrastructure/scrcpy/video.go` read a 32-bit packet size from the TCP stream:
`packetSize := binary.BigEndian.Uint32(header[8:12])`
`pkt.Data = make([]byte, packetSize)`
If corrupted data or network noise produced a value like `0xFFFFFFFF` (4GB), the Go runtime would attempt to allocate 4GB of RAM, triggering an Out-Of-Memory panic.

### Solution:
Enforced strict upper-bound validation:
```go
const MaxVideoPacketSize = 16 * 1024 * 1024 // 16MB

if packetSize > MaxVideoPacketSize {
    return nil, fmt.Errorf("video packet size %d exceeds maximum allowed (%d)", packetSize, MaxVideoPacketSize)
}
```
Added unit test `TestReadVideoPacket_ExceedsMaxSize` verifying error handling.

---

## 7. WebCodecs Decoder Reconfiguration Race Condition

### Severity: Medium (Score: 75)
### Symptoms:
Occasionally, when dynamic codec profile extraction (`extractCodecProfile`) detected a profile switch from default baseline to high profile (`avc1.640028`), frames were dropped during the asynchronous reconfiguration promise.

### Root Cause Analysis:
`VideoDecoder.configure()` is synchronous in JavaScript, but checking support via `VideoDecoder.isConfigSupported(config)` is asynchronous (`Promise<VideoDecoderSupport>`). Incoming keyframe slices arriving while `isConfigSupported` was awaiting resolution were fed to the decoder before reconfiguration finished, causing decoder decode errors.

### Solution:
Introduced `reconfiguringRef: Promise<void> | null` tracking in `useVideoDecoder.ts`. Incoming keyframe chunks await `reconfiguringRef` prior to invoking `decoder.decode()`, guaranteeing sequential pipeline ordering.

---

## 8. Async Microtask Decoder Configuration Race & Dropped IDR Keyframe

### Severity: Critical (Score: 92)
### Symptoms:
The streaming pipeline connected, negotiated scrcpy sockets, and began relaying video. The browser console logged `Detected stream codec profile: avc1.42801f, reconfiguring decoder`. However, no video ever appeared on the canvas (`stats.fps` remained 0), `hasFirstFrame` never became `true`, and user interaction stayed disabled.

### Root Cause Analysis:
1. `scrcpy-server` transmits a standalone SPS/PPS configuration packet (`isConfig: true`) followed immediately (~5ms) by the first IDR Keyframe slice (`isKey: true`).
2. Upon receiving the SPS/PPS packet, `feedPacket` invoked `configureDecoder()`.
3. Because `configureDecoder` was originally declared as an `async` function (evaluating `await VideoDecoder.isConfigSupported(...)`), JavaScript deferred execution of the configuration logic to an asynchronous microtask.
4. Consequently, `configuredRef.current` remained `false` on the synchronous call stack.
5. In the microsecond window before the microtask resumed, the subsequent IDR Keyframe arrived. `feedPacket` checked:
   ```typescript
   if (!configuredRef.current || decoderRef.current?.state !== 'configured') return;
   ```
   and silently **dropped the IDR Keyframe**.
6. When `configureDecoder` finally executed in the microtask, it set `waitingForKey.current = true`. Because the only initial IDR Keyframe had already been dropped, all subsequent delta frames were discarded waiting for a keyframe that never arrived!

### Solution:
Rewrote decoder configuration into a strictly synchronous operation (`configureDecoderSync`):
```typescript
const configureDecoderSync = useCallback((codec: string) => {
  if (!decoderRef.current || decoderRef.current.state === 'closed') return false;
  try {
    decoderRef.current.configure({
      codec,
      optimizeForLatency: true,
      hardwareAcceleration: 'prefer-hardware',
    });
    currentCodecRef.current = codec;
    configuredRef.current = true;
    return true;
  } catch (_) {
    // Synchronous fallback without hardware acceleration
    decoderRef.current.configure({ codec, optimizeForLatency: true });
    currentCodecRef.current = codec;
    configuredRef.current = true;
    return true;
  }
}, []);
```
By removing async microtasks, the decoder is synchronously in `'configured'` state on the exact same tick, ensuring the subsequent IDR keyframe is decoded and rendered immediately.

---

## 9. Passive Event Listener Warning & Scrcpy Fixed-Point `i16fp` 2048 Scroll Encoding

### Severity: Medium (Score: 80)
### Symptoms:
1. Spinning the mouse wheel on the canvas caused browser console spam:
   `[Violation] Added non-passive event listener to a scroll-blocking 'wheel' event` and `Unable to preventDefault inside passive event listener invocation`.
2. The Android view refused to scroll, regardless of mouse wheel movement.

### Root Cause Analysis:
Two distinct issues interacted:
1. **Passive Event Listener Violation**: Modern browsers treat JSX `onWheel` handlers as `passive: true` by default to preserve smooth scrolling of the host webpage. Invoking `e.preventDefault()` inside a passive listener throws browser warnings and fails to cancel host scrolling.
2. **Scrcpy Fixed-Point `i16fp` Multiplier**: In scrcpy protocol v2.0+, `hscroll` and `vscroll` in `INJECT_SCROLL_EVENT` (bytes 13–16) are **16-bit signed fixed-point numbers** where 1.0 scroll unit = **2048 (`0x0800`)**. Sending unscaled raw integers (e.g. `-1` or `+1`) caused scrcpy server to divide by 2048, yielding `-0.000488` scroll units. Android's `InputManager` rounded this sub-pixel float to 0 pixels scroll distance!

### Solution:
1. **Imperative Non-Passive Registration**:
   In `useInputCapture.ts`, attached an imperative non-passive listener directly to the canvas ref:
   ```typescript
   canvas.addEventListener('wheel', onWheel, { passive: false });
   ```
   Guarded `e.preventDefault()` with `if (e.cancelable) e.preventDefault()`.
2. **Fixed-Point Scaling**:
   Scaled raw scroll float deltas by `2048`:
   ```typescript
   const vscroll = Math.max(-32768, Math.min(32767, Math.round(vFloat * 2048)));
   ```
   Spinning the mouse wheel now dispatches valid `±2048` fixed-point scroll packets, achieving smooth, native Android list scrolling.

---

## 10. LinuxKit Virtualized Kernel Binder IPC Absence in Docker Desktop (Signal 129)

### Severity: Critical (Score: 94)
### Symptoms:
When starting a session inside Docker Desktop on Linux, the Redroid container was created successfully, but exited within 500ms with `Exited (129)`. The UI remained stuck on "Booting Android...", and the backend hung in an ADB connect retry loop.

### Root Cause Analysis:
Redroid is not a full emulator; it runs the real Android AOSP userspace directly on the host Linux kernel. Android relies fundamentally on the **Binder IPC driver** (`/dev/binder`, `/dev/hwbinder`, `/dev/vndbinder`) for communication between `init`, `servicemanager`, `SurfaceFlinger`, and `Zygote`.
While the host Ubuntu system had the `binder_linux` kernel module installed, **Docker Desktop for Linux** executes containers inside an isolated, virtualized `LinuxKit` QEMU VM kernel (`6.12.76-linuxkit`). LinuxKit did not compile or enable `CONFIG_ANDROID_BINDER_IPC`. When Redroid's `/init` booted without `/dev/binder`, Android kernel initialization aborted with termination signal 129.

### Solution:
1. **Host-Native Docker Migration**:
   Authored `scripts/install-native-docker.sh` to install native `docker-ce` directly on the host system, bypassing Docker Desktop's LinuxKit VM.
2. **Modern BinderFS Mounting**:
   On modern Linux kernels ($\ge$ 5.4), `/dev/binder` static character devices are replaced by `binderfs`. The script mounts the binder filesystem and provisions symlinks:
   ```bash
   mount -t binder binder /dev/binderfs
   ln -sf /dev/binderfs/binder /dev/binder
   ln -sf /dev/binderfs/hwbinder /dev/hwbinder
   ln -sf /dev/binderfs/vndbinder /dev/vndbinder
   ```
3. **Fail-Fast Backend Diagnostics**:
   In `backend/usecase/stream_usecase.go`, added a container liveness check on every 500ms cycle of the boot polling loop. If the container exits prematurely with exit code 129, the WebSocket immediately closes with `StatusPolicyViolation` and a descriptive diagnostic banner: *"Container exited: Docker Desktop lacks binder_linux. Run on native Ubuntu or see deploy/setup-vm.sh"*.

