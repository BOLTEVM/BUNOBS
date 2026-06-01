import React, { useEffect, useRef, useState } from 'react';
import {
  Tv, Camera, Image as ImageIcon, Type, Palette, Video as VideoIcon,
  Play, Square, Volume2, VolumeX, Eye, EyeOff, Plus,
  Layers, Sliders, Settings, Radio, Maximize2, Monitor, Gamepad2, Download, Upload,
  Wifi, Disc, ChevronUp, ChevronDown, ArrowUpDown, ScreenShare,
  Minus
} from 'lucide-react';
import type { Scene, Source, ServerStatus, StreamConfig, SourceType } from 'shared';
import { compositor } from './utils/Compositor';
import { audioMixer } from './utils/AudioMix';
import { analyzeCaptureCompatibility, createCaptureSettings, getCaptureProfile, isCaptureSource } from './utils/CaptureIntelligence';
import { AddSourceModal } from './components/AddSourceModal';
import { SettingsModal } from './components/SettingsModal';
import { FiltersModal } from './components/FiltersModal';


// Pre-configured default scenes & sources
const INITIAL_SCENES: Scene[] = [
  {
    id: 'scene-intro',
    name: 'Branded Intro',
    sources: [
      {
        id: 'intro-bg',
        name: 'Background Color',
        type: 'color',
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        zIndex: 1,
        opacity: 1,
        visible: true,
        muted: true,
        volume: 0,
        settings: { colorHex: '#0B0F19' }
      },
      {
        id: 'intro-logo',
        name: 'BOBS Logo',
        type: 'image',
        x: 490,
        y: 120,
        width: 300,
        height: 300,
        zIndex: 2,
        opacity: 1,
        visible: true,
        muted: true,
        volume: 0,
        settings: { mediaUrl: '/0logov3.png' }
      },
      {
        id: 'intro-title',
        name: 'Title Text',
        type: 'text',
        x: 340,
        y: 460,
        width: 600,
        height: 80,
        zIndex: 3,
        opacity: 1,
        visible: true,
        muted: true,
        volume: 0,
        settings: {
          textContent: 'BOBS LIVE STREAM',
          fontSize: 60,
          fontColor: '#6366F1',
          fontWeight: '800'
        }
      },
      {
        id: 'intro-subtitle',
        name: 'Subtitle Text',
        type: 'text',
        x: 430,
        y: 540,
        width: 420,
        height: 40,
        zIndex: 4,
        opacity: 1,
        visible: true,
        muted: true,
        volume: 0,
        settings: {
          textContent: 'Powered by Bun & FFmpeg',
          fontSize: 24,
          fontColor: '#94A3B8',
          fontWeight: '500'
        }
      }
    ]
  },
  {
    id: 'scene-gaming',
    name: 'Desktop + Camera',
    sources: [
      {
        id: 'game-bg',
        name: 'Background Fill',
        type: 'color',
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        zIndex: 1,
        opacity: 1,
        visible: true,
        muted: true,
        volume: 0,
        settings: { colorHex: '#080A10' }
      },
      {
        id: 'gaming-screen',
        name: 'Display Capture',
        type: 'screen',
        x: 40,
        y: 40,
        width: 1200,
        height: 640,
        zIndex: 2,
        opacity: 1,
        visible: true,
        muted: false,
        volume: 0.8,
        settings: createCaptureSettings('screen')
      },
      {
        id: 'gaming-camera',
        name: 'Webcam Overlay',
        type: 'camera',
        x: 940,
        y: 440,
        width: 280,
        height: 210,
        zIndex: 3,
        opacity: 1,
        visible: true,
        muted: false,
        volume: 0.8,
        settings: {}
      }
    ]
  }
];

// Inject global styles for animations, scrollbar, and component classes
const injectGlobalStyles = () => {
  if (document.getElementById('bobs-global-styles')) return;
  const style = document.createElement('style');
  style.id = 'bobs-global-styles';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    .mono { font-family: 'JetBrains Mono', monospace !important; }

    @keyframes logoGlow {
      0%, 100% { filter: drop-shadow(0 0 8px rgba(99, 102, 241, 0.5)); }
      50% { filter: drop-shadow(0 0 16px rgba(99, 102, 241, 0.8)); }
    }

    @keyframes pulseRed {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 0 12px 4px rgba(239, 68, 68, 0.3); }
    }

    @keyframes pulseGreen {
      0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
      50% { box-shadow: 0 0 12px 4px rgba(16, 185, 129, 0.3); }
    }

    @keyframes pulsePurple {
      0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
      50% { box-shadow: 0 0 12px 4px rgba(139, 92, 246, 0.3); }
    }

    @keyframes liveDot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    @keyframes programBorderGlow {
      0%, 100% { border-color: rgba(239, 68, 68, 0.5); box-shadow: inset 0 0 20px rgba(239, 68, 68, 0.05); }
      50% { border-color: rgba(239, 68, 68, 0.8); box-shadow: inset 0 0 30px rgba(239, 68, 68, 0.1); }
    }

    .header-logo {
      height: 30px;
      animation: logoGlow 3s ease-in-out infinite;
      transition: transform 0.2s ease, filter 0.2s ease;
    }
    .header-logo:hover {
      transform: scale(1.1);
      filter: drop-shadow(0 0 20px rgba(99, 102, 241, 0.9)) !important;
    }

    .stat-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.7rem;
      font-weight: 600;
      transition: border-color 0.2s ease;
    }
    .stat-pill:hover { border-color: rgba(99, 102, 241, 0.4); }
    .stat-pill .stat-label {
      color: #64748B;
      font-size: 0.6rem;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    .stat-pill .stat-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 600;
      color: #E2E8F0;
    }

    .conn-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .conn-dot.connected { background: #10B981; box-shadow: 0 0 6px rgba(16, 185, 129, 0.5); }
    .conn-dot.disconnected { background: #F59E0B; box-shadow: 0 0 6px rgba(245, 158, 11, 0.5); }

    .live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #EF4444;
      animation: liveDot 1s ease-in-out infinite;
      flex-shrink: 0;
    }

    .rec-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10B981;
      animation: liveDot 1s ease-in-out infinite;
      flex-shrink: 0;
    }

    .canvas-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 1px;
      z-index: 10;
      pointer-events: none;
      text-transform: uppercase;
    }
    .canvas-badge.preview {
      background: rgba(99, 102, 241, 0.2);
      color: #A5B4FC;
      border: 1px solid rgba(99, 102, 241, 0.4);
    }
    .canvas-badge.program {
      background: rgba(239, 68, 68, 0.2);
      color: #FCA5A5;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }

    .canvas-res-info {
      text-align: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      color: #475569;
      padding: 4px 0 0 0;
    }

    .program-canvas-live {
      animation: programBorderGlow 2s ease-in-out infinite;
      border: 2px solid rgba(239, 68, 68, 0.5) !important;
    }

    .panel-section {
      display: flex;
      flex-direction: column;
      background: #0F1524;
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 6px;
      min-width: 0;
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: rgba(15, 23, 42, 0.8);
      border-bottom: 1px solid rgba(51, 65, 85, 0.4);
      flex-shrink: 0;
    }
    .panel-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: #94A3B8;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 4px;
    }
    .panel-toolbar {
      display: flex;
      align-items: center;
      border-top: 1px solid rgba(51, 65, 85, 0.4);
      background: rgba(15, 23, 42, 0.5);
      flex-shrink: 0;
    }
    .panel-toolbar-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 5px 0;
      background: transparent;
      border: none;
      border-right: 1px solid rgba(51, 65, 85, 0.3);
      color: #64748B;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .panel-toolbar-btn:last-child { border-right: none; }
    .panel-toolbar-btn:hover { background: rgba(99, 102, 241, 0.1); color: #A5B4FC; }
    .panel-toolbar-btn:active { background: rgba(99, 102, 241, 0.2); }

    .scene-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 0.78rem;
      color: #CBD5E1;
      border-left: 3px solid transparent;
      transition: background 0.12s ease, border-color 0.12s ease;
      user-select: none;
    }
    .scene-item:hover { background: rgba(99, 102, 241, 0.06); }
    .scene-item.active {
      background: rgba(99, 102, 241, 0.1);
      border-left-color: #6366F1;
      color: #E2E8F0;
    }
    .scene-item .live-tag {
      background: rgba(239, 68, 68, 0.15);
      color: #FCA5A5;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .scene-rename-input {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid #6366F1;
      color: #E2E8F0;
      font-size: 0.78rem;
      padding: 2px 6px;
      border-radius: 3px;
      outline: none;
      width: 100%;
      font-family: inherit;
    }

    .source-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 0.78rem;
      color: #CBD5E1;
      border-radius: 3px;
      transition: background 0.12s ease;
      user-select: none;
      gap: 4px;
    }
    .source-item:hover { background: rgba(99, 102, 241, 0.06); }
    .source-item.active { background: rgba(99, 102, 241, 0.12); }
    .source-item .source-info {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }
    .source-item .source-info span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .source-item .source-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }

    .src-action-btn {
      background: transparent;
      border: none;
      padding: 3px;
      cursor: pointer;
      color: #64748B;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s ease, color 0.12s ease;
    }
    .src-action-btn:hover { background: rgba(99, 102, 241, 0.15); color: #A5B4FC; }

    /* Audio Mixer */
    .mixer-strip {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 5px;
      padding: 6px 4px;
      min-width: 72px;
      flex-shrink: 0;
    }
    .mixer-strip-name {
      font-size: 0.6rem;
      color: #94A3B8;
      font-weight: 600;
      text-align: center;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mixer-meters {
      display: flex;
      gap: 2px;
      height: 80px;
    }
    .mixer-meter-track {
      width: 6px;
      background: rgba(15, 23, 42, 0.8);
      border-radius: 2px;
      overflow: hidden;
      display: flex;
      flex-direction: column-reverse;
      border: 1px solid rgba(51, 65, 85, 0.3);
    }
    .mixer-meter-fill {
      width: 100%;
      transition: height 0.08s linear;
      border-radius: 1px;
    }
    .mixer-meter-fill.left {
      background: linear-gradient(to top, #10B981, #34D399 60%, #FBBF24 85%, #EF4444 100%);
    }
    .mixer-meter-fill.right {
      background: linear-gradient(to top, #10B981, #34D399 60%, #FBBF24 85%, #EF4444 100%);
    }
    .mixer-db-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.55rem;
      color: #475569;
      text-align: center;
    }
    .mixer-fader {
      width: 100%;
      display: flex;
      align-items: center;
      padding: 0 2px;
    }
    .mixer-fader input[type="range"] {
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(51, 65, 85, 0.5);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }
    .mixer-fader input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 10px;
      height: 14px;
      background: #CBD5E1;
      border-radius: 2px;
      border: 1px solid #64748B;
      cursor: pointer;
    }
    .mixer-mute-btn {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(51, 65, 85, 0.4);
      padding: 3px 5px;
      border-radius: 3px;
      color: #94A3B8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
    }
    .mixer-mute-btn:hover { background: rgba(51, 65, 85, 0.5); }
    .mixer-mute-btn.muted {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.3);
      color: #EF4444;
    }

    /* Control Board */
    .ctrl-btn {
      width: 100%;
      padding: 8px 12px;
      font-size: 0.78rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid rgba(51, 65, 85, 0.5);
      background: rgba(30, 41, 59, 0.4);
      color: #CBD5E1;
    }
    .ctrl-btn:hover { background: rgba(51, 65, 85, 0.5); border-color: rgba(99, 102, 241, 0.3); }
    .ctrl-btn:active { transform: scale(0.98); }
    .ctrl-btn.streaming-active {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #FCA5A5;
      animation: pulseRed 2s ease-in-out infinite;
    }
    .ctrl-btn.recording-active {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.4);
      color: #6EE7B7;
      animation: pulseGreen 2s ease-in-out infinite;
    }
    .ctrl-btn.vcam-active {
      background: rgba(139, 92, 246, 0.15);
      border-color: rgba(139, 92, 246, 0.4);
      color: #C4B5FD;
      animation: pulsePurple 2s ease-in-out infinite;
    }
    .ctrl-btn.studio-active {
      background: rgba(99, 102, 241, 0.12);
      border-color: rgba(99, 102, 241, 0.4);
      color: #A5B4FC;
    }
    .ctrl-btn.primary-action {
      background: rgba(99, 102, 241, 0.15);
      border-color: rgba(99, 102, 241, 0.3);
      color: #A5B4FC;
    }
    .ctrl-btn.primary-action:hover {
      background: rgba(99, 102, 241, 0.25);
      border-color: rgba(99, 102, 241, 0.5);
    }

    /* Transition panel */
    .transition-select {
      width: 100%;
      padding: 5px 8px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 4px;
      color: #CBD5E1;
      font-size: 0.75rem;
      outline: none;
      cursor: pointer;
    }
    .transition-select:focus { border-color: rgba(99, 102, 241, 0.5); }
    .transition-duration-input {
      width: 100%;
      padding: 5px 8px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 4px;
      color: #CBD5E1;
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      outline: none;
      text-align: center;
    }
    .transition-duration-input:focus { border-color: rgba(99, 102, 241, 0.5); }
    .transition-btn {
      width: 100%;
      padding: 7px 12px;
      font-size: 0.75rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid rgba(99, 102, 241, 0.3);
      background: rgba(99, 102, 241, 0.12);
      color: #A5B4FC;
    }
    .transition-btn:hover { background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.5); }
    .transition-btn:active { transform: scale(0.97); }
    .transition-btn-secondary {
      width: 100%;
      padding: 5px 10px;
      font-size: 0.7rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.12s ease;
      border: 1px solid rgba(51, 65, 85, 0.4);
      background: rgba(30, 41, 59, 0.4);
      color: #94A3B8;
    }
    .transition-btn-secondary:hover { background: rgba(51, 65, 85, 0.4); color: #CBD5E1; }

    /* Header buttons */
    .header-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid rgba(51, 65, 85, 0.5);
      background: rgba(30, 41, 59, 0.5);
      color: #94A3B8;
    }
    .header-btn:hover { background: rgba(51, 65, 85, 0.5); color: #CBD5E1; border-color: rgba(99, 102, 241, 0.3); }
    .header-btn:active { transform: scale(0.97); }
    .header-btn.active { background: rgba(99, 102, 241, 0.12); border-color: rgba(99, 102, 241, 0.4); color: #A5B4FC; }

    /* Bottom status bar */
    .status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 16px;
      background: #0B0F19;
      border-top: 1px solid rgba(51, 65, 85, 0.3);
      font-size: 0.65rem;
      color: #475569;
      flex-shrink: 0;
      gap: 16px;
      z-index: 10;
    }
    .status-bar-left, .status-bar-right {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .status-bar-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .status-bar-item .mono { font-family: 'JetBrains Mono', monospace; }

    .empty-panel {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #334155;
      font-size: 0.75rem;
    }

    /* Scrollbar styling */
    .panel-body::-webkit-scrollbar { width: 4px; }
    .panel-body::-webkit-scrollbar-track { background: transparent; }
    .panel-body::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.4); border-radius: 2px; }
    .panel-body::-webkit-scrollbar-thumb:hover { background: rgba(99, 102, 241, 0.3); }
  `;
  document.head.appendChild(style);
};

export const App: React.FC = () => {
  // Canvases
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // UI states
  const [scenes, setScenes] = useState<Scene[]>(INITIAL_SCENES);
  const [activeSceneId, setActiveSceneId] = useState('scene-intro');
  const [programSceneId, setProgramSceneId] = useState('scene-intro');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [studioMode, setStudioMode] = useState(true);
  
  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [filterSource, setFilterSource] = useState<Source | null>(null);

  // Status and Server States
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    isStreaming: false,
    isRecording: false,
    cpuUsage: 1,
    fps: 30,
    activeClients: 0,
    recordings: [],
    viewerCount: 0,
    isBroadcasting: false,
    isVirtualCamActive: false
  });

  // Client-side stream settings config
  const [streamConfig, setStreamConfig] = useState<StreamConfig>({
    rtmpUrl: 'rtmp://localhost/live',
    streamKey: 'bobs-key',
    resolution: { width: 1280, height: 720 },
    fps: 30,
    videoBitrate: 3000,
    audioBitrate: 128
  });

  const { resolution: { width, height } } = streamConfig;

  // Timers for live overlays
  const [streamTime, setStreamTime] = useState(0);
  const [recordTime, setRecordTime] = useState(0);
  const streamTimerRef = useRef<any>(null);
  const recordTimerRef = useRef<any>(null);

  // WebSocket media ingestion recorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // File input ref for scene collection imports
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time decibel states for audio visualizer
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({});
  const [activeMediaSourceIds, setActiveMediaSourceIds] = useState<Set<string>>(new Set());

  // Scene inline rename state
  const [renamingSceneId, setRenamingSceneId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Transition panel states
  const [transitionType, setTransitionType] = useState<'cut' | 'fade' | 'slide'>('fade');
  const [transitionDuration, setTransitionDuration] = useState(400);

  // Inject global styles on mount
  useEffect(() => { injectGlobalStyles(); }, []);

  // 1. Establish connection to Bun Backend WebSocket
  useEffect(() => {
    const connectWs = () => {
      const port = 3001;
      const wsUrl = `ws://${window.location.hostname}:${port}/ws`;
      console.log(`[App] Connecting to WebSocket: ${wsUrl}`);
      
      const socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('[WebSocket] Connection established');
        setWsConnected(true);
        setWs(socket);
        socket.send(JSON.stringify({ type: 'request-status' }));
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'status-update') {
            setServerStatus(prev => ({ ...prev, ...msg.payload }));
          } else if (msg.type === 'error') {
            alert(`Backend Error: ${msg.payload}`);
          }
        } catch (e) {
          console.error('[WebSocket] Message parsing error:', e);
        }
      };

      socket.onclose = () => {
        console.warn('[WebSocket] Connection closed, retrying in 3 seconds...');
        setWsConnected(false);
        setWs(null);
        setTimeout(connectWs, 3000);
      };
    };

    connectWs();
    
    // Initialize standard image elements for defaults
    preloadDefaultAssets();

    return () => {
      compositor.destroy();
    };
  }, []);

  // Sync scenes and selections to canvas compositor
  useEffect(() => {
    compositor.setScenes(scenes, activeSceneId, programSceneId);
  }, [scenes, activeSceneId, programSceneId]);

  // Global Hotkey Listener (inspired by OBS Studio core hotkeys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if the user is typing in a text input / textarea / contenteditable
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      // 1. Action Toggles (Ctrl + Alt)
      if (e.ctrlKey && e.altKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          if (serverStatus.isStreaming) stopStreaming();
          else startStreaming();
        }
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          if (serverStatus.isRecording) stopRecording();
          else startRecording();
        }
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          compositor.triggerTransition('fade', 400);
        }
      }

      // 2. Scene Switchers (Keys 1 to 9)
      const keyNum = parseInt(e.key);
      if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 9) {
        const targetScene = scenes[keyNum - 1];
        if (targetScene && targetScene.id !== activeSceneId) {
          e.preventDefault();
          setActiveSceneId(targetScene.id);
          compositor.setActiveScene(targetScene.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scenes, activeSceneId, serverStatus.isStreaming, serverStatus.isRecording, streamConfig]);

  // Hook canvases to compositor once loaded
  useEffect(() => {
    if (previewCanvasRef.current && programCanvasRef.current) {
      compositor.setCanvases(previewCanvasRef.current, programCanvasRef.current);
      compositor.setCallbacks(
        (id) => setSelectedSourceId(id),
        (updatedScenes) => setScenes(updatedScenes),
        (sceneId) => setProgramSceneId(sceneId)
      );
    }
  }, [previewCanvasRef, programCanvasRef, width, height]);

  // Poll real-time audio amplitudes for vertical decibel meters
  useEffect(() => {
    let frameId: number;
    const pollLevels = () => {
      const activeScene = scenes.find((s) => s.id === activeSceneId);
      if (activeScene) {
        const levels: Record<string, number> = {};
        activeScene.sources.forEach((source) => {
          if (
            source.type === 'camera' ||
            source.type === 'screen' ||
            source.type === 'window' ||
            source.type === 'game' ||
            source.type === 'video'
          ) {
            levels[source.id] = audioMixer.getAudioLevel(source.id);
          }
        });
        setAudioLevels(levels);
      }
      frameId = requestAnimationFrame(pollLevels);
    };

    pollLevels();
    return () => cancelAnimationFrame(frameId);
  }, [scenes, activeSceneId]);

  // Manage clock tickers for streaming / recording
  useEffect(() => {
    if (serverStatus.isStreaming) {
      streamTimerRef.current = setInterval(() => setStreamTime(t => t + 1), 1000);
    } else {
      clearInterval(streamTimerRef.current);
      setStreamTime(0);
    }

    if (serverStatus.isRecording) {
      recordTimerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } else {
      clearInterval(recordTimerRef.current);
      setRecordTime(0);
    }

    return () => {
      clearInterval(streamTimerRef.current);
      clearInterval(recordTimerRef.current);
    };
  }, [serverStatus.isStreaming, serverStatus.isRecording]);

  // 2. Preload logo assets
  const preloadDefaultAssets = () => {
    const logoImg = new Image();
    logoImg.src = '/0logov3.png';
    logoImg.onload = () => {
      console.log('[Assets] Preloaded 0logov3.png');
      compositor.registerMediaElement('intro-logo', logoImg);
    };
  };

  // --- Capture Media & Screen Streams ---
  const handleAddSource = async (type: SourceType, name: string, settings: any) => {
    const newSourceId = `source-${Date.now()}`;
    let initialWidth = 400;
    let initialHeight = 300;
    let initialX = 100;
    let initialY = 100;

    if (type === 'screen' || type === 'window' || type === 'game' || type === 'color') {
      initialWidth = 1280;
      initialHeight = 720;
      initialX = 0;
      initialY = 0;
    }

    const newSource: Source = {
      id: newSourceId,
      name,
      type,
      x: initialX,
      y: initialY,
      width: initialWidth,
      height: initialHeight,
      zIndex: getNextZIndex(),
      opacity: 1,
      visible: true,
      muted: false,
      volume: 0.8,
      settings
    };

    const activated = await activateSourceMedia(newSource);
    if (!activated && (type === 'screen' || type === 'window' || type === 'game' || type === 'camera' || type === 'video')) {
      return;
    }

    // Append to active scene
    const updatedScenes = scenes.map((scene) => {
      if (scene.id === activeSceneId) {
        return {
          ...scene,
          sources: [...scene.sources, newSource]
        };
      }
      return scene;
    });

    setScenes(updatedScenes);
    compositor.setSelectedSource(newSourceId);
  };

  const activateSourceMedia = async (source: Source): Promise<boolean> => {
    if (compositor.getMediaElement(source.id)) {
      setActiveMediaSourceIds((current) => new Set(current).add(source.id));
      return true;
    }

    if (isCaptureSource(source.type)) {
      try {
        console.log(`[Media] Triggering ${source.type} capture...`, source.settings);
        const [compatibilityNotice] = analyzeCaptureCompatibility(source);
        if (compatibilityNotice?.level === 'warning') {
          console.warn(`[Capture] ${compatibilityNotice.message}`);
        }
        const captureProfile = getCaptureProfile(source.type);
        const displayMediaOptions = {
          video: {
            frameRate: 30,
            cursor: source.settings.captureCursor === false ? 'never' : 'always',
            displaySurface: captureProfile?.browserSurface === 'monitor' ? 'monitor' : 'window'
          },
          audio: source.settings.captureAudio !== false
        } as DisplayMediaStreamOptions;
        const stream = await navigator.mediaDevices.getDisplayMedia({
          ...displayMediaOptions
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true; // prevent loop feedback locally
        video.playsInline = true;
        video.play();

        compositor.registerMediaElement(source.id, video);
        if (source.settings.captureAudio !== false) {
          audioMixer.connectScreenAudio(source.id, stream);
        }
        setActiveMediaSourceIds((current) => new Set(current).add(source.id));
      } catch (e) {
        console.error('Screen capture rejected:', e);
        return false;
      }
    } 
    else if (source.type === 'camera') {
      try {
        console.log(`[Media] Triggering camera capture (device: ${source.settings.deviceId})...`);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: source.settings.deviceId ? { deviceId: { exact: source.settings.deviceId } } : true,
          audio: true
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.play();

        compositor.registerMediaElement(source.id, video);
        audioMixer.connectMicrophone(source.id, stream);
        setActiveMediaSourceIds((current) => new Set(current).add(source.id));
      } catch (e) {
        console.error('Camera capture rejected:', e);
        return false;
      }
    }
    else if (source.type === 'image') {
      const img = new Image();
      img.src = source.settings.mediaUrl || '';
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        source.width = img.naturalWidth || source.width;
        source.height = img.naturalHeight || source.height;
        compositor.registerMediaElement(source.id, img);
        setActiveMediaSourceIds((current) => new Set(current).add(source.id));
        triggerSceneRefresh();
      };
    }
    else if (source.type === 'video') {
      const video = document.createElement('video');
      video.src = source.settings.mediaUrl || '';
      video.loop = true;
      video.muted = false;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.play();

      compositor.registerMediaElement(source.id, video);
      audioMixer.connectMediaElement(source.id, video);
      setActiveMediaSourceIds((current) => new Set(current).add(source.id));
    }

    return true;
  };

  const deleteSource = (sourceId: string) => {
    // Disconnect audio
    audioMixer.disconnectSource(sourceId);
    compositor.releaseMediaElementById(sourceId);
    setActiveMediaSourceIds((current) => {
      const next = new Set(current);
      next.delete(sourceId);
      return next;
    });

    const updated = scenes.map((scene) => {
      if (scene.id === activeSceneId) {
        return {
          ...scene,
          sources: scene.sources.filter(s => s.id !== sourceId)
        };
      }
      return scene;
    });

    setScenes(updated);
    if (selectedSourceId === sourceId) {
      compositor.setSelectedSource(null);
    }
  };

  const updateSource = (sourceId: string, updates: Partial<Source>) => {
    setScenes((currentScenes) => currentScenes.map((scene) => {
      if (scene.id !== activeSceneId) return scene;
      return {
        ...scene,
        sources: scene.sources.map((source) => (
          source.id === sourceId ? { ...source, ...updates } : source
        ))
      };
    }));
  };

  // --- WebSocket Streaming / Recording Activation ---
  const startStreaming = () => {
    if (!ws || !wsConnected) {
      alert('WebSocket not connected to Bun backend!');
      return;
    }

    console.log('[Ingest] Launching backend streaming...');
    ws.send(JSON.stringify({
      type: 'start-streaming',
      payload: streamConfig
    }));

    // Trigger MediaRecorder feed piping
    startMediaRecorderPipeline();
  };

  const stopStreaming = () => {
    if (!ws) return;
    console.log('[Ingest] Stopping stream...');
    ws.send(JSON.stringify({ type: 'stop-streaming' }));
    
    // Stop recording pipeline if both are inactive
    if (!serverStatus.isRecording) {
      stopMediaRecorderPipeline();
    }
  };

  const startRecording = () => {
    if (!ws || !wsConnected) {
      alert('WebSocket backend not connected!');
      return;
    }

    console.log('[Ingest] Triggering backend local file recorder...');
    ws.send(JSON.stringify({ type: 'start-recording' }));

    startMediaRecorderPipeline();
  };

  const stopRecording = () => {
    if (!ws) return;
    console.log('[Ingest] Stopping backend recorder...');
    ws.send(JSON.stringify({ type: 'stop-recording' }));

    if (!serverStatus.isStreaming) {
      stopMediaRecorderPipeline();
    }
  };

  // --- Phase 3: Virtual Camera Controls ---
  const startVirtualCam = () => {
    if (!ws || !wsConnected) {
      alert('WebSocket not connected to Bun backend!');
      return;
    }
    console.log('[VCam] Starting virtual camera loopback...');
    ws.send(JSON.stringify({ type: 'start-virtual-cam' }));
    // Also start the media pipeline if not already running
    startMediaRecorderPipeline();
  };

  const stopVirtualCam = () => {
    if (!ws) return;
    console.log('[VCam] Stopping virtual camera...');
    ws.send(JSON.stringify({ type: 'stop-virtual-cam' }));
    if (!serverStatus.isStreaming && !serverStatus.isRecording) {
      stopMediaRecorderPipeline();
    }
  };

  // Canvas Program + Web Audio mixed track recording
  const startMediaRecorderPipeline = () => {
    if (mediaRecorderRef.current) return;

    console.log('[Pipeline] Building stream pipelines...');
    const programCanvas = programCanvasRef.current;
    if (!programCanvas) return;

    // Get 30fps canvas stream
    const canvasStream = programCanvas.captureStream(streamConfig.fps);
    const combinedStream = new MediaStream();

    // Add Video Track
    if (canvasStream.getVideoTracks().length > 0) {
      combinedStream.addTrack(canvasStream.getVideoTracks()[0]);
    }

    // Add Mixed Audio Track
    const audioTrack = audioMixer.getMixedStream()?.getAudioTracks()[0];
    if (audioTrack) {
      combinedStream.addTrack(audioTrack);
      console.log('[Pipeline] Mixed audio track successfully connected.');
    } else {
      console.warn('[Pipeline] No mixed audio tracks available.');
    }

    try {
      // Setup browser MediaRecorder
      const options = {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: streamConfig.videoBitrate * 1000,
        audioBitsPerSecond: streamConfig.audioBitrate * 1000
      };

      const recorder = new MediaRecorder(combinedStream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
          const array = await event.data.arrayBuffer();
          ws.send(new Uint8Array(array)); // push raw binary slice to Bun FFmpeg stdin
        }
      };

      recorder.start(100); // 100ms timeslices for smooth real-time delivery
      console.log('[Pipeline] Browser media pipeline active.');
    } catch (e) {
      console.error('[Pipeline] Failed to create MediaRecorder:', e);
    }
  };

  const stopMediaRecorderPipeline = () => {
    if (mediaRecorderRef.current) {
      console.log('[Pipeline] Closing media pipeline...');
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
      mediaRecorderRef.current = null;
    }
  };

  // --- Auxiliary utilities ---
  const getNextZIndex = (): number => {
    const scene = scenes.find((s) => s.id === activeSceneId);
    if (!scene || scene.sources.length === 0) return 1;
    return Math.max(...scene.sources.map(s => s.zIndex)) + 1;
  };

  const triggerSceneRefresh = () => {
    setScenes([...scenes]);
  };

  const formatClock = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [
      h > 0 ? String(h).padStart(2, '0') : null,
      String(m).padStart(2, '0'),
      String(s).padStart(2, '0')
    ].filter(Boolean).join(':');
  };

  const activeScene = scenes.find((s) => s.id === activeSceneId);
  const isCapturableSource = (source: Source) => (
    isCaptureSource(source.type) || source.type === 'camera'
  );
  const getCaptureLabel = (source: Source) => {
    const captureProfile = getCaptureProfile(source.type);
    if (captureProfile) return captureProfile.activationLabel;
    return 'camera ingest';
  };
  const isSourceMediaActive = (source: Source) => activeMediaSourceIds.has(source.id) || Boolean(compositor.getMediaElement(source.id));
  const handleExportSetup = () => {
    const collection = {
      scenes,
      activeSceneId,
      programSceneId,
      streamConfig
    };
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bobs_scene_collection_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSetup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.scenes && Array.isArray(data.scenes)) {
          setScenes(data.scenes);
          if (data.activeSceneId) {
            setActiveSceneId(data.activeSceneId);
            compositor.setActiveScene(data.activeSceneId);
          }
          if (data.streamConfig) {
            setStreamConfig(data.streamConfig);
            compositor.updateResolution(data.streamConfig.resolution.width, data.streamConfig.resolution.height);
          }
          alert('Scene collection imported successfully!');
        } else {
          alert('Invalid scene collection file format.');
        }
      } catch (err) {
        alert('Failed to parse scene collection JSON.');
      }
    };
    reader.readAsText(file);
  };
  const handleUpdateSourceSettings = (sourceId: string, settings: any) => {
    const updated = scenes.map((scene) => {
      if (scene.id === activeSceneId) {
        return {
          ...scene,
          sources: scene.sources.map((src) => {
            if (src.id === sourceId) {
              return { ...src, settings };
            }
            return src;
          })
        };
      }
      return scene;
    });
    setScenes(updated);
  };

  // --- Scene management helpers ---
  const handleAddScene = () => {
    const newId = `scene-${Date.now()}`;
    const newScene: Scene = {
      id: newId,
      name: `Scene ${scenes.length + 1}`,
      sources: []
    };
    setScenes([...scenes, newScene]);
    setActiveSceneId(newId);
    compositor.setActiveScene(newId);
  };

  const handleRemoveScene = () => {
    if (scenes.length <= 1) return;
    const remaining = scenes.filter(s => s.id !== activeSceneId);
    setScenes(remaining);
    const nextActive = remaining[0].id;
    setActiveSceneId(nextActive);
    compositor.setActiveScene(nextActive);
  };

  const handleRenameScene = (sceneId: string, newName: string) => {
    if (!newName.trim()) return;
    setScenes(scenes.map(s => s.id === sceneId ? { ...s, name: newName.trim() } : s));
    setRenamingSceneId(null);
  };

  // --- Source reorder helpers ---
  const moveSourceUp = (sourceId: string) => {
    setScenes(currentScenes => currentScenes.map(scene => {
      if (scene.id !== activeSceneId) return scene;
      const sources = [...scene.sources];
      const idx = sources.findIndex(s => s.id === sourceId);
      if (idx < 0) return scene;
      // Swap zIndex with the source above (higher zIndex)
      const sorted = sources.slice().sort((a, b) => b.zIndex - a.zIndex);
      const sortIdx = sorted.findIndex(s => s.id === sourceId);
      if (sortIdx <= 0) return scene; // already at top
      const above = sorted[sortIdx - 1];
      const curZ = sorted[sortIdx].zIndex;
      const aboveZ = above.zIndex;
      return {
        ...scene,
        sources: sources.map(s => {
          if (s.id === sourceId) return { ...s, zIndex: aboveZ };
          if (s.id === above.id) return { ...s, zIndex: curZ };
          return s;
        })
      };
    }));
  };

  const moveSourceDown = (sourceId: string) => {
    setScenes(currentScenes => currentScenes.map(scene => {
      if (scene.id !== activeSceneId) return scene;
      const sources = [...scene.sources];
      const sorted = sources.slice().sort((a, b) => b.zIndex - a.zIndex);
      const sortIdx = sorted.findIndex(s => s.id === sourceId);
      if (sortIdx < 0 || sortIdx >= sorted.length - 1) return scene; // already at bottom
      const below = sorted[sortIdx + 1];
      const curZ = sorted[sortIdx].zIndex;
      const belowZ = below.zIndex;
      return {
        ...scene,
        sources: sources.map(s => {
          if (s.id === sourceId) return { ...s, zIndex: belowZ };
          if (s.id === below.id) return { ...s, zIndex: curZ };
          return s;
        })
      };
    }));
  };

  // Source type icon helper
  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'screen': return <Tv size={13} color="#8B5CF6" />;
      case 'window': return <Monitor size={13} color="#38BDF8" />;
      case 'game': return <Gamepad2 size={13} color="#F97316" />;
      case 'camera': return <Camera size={13} color="#10B981" />;
      case 'image': return <ImageIcon size={13} color="#38BDF8" />;
      case 'text': return <Type size={13} color="#F472B6" />;
      case 'color': return <Palette size={13} color="#F59E0B" />;
      case 'video': return <VideoIcon size={13} color="#EC4899" />;
      default: return <Layers size={13} />;
    }
  };

  const dBFromLevel = (level: number): string => {
    if (level <= 0) return '-∞';
    const db = 20 * Math.log10(level / 100);
    return db > 0 ? `+${db.toFixed(0)}` : db.toFixed(0);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      background: '#0C1021',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#E2E8F0'
    }}>
      {/* ═══════════ HEADER BAR ═══════════ */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        background: 'linear-gradient(180deg, #0F1524 0%, #0B0F1A 100%)',
        borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
        zIndex: 10,
        flexShrink: 0,
        gap: '12px'
      }}>
        {/* Left: Logo & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <img
            src="/0logov3.png"
            alt="BOBS Logo"
            className="header-logo"
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: '1.05rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #FFFFFF 0%, #A5B4FC 50%, #6366F1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
              lineHeight: 1.2
            }}>BOBS Studio</span>
            <span style={{ fontSize: '0.58rem', color: '#475569', fontWeight: 600, letterSpacing: '0.3px' }}>
              Bun Open Broadcasting Software
            </span>
          </div>
        </div>

        {/* Center: Stat Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          {/* STATUS */}
          <div className="stat-pill">
            <span className={`conn-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
            <span className="stat-label">STATUS</span>
            <span className="stat-value" style={{ color: wsConnected ? '#10B981' : '#F59E0B' }}>
              {wsConnected ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* LIVE */}
          <div className="stat-pill" style={serverStatus.isStreaming ? { borderColor: 'rgba(239, 68, 68, 0.4)' } : {}}>
            {serverStatus.isStreaming && <span className="live-dot" />}
            <span className="stat-label">LIVE</span>
            <span className="stat-value" style={serverStatus.isStreaming ? { color: '#EF4444', textShadow: '0 0 6px rgba(239,68,68,0.4)' } : {}}>
              {serverStatus.isStreaming ? formatClock(streamTime) : '00:00'}
            </span>
          </div>

          {/* REC */}
          <div className="stat-pill" style={serverStatus.isRecording ? { borderColor: 'rgba(16, 185, 129, 0.4)' } : {}}>
            {serverStatus.isRecording && <span className="rec-dot" />}
            <span className="stat-label">REC</span>
            <span className="stat-value" style={serverStatus.isRecording ? { color: '#10B981', textShadow: '0 0 6px rgba(16,185,129,0.4)' } : {}}>
              {serverStatus.isRecording ? formatClock(recordTime) : '00:00'}
            </span>
          </div>

          {/* FPS */}
          <div className="stat-pill">
            <span className="stat-label">FPS</span>
            <span className="stat-value">{serverStatus.fps.toFixed(1)}</span>
          </div>

          {/* CPU */}
          <div className="stat-pill">
            <span className="stat-label">CPU</span>
            <span className="stat-value">{serverStatus.cpuUsage.toFixed(0)}%</span>
          </div>

          {/* VIEWERS */}
          <div className="stat-pill">
            <span className="stat-label">VIEWERS</span>
            <span className="stat-value" style={{ color: serverStatus.viewerCount > 0 ? '#8B5CF6' : undefined }}>
              {serverStatus.viewerCount}
            </span>
          </div>

          {/* VCAM */}
          <div className="stat-pill" style={serverStatus.isVirtualCamActive ? { borderColor: 'rgba(139, 92, 246, 0.4)' } : {}}>
            <span className="stat-label">VCAM</span>
            <span className="stat-value" style={{
              color: serverStatus.isVirtualCamActive ? '#A78BFA' : undefined,
              textShadow: serverStatus.isVirtualCamActive ? '0 0 6px rgba(139,92,246,0.5)' : 'none'
            }}>
              {serverStatus.isVirtualCamActive ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportSetup}
            accept=".json"
            style={{ display: 'none' }}
          />
          <button
            onClick={() => window.open(`http://${window.location.hostname}:3001/view`, '_blank')}
            className="header-btn"
            title="Open Web-NDI Viewer in new tab"
          >
            <Monitor size={13} /> Viewer
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="header-btn"
            title="Import Scene Collection (JSON)"
          >
            <Upload size={13} /> Import
          </button>
          <button
            onClick={handleExportSetup}
            className="header-btn"
            title="Export Scene Collection (JSON)"
          >
            <Download size={13} /> Export
          </button>
          <button
            onClick={() => setStudioMode(!studioMode)}
            className={`header-btn ${studioMode ? 'active' : ''}`}
            title="Toggle Studio Mode (Preview + Program)"
          >
            <Maximize2 size={13} /> Studio
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="header-btn"
            title="Settings"
            style={{ padding: '5px 8px' }}
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* ═══════════ MAIN WORKSPACE ═══════════ */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '8px',
        gap: '8px',
        minHeight: 0,
        overflow: 'hidden'
      }}>
        {/* ───── Canvas Area ───── */}
        <div style={{
          flex: 1,
          display: 'flex',
          gap: studioMode ? '0px' : '0px',
          minHeight: 0,
          background: '#080C16',
          borderRadius: '6px',
          border: '1px solid rgba(51, 65, 85, 0.3)',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            flex: 1,
            gap: studioMode ? '0px' : '0px',
            padding: '10px',
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Left: Preview Canvas */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px' }}>
              <div style={{
                flex: 1,
                position: 'relative',
                background: '#040610',
                borderRadius: '4px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(51, 65, 85, 0.3)'
              }}>
                <span className="canvas-badge preview">Preview</span>
                <canvas ref={previewCanvasRef} style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block'
                }} />
              </div>
              <div className="canvas-res-info">{width}×{height} • {streamConfig.fps}fps</div>
            </div>

            {/* Center: Transition Controls (Studio Mode only) */}
            {studioMode && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                width: '100px',
                padding: '0 8px',
                flexShrink: 0
              }}>
                <button
                  className="transition-btn"
                  onClick={() => compositor.triggerTransition(transitionType, transitionType === 'cut' ? 0 : transitionDuration)}
                  title="Execute Transition (Ctrl+Alt+T)"
                >
                  <ArrowUpDown size={13} /> Transition
                </button>
                <div style={{ width: '100%', height: '1px', background: 'rgba(51, 65, 85, 0.4)', margin: '2px 0' }} />
                <button
                  className="transition-btn-secondary"
                  onClick={() => compositor.triggerTransition('cut')}
                  title="Cut transition (instant)"
                >
                  Cut
                </button>
                <button
                  className="transition-btn-secondary"
                  onClick={() => compositor.triggerTransition('fade', transitionDuration)}
                  title={`Fade transition (${transitionDuration}ms)`}
                >
                  Fade
                </button>
                <button
                  className="transition-btn-secondary"
                  onClick={() => compositor.triggerTransition('slide', transitionDuration)}
                  title={`Slide transition (${transitionDuration}ms)`}
                >
                  Slide
                </button>
              </div>
            )}

            {/* Right: Program Canvas (Studio Mode only) */}
            {studioMode && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px' }}>
                <div style={{
                  flex: 1,
                  position: 'relative',
                  background: '#040610',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(51, 65, 85, 0.3)'
                }} className={serverStatus.isStreaming ? 'program-canvas-live' : ''}>
                  <span className="canvas-badge program">Program</span>
                  <canvas ref={programCanvasRef} style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block'
                  }} />
                </div>
                <div className="canvas-res-info">{width}×{height} • {streamConfig.fps}fps</div>
              </div>
            )}
          </div>
        </div>

        {/* ───── Bottom Panels (5 columns matching OBS) ───── */}
        <div style={{
          height: '240px',
          display: 'grid',
          gridTemplateColumns: '1fr 1.4fr 1.6fr 0.9fr 1fr',
          gap: '6px',
          flexShrink: 0
        }}>
          {/* ══ Column 1: Scenes ══ */}
          <div className="panel-section">
            <div className="panel-header">
              <span className="panel-title"><Layers size={13} /> Scenes</span>
            </div>
            <div className="panel-body">
              {scenes.map((scene, idx) => (
                <div
                  key={scene.id}
                  className={`scene-item ${scene.id === activeSceneId ? 'active' : ''}`}
                  onClick={() => {
                    setActiveSceneId(scene.id);
                    compositor.setActiveScene(scene.id);
                  }}
                  onDoubleClick={() => {
                    setRenamingSceneId(scene.id);
                    setRenameValue(scene.name);
                  }}
                  title={`Scene ${idx + 1} — Press ${idx + 1} to switch`}
                >
                  {renamingSceneId === scene.id ? (
                    <input
                      className="scene-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameScene(scene.id, renameValue)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameScene(scene.id, renameValue);
                        if (e.key === 'Escape') setRenamingSceneId(null);
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span style={{ fontSize: '0.78rem' }}>{scene.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {scene.id === programSceneId && <span className="live-tag">LIVE</span>}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="panel-toolbar">
              <button className="panel-toolbar-btn" onClick={handleAddScene} title="Add Scene">
                <Plus size={14} />
              </button>
              <button className="panel-toolbar-btn" onClick={handleRemoveScene} title="Remove Scene">
                <Minus size={14} />
              </button>
            </div>
          </div>

          {/* ══ Column 2: Sources ══ */}
          <div className="panel-section">
            <div className="panel-header">
              <span className="panel-title"><Sliders size={13} /> Sources</span>
            </div>
            <div className="panel-body">
              {activeScene?.sources.length === 0 ? (
                <div className="empty-panel">No sources in this scene.</div>
              ) : (
                activeScene?.sources
                  .slice()
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((src) => (
                    <div
                      key={src.id}
                      className={`source-item ${src.id === selectedSourceId ? 'active' : ''}`}
                      onClick={() => compositor.setSelectedSource(src.id)}
                    >
                      <div className="source-info">
                        {getSourceIcon(src.type)}
                        <span>{src.name}</span>
                      </div>
                      <div className="source-actions">
                        {/* Activate capture source */}
                        {isCapturableSource(src) && !isSourceMediaActive(src) && (
                          <button
                            className="src-action-btn"
                            title={`Activate ${getCaptureLabel(src)}`}
                            onClick={async (e) => {
                              e.stopPropagation();
                              await activateSourceMedia(src);
                            }}
                          >
                            <Play size={12} color="#10B981" />
                          </button>
                        )}
                        {/* Visible toggle */}
                        <button
                          className="src-action-btn"
                          title={src.visible ? 'Hide source' : 'Show source'}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateSource(src.id, { visible: !src.visible });
                          }}
                        >
                          {src.visible ? <Eye size={12} /> : <EyeOff size={12} color="#EF4444" />}
                        </button>
                        {/* Audio Mute toggle */}
                        {(src.type === 'camera' || src.type === 'screen' || src.type === 'window' || src.type === 'game' || src.type === 'video') && (
                          <button
                            className="src-action-btn"
                            title={src.muted ? 'Unmute audio' : 'Mute audio'}
                            onClick={(e) => {
                              e.stopPropagation();
                              const muted = !src.muted;
                              updateSource(src.id, { muted });
                              audioMixer.setMute(src.id, muted);
                            }}
                          >
                            {src.muted ? <VolumeX size={12} color="#EF4444" /> : <Volume2 size={12} />}
                          </button>
                        )}
                        {/* Filters */}
                        <button
                          className="src-action-btn"
                          title="Filters (Chroma Key, Gates, Compression)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilterSource(src);
                            setIsFiltersOpen(true);
                          }}
                        >
                          <Sliders size={12} color="#A5B4FC" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
            <div className="panel-toolbar">
              <button className="panel-toolbar-btn" onClick={() => setIsAddSourceOpen(true)} title="Add Source (+)">
                <Plus size={14} />
              </button>
              <button
                className="panel-toolbar-btn"
                onClick={() => { if (selectedSourceId) deleteSource(selectedSourceId); }}
                title="Remove Source (-)"
              >
                <Minus size={14} />
              </button>
              <button
                className="panel-toolbar-btn"
                onClick={() => { if (selectedSourceId) moveSourceUp(selectedSourceId); }}
                title="Move Source Up (↑)"
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="panel-toolbar-btn"
                onClick={() => { if (selectedSourceId) moveSourceDown(selectedSourceId); }}
                title="Move Source Down (↓)"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>

          {/* ══ Column 3: Audio Mixer ══ */}
          <div className="panel-section">
            <div className="panel-header">
              <span className="panel-title"><Volume2 size={13} /> Audio Mixer</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'row', gap: '6px', overflowX: 'auto', padding: '6px' }}>
              {activeScene?.sources
                .filter((s) => s.type === 'camera' || s.type === 'screen' || s.type === 'window' || s.type === 'game' || s.type === 'video')
                .map((src) => {
                  const level = audioLevels[src.id] || 0;
                  // Simulate a slight L/R difference for visual realism
                  const levelL = Math.min(100, level + (Math.random() * 4 - 2));
                  const levelR = Math.min(100, level + (Math.random() * 4 - 2));
                  return (
                    <div key={src.id} className="mixer-strip">
                      <span className="mixer-strip-name">{src.name}</span>
                      
                      {/* Dual vertical dB meter bars (L/R) */}
                      <div className="mixer-meters">
                        <div className="mixer-meter-track">
                          <div
                            className="mixer-meter-fill left"
                            style={{ height: `${Math.max(0, levelL)}%` }}
                          />
                        </div>
                        <div className="mixer-meter-track">
                          <div
                            className="mixer-meter-fill right"
                            style={{ height: `${Math.max(0, levelR)}%` }}
                          />
                        </div>
                      </div>

                      {/* dB readout */}
                      <span className="mixer-db-label">{dBFromLevel(level)} dB</span>

                      {/* Horizontal volume fader */}
                      <div className="mixer-fader">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={src.volume}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateSource(src.id, { volume: val });
                            audioMixer.setVolume(src.id, val);
                          }}
                          title={`Volume: ${Math.round(src.volume * 100)}%`}
                        />
                      </div>

                      {/* Mute button */}
                      <button
                        className={`mixer-mute-btn ${src.muted ? 'muted' : ''}`}
                        onClick={() => {
                          const muted = !src.muted;
                          updateSource(src.id, { muted });
                          audioMixer.setMute(src.id, muted);
                        }}
                        title={src.muted ? 'Unmute' : 'Mute'}
                      >
                        {src.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      </button>
                    </div>
                  );
                })}
              {activeScene?.sources.filter((s) => s.type === 'camera' || s.type === 'screen' || s.type === 'window' || s.type === 'game' || s.type === 'video').length === 0 && (
                <div className="empty-panel" style={{ flex: 1 }}>No audio inputs active.</div>
              )}
            </div>
          </div>

          {/* ══ Column 4: Scene Transitions ══ */}
          <div className="panel-section">
            <div className="panel-header">
              <span className="panel-title"><ArrowUpDown size={13} /> Transitions</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px' }}>
              {/* Transition type selector */}
              <label style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.5px' }}>TYPE</label>
              <select
                className="transition-select"
                value={transitionType}
                onChange={(e) => setTransitionType(e.target.value as 'cut' | 'fade' | 'slide')}
              >
                <option value="cut">Cut</option>
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
              </select>

              {/* Duration input */}
              <label style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.5px' }}>DURATION (ms)</label>
              <input
                type="number"
                className="transition-duration-input"
                value={transitionDuration}
                min={0}
                max={5000}
                step={50}
                onChange={(e) => setTransitionDuration(Number(e.target.value))}
              />

              {/* Transition execute button */}
              <button
                className="transition-btn"
                onClick={() => compositor.triggerTransition(transitionType, transitionType === 'cut' ? 0 : transitionDuration)}
                title="Execute Transition (Ctrl+Alt+T)"
                style={{ marginTop: '4px' }}
              >
                <ArrowUpDown size={13} /> Transition
              </button>
            </div>
          </div>

          {/* ══ Column 5: Controls ══ */}
          <div className="panel-section" style={{ borderColor: 'rgba(99, 102, 241, 0.2)' }}>
            <div className="panel-header">
              <span className="panel-title" style={{ color: '#A5B4FC' }}><Radio size={13} /> Controls</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '8px', justifyContent: 'center' }}>
              {/* Streaming */}
              {serverStatus.isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className={`ctrl-btn streaming-active`}
                  title="Stop Streaming (Ctrl+Alt+S)"
                >
                  <Square size={14} /> Stop Streaming
                </button>
              ) : (
                <button
                  onClick={startStreaming}
                  className="ctrl-btn primary-action"
                  title="Start Streaming (Ctrl+Alt+S)"
                >
                  <Play size={14} /> Start Streaming
                </button>
              )}

              {/* Recording */}
              {serverStatus.isRecording ? (
                <button
                  onClick={stopRecording}
                  className={`ctrl-btn recording-active`}
                  title="Stop Recording (Ctrl+Alt+R)"
                >
                  <Square size={14} /> Stop Recording
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="ctrl-btn"
                  title="Start Recording (Ctrl+Alt+R)"
                >
                  <Disc size={14} /> Start Recording
                </button>
              )}

              {/* Virtual Camera */}
              {serverStatus.isVirtualCamActive ? (
                <button
                  onClick={stopVirtualCam}
                  className="ctrl-btn vcam-active"
                  title="Stop Virtual Camera"
                >
                  <Square size={14} /> Stop Virtual Cam
                </button>
              ) : (
                <button
                  onClick={startVirtualCam}
                  className="ctrl-btn"
                  title="Start Virtual Camera"
                >
                  <ScreenShare size={14} /> Start Virtual Cam
                </button>
              )}

              {/* Studio Mode */}
              <button
                onClick={() => setStudioMode(!studioMode)}
                className={`ctrl-btn ${studioMode ? 'studio-active' : ''}`}
                title="Toggle Studio Mode"
              >
                <Maximize2 size={14} /> Studio Mode
              </button>

              {/* Settings */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="ctrl-btn"
                title="Open Settings"
              >
                <Settings size={14} /> Settings
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ═══════════ BOTTOM STATUS BAR ═══════════ */}
      <div className="status-bar">
        <div className="status-bar-left">
          <div className="status-bar-item">
            <span className={`conn-dot ${wsConnected ? 'connected' : 'disconnected'}`} style={{ width: 6, height: 6 }} />
            <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          {serverStatus.isStreaming && (
            <div className="status-bar-item" style={{ color: '#EF4444' }}>
              <span className="live-dot" style={{ width: 5, height: 5 }} />
              <span>LIVE</span>
              <span className="mono" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatClock(streamTime)}</span>
            </div>
          )}
          {serverStatus.isRecording && (
            <div className="status-bar-item" style={{ color: '#10B981' }}>
              <span className="rec-dot" style={{ width: 5, height: 5 }} />
              <span>REC</span>
              <span className="mono" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatClock(recordTime)}</span>
            </div>
          )}
          {serverStatus.isBroadcasting && (
            <div className="status-bar-item" style={{ color: '#8B5CF6' }}>
              <Wifi size={10} /> BROADCAST
            </div>
          )}
        </div>
        <div className="status-bar-right">
          <div className="status-bar-item">
            <span>CPU:</span>
            <span className="mono" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{serverStatus.cpuUsage.toFixed(1)}%</span>
          </div>
          <div className="status-bar-item">
            <span>FPS:</span>
            <span className="mono" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{serverStatus.fps.toFixed(2)}</span>
          </div>
          <div className="status-bar-item" style={{
            background: 'rgba(51, 65, 85, 0.3)',
            padding: '1px 6px',
            borderRadius: '3px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem'
          }}>
            {width}×{height}
          </div>
        </div>
      </div>

      {/* ═══════════ MODALS ═══════════ */}
      <AddSourceModal
        isOpen={isAddSourceOpen}
        onClose={() => setIsAddSourceOpen(false)}
        onAddSource={handleAddSource}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        streamConfig={streamConfig}
        onSaveStreamConfig={(newConfig) => {
          setStreamConfig(newConfig);
          compositor.updateResolution(newConfig.resolution.width, newConfig.resolution.height);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'configure-stream', payload: newConfig }));
          }
        }}
      />
      <FiltersModal
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        source={filterSource}
        onUpdateSourceSettings={handleUpdateSourceSettings}
      />
    </div>
  );
};

export default App;
