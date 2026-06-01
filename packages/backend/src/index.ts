import { basename, isAbsolute, join, relative, resolve } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';
import { ffmpeg } from './ffmpeg';
import type {
  ServerMessage,
  ClientMessage,
  StreamConfig,
  RecordingInfo,
  ServerStatus,
  RPCRequest,
  RPCResponse,
  RPCError,
  RPCMethod,
  ViewerServerMessage,
  ViewerInitPayload,
  ViewerStatusPayload,
} from 'shared';
import { RPC_ERRORS } from 'shared';

const HTTP_PORT = 3001;

// ============================================================
// Utility Helpers
// ============================================================

function isPathInside(parent: string, child: string): boolean {
  const resolvedRelative = relative(resolve(parent), resolve(child));
  return resolvedRelative === '' || (!resolvedRelative.startsWith('..') && !isAbsolute(resolvedRelative));
}

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...init?.headers,
    },
  });
}

// Helper to get recording details
function getRecordingsList(): RecordingInfo[] {
  const dir = ffmpeg.getRecordingsDir();
  try {
    const files = readdirSync(dir);
    return files
      .filter((file) => file.endsWith('.mp4'))
      .map((file) => {
        const path = join(dir, file);
        const stats = statSync(path);
        return {
          name: file,
          sizeBytes: stats.size,
          createdAt: stats.birthtime.toISOString(),
          downloadUrl: `/api/recordings/download/${file}`,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.error('Failed to read recordings directory:', err);
    return [];
  }
}

// ============================================================
// State Management
// ============================================================

// Active stream configuration (RTMP targets)
let streamConfig: StreamConfig = {
  rtmpUrl: 'rtmp://localhost/live',
  streamKey: 'bobs-key',
  resolution: { width: 1280, height: 720 },
  fps: 30,
  videoBitrate: 3000,
  audioBitrate: 128,
};

// Connection tracking - separate sets for each connection type
const broadcasterSockets = new Set<any>();
const viewerSockets = new Set<any>();
const rpcSockets = new Set<any>();

// Phase 2: Matroska Init Header caching
// The first binary WebM chunk from a broadcaster contains the EBML header,
// Segment info, and Track metadata needed by MediaSource to initialize playback.
let initHeader: Uint8Array | null = null;
let isBroadcasting = false;
let streamStartedAt: string | null = null;

// Broadcaster scene state (relayed from the frontend broadcaster)
let currentSceneList: Array<{ id: string; name: string }> = [];
let currentSceneId: string | null = null;

// ============================================================
// WebSocket connection data types (used for Bun's upgrade data tag)
// ============================================================

type WSConnectionType = 'broadcaster' | 'viewer' | 'rpc';

interface WSData {
  type: WSConnectionType;
}

// ============================================================
// Status Broadcasting
// ============================================================

function buildServerStatus(): ServerStatus {
  return {
    isStreaming: ffmpeg.isStreaming(),
    isRecording: ffmpeg.isRecording(),
    streamingUrl: ffmpeg.isStreaming() ? `${streamConfig.rtmpUrl}/${streamConfig.streamKey}` : undefined,
    cpuUsage: Math.min(
      Math.round(
        (ffmpeg.isStreaming() ? 8 : 1) +
        (ffmpeg.isRecording() ? 5 : 1) +
        (ffmpeg.isVirtualCamActive() ? 4 : 0) +
        Math.random() * 2
      ),
      100
    ),
    fps: streamConfig.fps,
    activeClients: broadcasterSockets.size,
    recordings: getRecordingsList(),
    viewerCount: viewerSockets.size,
    isBroadcasting,
    isVirtualCamActive: ffmpeg.isVirtualCamActive(),
  };
}

/** Broadcast system status to all connected broadcaster clients */
function broadcastStatus() {
  const status = buildServerStatus();
  const message: ServerMessage = {
    type: 'status-update',
    payload: status,
  };

  const serialized = JSON.stringify(message);
  for (const socket of broadcasterSockets) {
    try {
      socket.send(serialized);
    } catch (e) {
      broadcasterSockets.delete(socket);
    }
  }
}

/** Send viewer-status heartbeat to all connected viewer clients */
function broadcastViewerStatus() {
  if (viewerSockets.size === 0) return;

  const uptimeMs = streamStartedAt ? Date.now() - new Date(streamStartedAt).getTime() : 0;
  const payload: ViewerStatusPayload = {
    isLive: isBroadcasting,
    viewerCount: viewerSockets.size,
    uptime: Math.floor(uptimeMs / 1000),
    resolution: streamConfig.resolution,
  };

  const message: ViewerServerMessage = {
    type: 'viewer-status',
    payload,
  };

  const serialized = JSON.stringify(message);
  for (const socket of viewerSockets) {
    try {
      socket.send(serialized);
    } catch (e) {
      viewerSockets.delete(socket);
    }
  }
}

/** Notify all viewers that the broadcast has stopped */
function notifyViewersStopped() {
  const message: ViewerServerMessage = { type: 'viewer-stopped' };
  const serialized = JSON.stringify(message);
  for (const socket of viewerSockets) {
    try {
      socket.send(serialized);
    } catch (e) {
      viewerSockets.delete(socket);
    }
  }
}

// Periodic status broadcasts (every 1 second)
setInterval(() => {
  if (broadcasterSockets.size > 0) {
    broadcastStatus();
  }
  if (viewerSockets.size > 0) {
    broadcastViewerStatus();
  }
}, 1000);

// ============================================================
// Relay binary chunk to all viewer sockets
// ============================================================

function relayChunkToViewers(chunk: Uint8Array) {
  for (const socket of viewerSockets) {
    try {
      socket.send(chunk);
    } catch (e) {
      viewerSockets.delete(socket);
    }
  }
}

// ============================================================
// JSON-RPC 2.0 Handler
// ============================================================

function makeRPCResponse(id: string | number, result: any): RPCResponse {
  return { jsonrpc: '2.0', id, result };
}

function makeRPCError(id: string | number | null, error: RPCError): RPCResponse {
  return { jsonrpc: '2.0', id: id ?? 0, error };
}

async function handleRPCRequest(ws: any, request: RPCRequest): Promise<RPCResponse> {
  const { id, method, params } = request;

  switch (method) {
    case 'GetSceneList': {
      return makeRPCResponse(id, {
        scenes: currentSceneList,
        currentScene: currentSceneId,
      });
    }

    case 'SetCurrentScene': {
      const sceneName = params?.sceneName ?? params?.sceneId;
      if (!sceneName) {
        return makeRPCError(id, { ...RPC_ERRORS.INVALID_PARAMS, data: 'Missing sceneName parameter' });
      }
      // Relay scene change command to all broadcaster sockets
      const cmd: ServerMessage = { type: 'error' as any, payload: { action: 'switch-scene', sceneName } };
      // We use a generic relay approach: send a JSON command to broadcasters
      const relayMsg = JSON.stringify({ type: 'rpc-relay', payload: { method: 'SetCurrentScene', params: { sceneName } } });
      for (const sock of broadcasterSockets) {
        try { sock.send(relayMsg); } catch (_) { /* ignore */ }
      }
      currentSceneId = sceneName;
      return makeRPCResponse(id, { status: 'ok', currentScene: sceneName });
    }

    case 'GetCurrentScene': {
      return makeRPCResponse(id, { currentScene: currentSceneId });
    }

    case 'GetStreamStatus': {
      return makeRPCResponse(id, {
        isStreaming: ffmpeg.isStreaming(),
        isRecording: ffmpeg.isRecording(),
        isBroadcasting,
        viewerCount: viewerSockets.size,
        streamUrl: ffmpeg.isStreaming() ? `${streamConfig.rtmpUrl}/${streamConfig.streamKey}` : null,
        streamStartedAt,
      });
    }

    case 'StartStreaming': {
      if (ffmpeg.isStreaming()) {
        return makeRPCError(id, { ...RPC_ERRORS.ALREADY_ACTIVE, data: 'Streaming is already active' });
      }
      try {
        ffmpeg.startStreaming(streamConfig);
        broadcastStatus();
        return makeRPCResponse(id, {
          status: 'ok',
          url: `${streamConfig.rtmpUrl}/${streamConfig.streamKey}`,
        });
      } catch (err: any) {
        return makeRPCError(id, { ...RPC_ERRORS.INTERNAL_ERROR, data: err.message });
      }
    }

    case 'StopStreaming': {
      if (!ffmpeg.isStreaming()) {
        return makeRPCError(id, { ...RPC_ERRORS.STREAM_NOT_ACTIVE });
      }
      await ffmpeg.stopStreaming();
      broadcastStatus();
      return makeRPCResponse(id, { status: 'ok' });
    }

    case 'StartRecording': {
      if (ffmpeg.isRecording()) {
        return makeRPCError(id, { ...RPC_ERRORS.ALREADY_ACTIVE, data: 'Recording is already active' });
      }
      try {
        const filename = ffmpeg.startRecording();
        broadcastStatus();
        return makeRPCResponse(id, { status: 'ok', filename });
      } catch (err: any) {
        return makeRPCError(id, { ...RPC_ERRORS.INTERNAL_ERROR, data: err.message });
      }
    }

    case 'StopRecording': {
      if (!ffmpeg.isRecording()) {
        return makeRPCError(id, { ...RPC_ERRORS.RECORDING_NOT_ACTIVE });
      }
      await ffmpeg.stopRecording();
      broadcastStatus();
      return makeRPCResponse(id, { status: 'ok' });
    }

    case 'SetVolume': {
      const { sourceName, volume } = params ?? {};
      if (sourceName == null || volume == null) {
        return makeRPCError(id, { ...RPC_ERRORS.INVALID_PARAMS, data: 'Missing sourceName or volume' });
      }
      // Relay to broadcasters
      const relayMsg = JSON.stringify({
        type: 'rpc-relay',
        payload: { method: 'SetVolume', params: { sourceName, volume } },
      });
      for (const sock of broadcasterSockets) {
        try { sock.send(relayMsg); } catch (_) { /* ignore */ }
      }
      return makeRPCResponse(id, { status: 'ok', sourceName, volume });
    }

    case 'SetMute': {
      const { sourceName, mute } = params ?? {};
      if (sourceName == null || mute == null) {
        return makeRPCError(id, { ...RPC_ERRORS.INVALID_PARAMS, data: 'Missing sourceName or mute' });
      }
      const relayMsg = JSON.stringify({
        type: 'rpc-relay',
        payload: { method: 'SetMute', params: { sourceName, mute } },
      });
      for (const sock of broadcasterSockets) {
        try { sock.send(relayMsg); } catch (_) { /* ignore */ }
      }
      return makeRPCResponse(id, { status: 'ok', sourceName, mute });
    }

    case 'GetSourceSettings': {
      const { sourceName: src } = params ?? {};
      if (!src) {
        return makeRPCError(id, { ...RPC_ERRORS.INVALID_PARAMS, data: 'Missing sourceName' });
      }
      // We don't have deep source state on the backend; relay request to broadcaster
      const relayMsg = JSON.stringify({
        type: 'rpc-relay',
        payload: { method: 'GetSourceSettings', params: { sourceName: src } },
      });
      for (const sock of broadcasterSockets) {
        try { sock.send(relayMsg); } catch (_) { /* ignore */ }
      }
      return makeRPCResponse(id, { status: 'pending', message: 'Relayed to broadcaster' });
    }

    case 'SetSourceVisibility': {
      const { sourceName: srcName, visible } = params ?? {};
      if (srcName == null || visible == null) {
        return makeRPCError(id, { ...RPC_ERRORS.INVALID_PARAMS, data: 'Missing sourceName or visible' });
      }
      const relayMsg = JSON.stringify({
        type: 'rpc-relay',
        payload: { method: 'SetSourceVisibility', params: { sourceName: srcName, visible } },
      });
      for (const sock of broadcasterSockets) {
        try { sock.send(relayMsg); } catch (_) { /* ignore */ }
      }
      return makeRPCResponse(id, { status: 'ok', sourceName: srcName, visible });
    }

    case 'TriggerTransition': {
      const transitionName = params?.transitionName ?? 'Cut';
      const relayMsg = JSON.stringify({
        type: 'rpc-relay',
        payload: { method: 'TriggerTransition', params: { transitionName } },
      });
      for (const sock of broadcasterSockets) {
        try { sock.send(relayMsg); } catch (_) { /* ignore */ }
      }
      return makeRPCResponse(id, { status: 'ok', transition: transitionName });
    }

    case 'GetViewerCount': {
      return makeRPCResponse(id, { viewerCount: viewerSockets.size });
    }

    // Phase 3: Virtual Camera RPC Methods
    case 'StartVirtualCam': {
      if (ffmpeg.isVirtualCamActive()) {
        return makeRPCError(id, { ...RPC_ERRORS.ALREADY_ACTIVE, data: 'Virtual camera is already active' });
      }
      try {
        const deviceName = await ffmpeg.startVirtualCam(streamConfig.resolution);
        broadcastStatus();
        return makeRPCResponse(id, { status: 'ok', device: deviceName });
      } catch (err: any) {
        return makeRPCError(id, { ...RPC_ERRORS.VIRTUAL_CAM_NOT_AVAILABLE, data: err.message });
      }
    }

    case 'StopVirtualCam': {
      if (!ffmpeg.isVirtualCamActive()) {
        return makeRPCError(id, { code: -32004, message: 'Virtual camera is not active' });
      }
      await ffmpeg.stopVirtualCam();
      broadcastStatus();
      return makeRPCResponse(id, { status: 'ok' });
    }

    case 'GetVirtualCamStatus': {
      const info = ffmpeg.getVirtualCamInfo();
      return makeRPCResponse(id, info);
    }

    default:
      return makeRPCError(id, RPC_ERRORS.METHOD_NOT_FOUND);
  }
}

// ============================================================
// Broadcaster Disconnect Cleanup
// ============================================================

function onBroadcasterDisconnect() {
  if (broadcasterSockets.size === 0) {
    console.log('[WebSocket] No active broadcasters left. Cleaning up...');

    // Stop FFmpeg processes
    ffmpeg.stopRecording();
    ffmpeg.stopStreaming();
    ffmpeg.stopVirtualCam(); // Phase 3: Also stop virtual camera

    // Reset broadcast state
    isBroadcasting = false;
    initHeader = null;
    streamStartedAt = null;

    // Notify all viewers that broadcast has stopped
    notifyViewersStopped();
  }
}

// ============================================================
// Bun HTTP + WebSocket Server
// ============================================================

console.log(`[Backend] Initializing BOBS backend on port ${HTTP_PORT}...`);

const server = Bun.serve<WSData>({
  port: HTTP_PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // ---- WebSocket Upgrade Endpoints ----

    // Broadcaster WebSocket (original /ws endpoint)
    if (url.pathname === '/ws') {
      const success = server.upgrade(req, { data: { type: 'broadcaster' as const } });
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Viewer WebSocket endpoint
    if (url.pathname === '/ws/view') {
      const success = server.upgrade(req, { data: { type: 'viewer' as const } });
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // JSON-RPC Remote Control WebSocket endpoint
    if (url.pathname === '/ws/rpc') {
      const success = server.upgrade(req, { data: { type: 'rpc' as const } });
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // ---- REST API Endpoints ----

    if (url.pathname === '/api/recordings') {
      return jsonResponse(getRecordingsList());
    }

    if (url.pathname.startsWith('/api/recordings/download/')) {
      const filename = basename(decodeURIComponent(url.pathname.replace('/api/recordings/download/', '')));
      const recordingsDir = ffmpeg.getRecordingsDir();
      const filepath = resolve(recordingsDir, filename);
      if (filename.endsWith('.mp4') && isPathInside(recordingsDir, filepath) && existsSync(filepath)) {
        const file = Bun.file(filepath);
        return new Response(file, {
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response('File not found', { status: 404 });
    }

    // ---- Phase 2: Serve standalone viewer page ----
    if (url.pathname === '/view') {
      const viewerPage = resolve(import.meta.dir, '..', '..', 'frontend', 'public', 'view.html');
      if (existsSync(viewerPage)) {
        return new Response(Bun.file(viewerPage), {
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }

    // ---- Serve frontend assets in production / fallback ----
    const frontendDist = resolve(import.meta.dir, '..', '..', 'frontend', 'dist');
    const requestedPath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname);
    let filepath = resolve(frontendDist, `.${requestedPath}`);

    if (!isPathInside(frontendDist, filepath) || !existsSync(filepath) || statSync(filepath).isDirectory()) {
      filepath = resolve(frontendDist, 'index.html');
    }

    if (existsSync(filepath)) {
      return new Response(Bun.file(filepath));
    }

    // Server-only welcome page if frontend hasn't been built yet
    return new Response(
      `<html>
        <head>
          <title>BOBS Studio Backend Server</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0E14; color: #E4E6EB; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            h1 { color: #6366F1; margin-bottom: 8px; }
            p { color: #8F9CAE; margin-top: 0; }
            .badge { background: #1E293B; border: 1px solid #334155; padding: 6px 12px; border-radius: 9999px; font-size: 0.85rem; font-family: monospace; }
          </style>
        </head>
        <body>
          <h1>BOBS Studio Backend Server</h1>
          <p>The backend is active and listening for streaming connections.</p>
          <div class="badge">WebSocket Port: 3001 | Paths: /ws, /ws/view, /ws/rpc</div>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  },

  websocket: {
    // ================================================================
    // OPEN: Route by connection type
    // ================================================================
    open(ws) {
      const connType = ws.data.type;

      switch (connType) {
        case 'broadcaster': {
          console.log('[WebSocket] Broadcaster connected');
          broadcasterSockets.add(ws);

          // Immediately send current server state
          const initialStatus: ServerStatus = {
            isStreaming: ffmpeg.isStreaming(),
            isRecording: ffmpeg.isRecording(),
            cpuUsage: 1,
            fps: streamConfig.fps,
            activeClients: broadcasterSockets.size,
            recordings: getRecordingsList(),
            viewerCount: viewerSockets.size,
            isBroadcasting,
            isVirtualCamActive: ffmpeg.isVirtualCamActive(),
          };
          ws.send(JSON.stringify({ type: 'status-update', payload: initialStatus }));
          break;
        }

        case 'viewer': {
          console.log('[WebSocket] Viewer connected');
          viewerSockets.add(ws);

          if (isBroadcasting && initHeader) {
            // Send init metadata as JSON, then the binary init header
            const initPayload: ViewerInitPayload = {
              mimeType: 'video/webm;codecs=vp8,opus',
              resolution: streamConfig.resolution,
              fps: streamConfig.fps,
              streamStartedAt: streamStartedAt ?? new Date().toISOString(),
            };
            const initMsg: ViewerServerMessage = {
              type: 'viewer-init',
              payload: initPayload,
            };
            ws.send(JSON.stringify(initMsg));
            // Send cached binary init header so MediaSource can initialize
            ws.send(initHeader);
          } else {
            // Not broadcasting yet
            const stoppedMsg: ViewerServerMessage = { type: 'viewer-stopped' };
            ws.send(JSON.stringify(stoppedMsg));
          }
          break;
        }

        case 'rpc': {
          console.log('[WebSocket] RPC client connected');
          rpcSockets.add(ws);
          break;
        }
      }
    },

    // ================================================================
    // MESSAGE: Route by connection type
    // ================================================================
    async message(ws, message) {
      const connType = ws.data.type;

      switch (connType) {
        // ---- BROADCASTER ----
        case 'broadcaster': {
          // Binary payload (audio/video chunk from MediaRecorder)
          if (message instanceof Uint8Array || message instanceof ArrayBuffer) {
            const chunk = message instanceof Uint8Array ? message : new Uint8Array(message);

            // Cache the first binary chunk as the Matroska init header.
            // This contains EBML + Segment info + Track entries that viewers need
            // to initialize their MediaSource before appending media data.
            if (!initHeader) {
              console.log(`[WebSocket] Cached Matroska init header (${chunk.byteLength} bytes)`);
              initHeader = new Uint8Array(chunk);
              isBroadcasting = true;
              streamStartedAt = new Date().toISOString();

              // Notify any already-connected viewers that broadcast has started
              for (const viewerWs of viewerSockets) {
                try {
                  const initPayload: ViewerInitPayload = {
                    mimeType: 'video/webm;codecs=vp8,opus',
                    resolution: streamConfig.resolution,
                    fps: streamConfig.fps,
                    streamStartedAt: streamStartedAt!,
                  };
                  viewerWs.send(JSON.stringify({ type: 'viewer-init', payload: initPayload } as ViewerServerMessage));
                  viewerWs.send(initHeader!);
                } catch (_) {
                  viewerSockets.delete(viewerWs);
                }
              }
            }

            // Feed chunk to FFmpeg (recording/streaming)
            ffmpeg.writeChunk(chunk);

            // Relay binary chunk to all viewer sockets
            relayChunkToViewers(chunk);
            return;
          }

          // Control text message from broadcaster
          try {
            const data: ClientMessage = JSON.parse(message as string);
            console.log(`[WebSocket] Broadcaster control: ${data.type}`, data.payload || '');

            switch (data.type) {
              case 'configure-stream': {
                if (data.payload) {
                  streamConfig = { ...streamConfig, ...data.payload };
                  console.log('[WebSocket] Configured stream setting:', streamConfig);
                  ws.send(
                    JSON.stringify({
                      type: 'status-update',
                      payload: {
                        ...streamConfig,
                        isStreaming: ffmpeg.isStreaming(),
                        isRecording: ffmpeg.isRecording(),
                      },
                    })
                  );
                }
                break;
              }

              case 'start-recording': {
                try {
                  const filename = ffmpeg.startRecording();
                  ws.send(JSON.stringify({ type: 'recording-started', payload: { filename } }));
                  broadcastStatus();
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: 'error', payload: `Failed to start recording: ${err.message}` }));
                }
                break;
              }

              case 'stop-recording': {
                await ffmpeg.stopRecording();
                ws.send(JSON.stringify({ type: 'recording-stopped' }));
                broadcastStatus();
                break;
              }

              case 'start-streaming': {
                try {
                  if (data.payload) {
                    streamConfig = { ...streamConfig, ...data.payload };
                  }
                  ffmpeg.startStreaming(streamConfig);
                  ws.send(
                    JSON.stringify({
                      type: 'streaming-started',
                      payload: { url: `${streamConfig.rtmpUrl}/${streamConfig.streamKey}` },
                    })
                  );
                  broadcastStatus();
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: 'error', payload: `Failed to start streaming: ${err.message}` }));
                }
                break;
              }

              case 'stop-streaming': {
                await ffmpeg.stopStreaming();
                ws.send(JSON.stringify({ type: 'streaming-stopped' }));
                broadcastStatus();
                break;
              }

              case 'request-status': {
                broadcastStatus();
                break;
              }

              // Phase 3: Virtual Camera Loopback Commands
              case 'start-virtual-cam': {
                try {
                  const deviceName = await ffmpeg.startVirtualCam(streamConfig.resolution);
                  ws.send(JSON.stringify({ type: 'virtual-cam-started', payload: { device: deviceName } }));
                  broadcastStatus();
                } catch (err: any) {
                  ws.send(JSON.stringify({ type: 'error', payload: `Failed to start virtual camera: ${err.message}` }));
                }
                break;
              }

              case 'stop-virtual-cam': {
                await ffmpeg.stopVirtualCam();
                ws.send(JSON.stringify({ type: 'virtual-cam-stopped' }));
                broadcastStatus();
                break;
              }

              default:
                console.warn('[WebSocket] Unknown broadcaster command type:', data.type);
            }
          } catch (err) {
            console.error('[WebSocket] Error parsing broadcaster control message:', err);
          }
          break;
        }

        // ---- VIEWER ----
        case 'viewer': {
          // Viewers are receive-only for media data, but may send control messages
          // (e.g., requesting current status). For now we just log and ignore.
          if (typeof message === 'string') {
            try {
              const data = JSON.parse(message);
              if (data.type === 'request-status') {
                broadcastViewerStatus();
              } else {
                console.log('[WebSocket] Viewer message (ignored):', data);
              }
            } catch (err) {
              console.warn('[WebSocket] Viewer sent unparseable message');
            }
          }
          break;
        }

        // ---- RPC ----
        case 'rpc': {
          if (typeof message !== 'string') {
            ws.send(JSON.stringify(makeRPCError(0, RPC_ERRORS.PARSE_ERROR)));
            return;
          }

          let request: RPCRequest;
          try {
            request = JSON.parse(message as string);
          } catch (err) {
            ws.send(JSON.stringify(makeRPCError(0, RPC_ERRORS.PARSE_ERROR)));
            return;
          }

          // Validate JSON-RPC 2.0 structure
          if (request.jsonrpc !== '2.0' || !request.method || request.id == null) {
            ws.send(JSON.stringify(makeRPCError(request?.id ?? 0, RPC_ERRORS.INVALID_REQUEST)));
            return;
          }

          try {
            const response = await handleRPCRequest(ws, request);
            ws.send(JSON.stringify(response));
          } catch (err: any) {
            console.error('[RPC] Unhandled error:', err);
            ws.send(
              JSON.stringify(makeRPCError(request.id, { ...RPC_ERRORS.INTERNAL_ERROR, data: err.message }))
            );
          }
          break;
        }
      }
    },

    // ================================================================
    // CLOSE: Route by connection type
    // ================================================================
    close(ws, code, reason) {
      const connType = ws.data.type;

      switch (connType) {
        case 'broadcaster': {
          console.log(`[WebSocket] Broadcaster disconnected (code: ${code}, reason: ${reason})`);
          broadcasterSockets.delete(ws);
          onBroadcasterDisconnect();
          break;
        }

        case 'viewer': {
          console.log(`[WebSocket] Viewer disconnected (code: ${code})`);
          viewerSockets.delete(ws);
          break;
        }

        case 'rpc': {
          console.log(`[WebSocket] RPC client disconnected (code: ${code})`);
          rpcSockets.delete(ws);
          break;
        }
      }
    },
  },
});

console.log(`[Backend] Server listening at http://localhost:${HTTP_PORT}`);
console.log(`[Backend] WebSocket endpoints: /ws (broadcaster), /ws/view (viewer), /ws/rpc (remote control)`);
