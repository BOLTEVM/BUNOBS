export type SourceType = 'screen' | 'camera' | 'image' | 'text' | 'color' | 'video';

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

    // For type === 'camera' or 'screen'
    deviceId?: string;
    trackId?: string;
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
}

// WebSocket Command/Event Protocol
export type ClientMessageType =
  | 'start-streaming'
  | 'stop-streaming'
  | 'start-recording'
  | 'stop-recording'
  | 'configure-stream'
  | 'request-status';

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
  | 'ffmpeg-error'
  | 'error';

export interface ServerMessage {
  type: ServerMessageType;
  payload?: any;
}
