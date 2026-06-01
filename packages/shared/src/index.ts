export type SourceType = 'screen' | 'window' | 'game' | 'camera' | 'image' | 'text' | 'color' | 'video';

export type CaptureMethod = 'automatic' | 'windows-graphics-capture' | 'bitblt' | 'browser-picker';
export type WindowMatchPriority =
  | 'title-then-type'
  | 'title-then-executable'
  | 'exact-title';
export type GameCaptureMode = 'specific-window' | 'any-fullscreen' | 'foreground-hotkey';

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  x: number;      // Position X on canvas (e.g., 0 to 1920)
  y: number;      // Position Y on canvas
  width: number;  // Width on canvas
  height: number; // Height on canvas
  zIndex: number; // Layer order
  opacity: number;// 0 to 1
  visible: boolean;
  muted: boolean;
  volume: number; // 0 to 1
  settings: {
    // For type === 'text'
    textContent?: string;
    fontSize?: number;
    fontColor?: string;
    fontFamily?: string;
    fontWeight?: string;
    
    // For type === 'image' or 'video'
    mediaUrl?: string; // local object URL or path
    mediaFile?: File;  // React-side local File reference (non-serializable, transient)

    // For type === 'color'
    colorHex?: string;

    // For type === 'camera'
    deviceId?: string;
    trackId?: string;

    // For type === 'screen', 'window', or 'game'
    captureMethod?: CaptureMethod;
    captureAudio?: boolean;
    captureCursor?: boolean;
    forceSdr?: boolean;

    // For type === 'screen'
    displayId?: string;
    displayLabel?: string;

    // For type === 'window' or 'game'
    windowTitle?: string;
    windowExecutable?: string;
    windowMatchPriority?: WindowMatchPriority;

    // For type === 'window'
    clientArea?: boolean;

    // For type === 'game'
    gameCaptureMode?: GameCaptureMode;
    sliCrossfireCaptureMode?: boolean;
    allowTransparency?: boolean;

    // Chroma Key Video DSP Filters
    chromaKeyEnabled?: boolean;
    chromaKeyColor?: string;
    chromaKeySimilarity?: number;
    chromaKeySmoothness?: number;
  };
}

export interface Scene {
  id: string;
  name: string;
  sources: Source[];
}

export interface StreamConfig {
  rtmpUrl: string;
  streamKey: string;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  videoBitrate: number; // in kbps (e.g. 3000)
  audioBitrate: number; // in kbps (e.g. 128)
}

export interface RecordingInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
}

export interface ServerStatus {
  isStreaming: boolean;
  isRecording: boolean;
  streamingUrl?: string;
  cpuUsage: number;
  fps: number;
  activeClients: number;
  recordings: RecordingInfo[];
  // Phase 2: Web-NDI viewer stats
  viewerCount: number;
  isBroadcasting: boolean;
  // Phase 3: Virtual Camera
  isVirtualCamActive: boolean;
}

// WebSocket Command/Event Protocol (Broadcaster <-> Backend)
export type ClientMessageType =
  | 'start-streaming'
  | 'stop-streaming'
  | 'start-recording'
  | 'stop-recording'
  | 'configure-stream'
  | 'request-status'
  | 'start-virtual-cam'
  | 'stop-virtual-cam';

export interface ClientMessage {
  type: ClientMessageType;
  payload?: any;
}

export type ServerMessageType =
  | 'status-update'
  | 'recording-started'
  | 'recording-stopped'
  | 'streaming-started'
  | 'streaming-stopped'
  | 'virtual-cam-started'
  | 'virtual-cam-stopped'
  | 'ffmpeg-error'
  | 'error';

export interface ServerMessage {
  type: ServerMessageType;
  payload?: any;
}

// ============================================================
// Phase 2: Web-NDI Viewer Protocol
// ============================================================

/**
 * Messages sent from the backend to viewer clients on /ws/view
 */
export type ViewerServerMessageType =
  | 'viewer-init'         // Initial metadata + init header payload
  | 'viewer-chunk'        // Binary media chunk relay (sent as binary frame, not JSON)
  | 'viewer-stopped'      // Broadcast has ended
  | 'viewer-status';      // Status heartbeat for viewer UI

export interface ViewerInitPayload {
  mimeType: string;       // e.g. 'video/webm;codecs=vp8,opus'
  resolution: { width: number; height: number };
  fps: number;
  streamStartedAt: string; // ISO timestamp
}

export interface ViewerStatusPayload {
  isLive: boolean;
  viewerCount: number;
  uptime: number;          // seconds since stream started
  resolution: { width: number; height: number };
}

export interface ViewerServerMessage {
  type: ViewerServerMessageType;
  payload?: ViewerInitPayload | ViewerStatusPayload | any;
}

// ============================================================
// Phase 2: JSON-RPC Remote Control Protocol (/ws/rpc)
// ============================================================

/**
 * JSON-RPC 2.0 compatible request/response for remote control.
 * Compatible with Stream Deck WebSocket controllers and similar tools.
 */
export interface RPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: RPCMethod;
  params?: Record<string, any>;
}

export type RPCMethod =
  | 'GetSceneList'
  | 'SetCurrentScene'
  | 'GetCurrentScene'
  | 'StartStreaming'
  | 'StopStreaming'
  | 'StartRecording'
  | 'StopRecording'
  | 'GetStreamStatus'
  | 'SetVolume'
  | 'SetMute'
  | 'GetSourceSettings'
  | 'SetSourceVisibility'
  | 'TriggerTransition'
  | 'GetViewerCount'
  | 'StartVirtualCam'
  | 'StopVirtualCam'
  | 'GetVirtualCamStatus';

export interface RPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: RPCError;
}

export interface RPCError {
  code: number;
  message: string;
  data?: any;
}

// Standard JSON-RPC error codes
export const RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
  STREAM_NOT_ACTIVE: { code: -32000, message: 'Stream is not active' },
  RECORDING_NOT_ACTIVE: { code: -32001, message: 'Recording is not active' },
  ALREADY_ACTIVE: { code: -32002, message: 'Operation already active' },
  VIRTUAL_CAM_NOT_AVAILABLE: { code: -32003, message: 'Virtual camera driver not available' },
} as const;
