import { basename, isAbsolute, join, relative, resolve } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';
import { ffmpeg } from './ffmpeg';
import type { ServerMessage, ClientMessage, StreamConfig, RecordingInfo, ServerStatus } from 'shared';

const HTTP_PORT = 3001;

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

// Active stream configuration (RTMP targets)
let streamConfig: StreamConfig = {
  rtmpUrl: 'rtmp://localhost/live',
  streamKey: 'bobs-key',
  resolution: { width: 1280, height: 720 },
  fps: 30,
  videoBitrate: 3000,
  audioBitrate: 128
};

// Set of active WebSocket connections
const activeSockets = new Set<any>();

// Broadcast system status to all connected clients
function broadcastStatus() {
  const status: ServerStatus = {
    isStreaming: ffmpeg.isStreaming(),
    isRecording: ffmpeg.isRecording(),
    streamingUrl: ffmpeg.isStreaming() ? `${streamConfig.rtmpUrl}/${streamConfig.streamKey}` : undefined,
    cpuUsage: Math.min(Math.round((ffmpeg.isStreaming() ? 8 : 1) + (ffmpeg.isRecording() ? 5 : 1) + Math.random() * 2), 100),
    fps: streamConfig.fps,
    activeClients: activeSockets.size,
    recordings: getRecordingsList(),
  };

  const message: ServerMessage = {
    type: 'status-update',
    payload: status,
  };

  const serialized = JSON.stringify(message);
  for (const socket of activeSockets) {
    try {
      socket.send(serialized);
    } catch (e) {
      activeSockets.delete(socket);
    }
  }
}

// Interval to broadcast server state
setInterval(() => {
  if (activeSockets.size > 0) {
    broadcastStatus();
  }
}, 1000);

console.log(`[Backend] Initializing BOBS backend on port ${HTTP_PORT}...`);

const server = Bun.serve({
  port: HTTP_PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // 1. WebSocket endpoint
    if (url.pathname === '/ws') {
      const success = server.upgrade(req);
      if (success) {
        return undefined; // Upgrade succeeded
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // 2. API Endpoints
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

    // 3. Serve frontend assets in production / fallback
    const frontendDist = resolve(import.meta.dir, '..', '..', 'frontend', 'dist');
    const requestedPath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname);
    let filepath = resolve(frontendDist, `.${requestedPath}`);

    // Fallback to index.html if the file doesn't exist (Single Page App routing)
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
          <div class="badge">WebSocket Port: 3001 | Path: /ws</div>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  },

  websocket: {
    open(ws) {
      console.log('[WebSocket] Client connected');
      activeSockets.add(ws);
      
      // Immediately send server state
      const initialStatus: ServerStatus = {
        isStreaming: ffmpeg.isStreaming(),
        isRecording: ffmpeg.isRecording(),
        cpuUsage: 1,
        fps: streamConfig.fps,
        activeClients: activeSockets.size,
        recordings: getRecordingsList(),
      };
      
      ws.send(JSON.stringify({
        type: 'status-update',
        payload: initialStatus
      }));
    },

    async message(ws, message) {
      // 1. Binary payload (audio/video chunk from MediaRecorder)
      if (message instanceof Uint8Array || message instanceof ArrayBuffer) {
        const chunk = message instanceof Uint8Array ? message : new Uint8Array(message);
        ffmpeg.writeChunk(chunk);
        return;
      }

      // 2. Control text message
      try {
        const data: ClientMessage = JSON.parse(message as string);
        console.log(`[WebSocket] Received control message: ${data.type}`, data.payload || '');

        switch (data.type) {
          case 'configure-stream': {
            if (data.payload) {
              streamConfig = { ...streamConfig, ...data.payload };
              console.log('[WebSocket] Configured stream setting:', streamConfig);
              ws.send(JSON.stringify({ type: 'status-update', payload: { ...streamConfig, isStreaming: ffmpeg.isStreaming(), isRecording: ffmpeg.isRecording() } }));
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
              ws.send(JSON.stringify({ type: 'streaming-started', payload: { url: `${streamConfig.rtmpUrl}/${streamConfig.streamKey}` } }));
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

          default:
            console.warn('[WebSocket] Unknown command type:', data.type);
        }
      } catch (err) {
        console.error('[WebSocket] Error parsing control message:', err);
      }
    },

    close(ws, code, reason) {
      console.log(`[WebSocket] Client disconnected (code: ${code}, reason: ${reason})`);
      activeSockets.delete(ws);
      
      // If this was the last socket, stop ffmpeg processes to avoid runaways
      if (activeSockets.size === 0) {
        console.log('[WebSocket] No active clients left. Stopping streaming and recording processes.');
        ffmpeg.stopRecording();
        ffmpeg.stopStreaming();
      }
    },
  },
});

console.log(`[Backend] Server listening at http://localhost:${HTTP_PORT}`);
