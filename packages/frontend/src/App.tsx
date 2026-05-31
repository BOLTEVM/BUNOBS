import React, { useEffect, useRef, useState } from 'react';
import {
  Tv, Camera, Image as ImageIcon, Type, Palette, Video as VideoIcon,
  Play, Square, Volume2, VolumeX, Eye, EyeOff, Plus, Trash2,
  Layers, Sliders, Settings, Radio, Info, Maximize2, Monitor, Gamepad2, Download, Upload
} from 'lucide-react';
import type { Scene, Source, ServerStatus, StreamConfig, SourceType } from 'shared';
import { compositor } from './utils/Compositor';
import { audioMixer } from './utils/AudioMix';
import { analyzeCaptureCompatibility, createCaptureSettings, getCaptureProfile, isCaptureSource } from './utils/CaptureIntelligence';
import { AddSourceModal } from './components/AddSourceModal';
import { SettingsModal } from './components/SettingsModal';


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

  // Status and Server States
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    isStreaming: false,
    isRecording: false,
    cpuUsage: 1,
    fps: 30,
    activeClients: 0,
    recordings: []
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

  return (
    <div style={appContainerStyle}>
      {/* Top Header Bar */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src="/0logov3.png"
            alt="BOBS Logo"
            style={{ height: '32px', filter: 'drop-shadow(0 0 6px rgba(95, 93, 236, 0.4))' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={logoTextStyle}>BOBS Studio</span>
            <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>Bun Open Broadcasting Software</span>
          </div>
        </div>

        {/* Live System stats tickers */}
        <div style={statsGridStyle}>
          <div style={statBoxStyle}>
            <span style={statLabelStyle}>STATUS</span>
            <span style={{ ...statValueStyle, color: wsConnected ? '#10B981' : '#F59E0B' }}>
              {wsConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          <div style={statBoxStyle}>
            <span style={statLabelStyle}>LIVE</span>
            <span style={serverStatus.isStreaming ? badgeLiveStyle : statValueStyle}>
              {serverStatus.isStreaming ? formatClock(streamTime) : '00:00:00'}
            </span>
          </div>

          <div style={statBoxStyle}>
            <span style={statLabelStyle}>REC</span>
            <span style={serverStatus.isRecording ? badgeRecStyle : statValueStyle}>
              {serverStatus.isRecording ? formatClock(recordTime) : '00:00:00'}
            </span>
          </div>

          <div style={statBoxStyle}>
            <span style={statLabelStyle}>FPS</span>
            <span style={statValueStyle}>{serverStatus.fps.toFixed(2)}</span>
          </div>

          <div style={statBoxStyle}>
            <span style={statLabelStyle}>CPU</span>
            <span style={statValueStyle}>{serverStatus.cpuUsage.toFixed(1)}%</span>
          </div>
        </div>

        {/* Header Controls */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportSetup}
            accept=".json"
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary"
            style={{ padding: '8px 12px', fontSize: '0.8rem' }}
            title="Import Scene Collection"
          >
            <Upload size={14} /> Import Setup
          </button>
          <button
            onClick={handleExportSetup}
            className="btn-secondary"
            style={{ padding: '8px 12px', fontSize: '0.8rem' }}
            title="Export Scene Collection"
          >
            <Download size={14} /> Export Setup
          </button>
          <button
            onClick={() => setStudioMode(!studioMode)}
            style={studioMode ? activeStudioBtnStyle : studioBtnStyle}
          >
            <Maximize2 size={15} /> Studio Mode
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="btn-secondary" style={{ padding: '8px' }}>
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Main Studio Body Workspace */}
      <main style={mainWorkspaceStyle}>
        {/* Canvases View Panel */}
        <div className="glass-panel" style={canvasContainerStyle}>
          {/* Double Canvas View (Studio Mode) */}
          <div style={{ display: 'flex', flex: 1, gap: '20px', padding: '16px', position: 'relative' }}>
            {/* Left Preview Side */}
            <div style={canvasBoxStyle}>
              <div style={canvasHeaderLabelStyle}>
                <span>PREVIEW</span>
                <span style={{ color: '#6366F1', fontSize: '0.75rem' }}>Active Scene Editor</span>
              </div>
              <div style={canvasWrapperStyle}>
                <canvas ref={previewCanvasRef} style={canvasElStyle} />
              </div>
            </div>

            {/* In-Between Transition Controls (Only visible in Studio mode) */}
            {studioMode && (
              <div style={transitionControlsStyle}>
                <button
                  onClick={() => compositor.triggerTransition('cut')}
                  className="btn-secondary"
                  style={transBtnStyle}
                >
                  Cut
                </button>
                <button
                  onClick={() => compositor.triggerTransition('fade', 400)}
                  className="btn-primary"
                  style={transBtnStyle}
                >
                  Fade (400ms)
                </button>
                <button
                  onClick={() => compositor.triggerTransition('slide', 600)}
                  className="btn-secondary"
                  style={transBtnStyle}
                >
                  Slide (600ms)
                </button>
              </div>
            )}

            {/* Right Program Side */}
            {studioMode && (
              <div style={canvasBoxStyle}>
                <div style={canvasHeaderLabelStyle}>
                  <span>PROGRAM</span>
                  <span style={{ color: '#EF4444', fontSize: '0.75rem' }}>Broadcast live feed</span>
                </div>
                <div style={canvasWrapperStyle}>
                  <canvas ref={programCanvasRef} style={{ ...canvasElStyle, border: '1px solid #EF4444' }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lower Control Decks Panel */}
        <div style={bottomDecksGridStyle}>
          {/* Deck 1: Scenes */}
          <div className="glass-panel" style={deckStyle}>
            <div style={deckHeaderStyle}>
              <span style={deckTitleStyle}><Layers size={14} /> Scenes</span>
            </div>
            <div style={deckBodyStyle}>
              {scenes.map((scene) => (
                <div
                  key={scene.id}
                  className={`list-item ${scene.id === activeSceneId ? 'active' : ''}`}
                  onClick={() => {
                    setActiveSceneId(scene.id);
                    compositor.setActiveScene(scene.id);
                  }}
                >
                  <span className="list-item-title">{scene.name}</span>
                  {scene.id === programSceneId && <span style={badgeLiveMiniStyle}>LIVE</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Deck 2: Sources */}
          <div className="glass-panel" style={deckStyle}>
            <div style={deckHeaderStyle}>
              <span style={deckTitleStyle}><Sliders size={14} /> Sources: {activeScene?.name}</span>
              <button onClick={() => setIsAddSourceOpen(true)} className="btn-primary" style={addSourceBtnStyle}>
                <Plus size={14} /> Add
              </button>
            </div>
            <div style={deckBodyStyle}>
              {activeScene?.sources.length === 0 ? (
                <div style={emptyDeckStyle}>No sources in this scene.</div>
              ) : (
                activeScene?.sources
                  .slice()
                  .sort((a, b) => b.zIndex - a.zIndex) // Display list front-to-back (topmost layer on top)
                  .map((src) => (
                    <div
                      key={src.id}
                      className={`list-item ${src.id === selectedSourceId ? 'active' : ''}`}
                      onClick={() => compositor.setSelectedSource(src.id)}
                    >
                      <div className="list-item-title">
                        {src.type === 'screen' && <Tv size={14} color="#8B5CF6" />}
                        {src.type === 'window' && <Monitor size={14} color="#38BDF8" />}
                        {src.type === 'game' && <Gamepad2 size={14} color="#F97316" />}
                        {src.type === 'camera' && <Camera size={14} color="#10B981" />}
                        {src.type === 'image' && <ImageIcon size={14} color="#38BDF8" />}
                        {src.type === 'text' && <Type size={14} color="#F472B6" />}
                        {src.type === 'color' && <Palette size={14} color="#F59E0B" />}
                        {src.type === 'video' && <VideoIcon size={14} color="#EC4899" />}
                        <span>{src.name}</span>
                      </div>

                      <div className="list-item-actions">
                        {/* Activate capture source */}
                        {isCapturableSource(src) && !isSourceMediaActive(src) && (
                          <button
                            className="list-action-btn"
                            title={`Activate ${getCaptureLabel(src)}`}
                            onClick={async (e) => {
                              e.stopPropagation();
                              await activateSourceMedia(src);
                            }}
                          >
                            <Play size={13} color="#10B981" />
                          </button>
                        )}
                        {/* Visible toggle */}
                        <button
                          className="list-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateSource(src.id, { visible: !src.visible });
                          }}
                        >
                          {src.visible ? <Eye size={13} /> : <EyeOff size={13} color="#EF4444" />}
                        </button>
                        {/* Audio Mute toggle */}
                        {(src.type === 'camera' || src.type === 'screen' || src.type === 'window' || src.type === 'game' || src.type === 'video') && (
                          <button
                            className="list-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const muted = !src.muted;
                              updateSource(src.id, { muted });
                              audioMixer.setMute(src.id, muted);
                            }}
                          >
                            {src.muted ? <VolumeX size={13} color="#EF4444" /> : <Volume2 size={13} />}
                          </button>
                        )}
                        {/* Delete source */}
                        <button
                          className="list-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSource(src.id);
                          }}
                        >
                          <Trash2 size={13} color="#EF4444" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Deck 3: Audio Mixer */}
          <div className="glass-panel" style={deckStyle}>
            <div style={deckHeaderStyle}>
              <span style={deckTitleStyle}><Volume2 size={14} /> Audio Mixer</span>
            </div>
            <div style={{ ...deckBodyStyle, display: 'flex', gap: '20px', overflowX: 'auto', flexDirection: 'row' }}>
              {activeScene?.sources
                .filter((s) => s.type === 'camera' || s.type === 'screen' || s.type === 'window' || s.type === 'game' || s.type === 'video')
                .map((src) => {
                  const level = audioLevels[src.id] || 0;
                  return (
                    <div key={src.id} style={mixerStripStyle}>
                      <span style={mixerStripLabelStyle}>{src.name}</span>
                      
                      {/* Vertical decibel bar */}
                      <div className="db-meter-track" style={{ width: '12px', height: '100px' }}>
                        <div
                          className="db-meter-fill"
                          style={{ height: `${level}%` }}
                        />
                      </div>

                      {/* Slider and mute btn */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          className="volume-slider"
                          value={src.volume}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateSource(src.id, { volume: val });
                            audioMixer.setVolume(src.id, val);
                          }}
                          style={{ transform: 'rotate(-90deg)', width: '60px', height: '10px', margin: '20px 0' }}
                        />
                        <button
                          onClick={() => {
                            const muted = !src.muted;
                            updateSource(src.id, { muted });
                            audioMixer.setMute(src.id, muted);
                          }}
                          style={src.muted ? mixerMutedBtnStyle : mixerAudioBtnStyle}
                        >
                          {src.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              {activeScene?.sources.filter((s) => s.type === 'camera' || s.type === 'screen' || s.type === 'window' || s.type === 'game' || s.type === 'video').length === 0 && (
                <div style={emptyDeckStyle}>No audio inputs active.</div>
              )}
            </div>
          </div>

          {/* Deck 4: Controls */}
          <div className="glass-panel" style={{ ...deckStyle, background: '#121726', borderColor: 'rgba(95, 93, 236, 0.2)' }}>
            <div style={deckHeaderStyle}>
              <span style={{ ...deckTitleStyle, color: '#A5B4FC' }}><Radio size={14} /> Control Board</span>
            </div>
            <div style={{ ...deckBodyStyle, justifyContent: 'center', gap: '12px' }}>
              {/* Streaming */}
              {serverStatus.isStreaming ? (
                <button onClick={stopStreaming} className="btn-danger" style={ctrlBtnStyle}>
                  <Square size={16} /> Stop Streaming
                </button>
              ) : (
                <button onClick={startStreaming} className="btn-primary" style={ctrlBtnStyle}>
                  <Play size={16} /> Start Streaming
                </button>
              )}

              {/* Recording */}
              {serverStatus.isRecording ? (
                <button onClick={stopRecording} className="btn-danger" style={ctrlBtnStyle}>
                  <Square size={16} /> Stop Recording
                </button>
              ) : (
                <button onClick={startRecording} className="btn-secondary" style={ctrlBtnStyle}>
                  <Play size={16} /> Start Recording
                </button>
              )}

              <div style={recordingStatusTipStyle}>
                <Info size={12} />
                <span>FFmpeg backend pipeline ready.</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
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
    </div>
  );
};

// Styling definitions
const appContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  overflow: 'hidden'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 24px',
  background: 'var(--bg-panel)',
  borderBottom: '1px solid var(--border-color)',
  zIndex: 10
};

const logoTextStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 800,
  background: 'linear-gradient(135deg, #FFF, #C7D2FE)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  letterSpacing: '-0.5px'
};

const statsGridStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '24px'
};

const statBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2px'
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.5px'
};

const statValueStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-primary)'
};

const badgeLiveStyle: React.CSSProperties = {
  ...statValueStyle,
  color: 'var(--danger)',
  textShadow: '0 0 8px rgba(239, 68, 68, 0.4)'
};

const badgeRecStyle: React.CSSProperties = {
  ...statValueStyle,
  color: 'var(--success)',
  textShadow: '0 0 8px rgba(16, 185, 129, 0.4)'
};

const studioBtnStyle: React.CSSProperties = {
  background: '#1E293B',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  fontSize: '0.8rem',
  padding: '6px 12px'
};

const activeStudioBtnStyle: React.CSSProperties = {
  ...studioBtnStyle,
  background: 'rgba(95, 93, 236, 0.12)',
  borderColor: 'var(--accent)',
  color: '#A5B4FC'
};

const mainWorkspaceStyle: React.CSSProperties = {
  flex: 1,
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  minHeight: 0
};

const canvasContainerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  background: 'rgba(14, 18, 30, 0.6)'
};

const canvasBoxStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minWidth: 0
};

const canvasHeaderLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  padding: '0 4px'
};

const canvasWrapperStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  background: '#04060A',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const canvasElStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block'
};

const transitionControlsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  width: '110px'
};

const transBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 4px',
  fontSize: '0.75rem',
  whiteSpace: 'nowrap'
};

const bottomDecksGridStyle: React.CSSProperties = {
  height: '220px',
  display: 'grid',
  gridTemplateColumns: '1.2fr 1.6fr 1.6fr 1.4fr',
  gap: '16px'
};

const deckStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0
};

const deckHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  background: 'var(--bg-panel-header)',
  borderBottom: '1px solid var(--border-color)'
};

const deckTitleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
};

const deckBodyStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column'
};

const emptyDeckStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--text-muted)',
  fontSize: '0.8rem'
};

const addSourceBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '0.75rem',
  borderRadius: '4px'
};

const badgeLiveMiniStyle: React.CSSProperties = {
  background: 'rgba(239, 68, 68, 0.15)',
  color: 'var(--danger)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  padding: '2px 6px',
  borderRadius: '4px',
  fontSize: '0.62rem',
  fontWeight: 700
};

const mixerStripStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  background: 'rgba(20, 26, 41, 0.2)',
  padding: '8px',
  borderRadius: '6px',
  width: '76px',
  border: '1px solid var(--border-color)',
  flexShrink: 0
};

const mixerStripLabelStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  color: 'var(--text-secondary)',
  fontWeight: 600,
  textAlign: 'center',
  width: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const mixerAudioBtnStyle: React.CSSProperties = {
  background: '#1E293B',
  border: '1px solid var(--border-color)',
  padding: '4px 6px',
  borderRadius: '4px',
  color: '#FFF'
};

const mixerMutedBtnStyle: React.CSSProperties = {
  ...mixerAudioBtnStyle,
  background: 'rgba(239, 68, 68, 0.15)',
  borderColor: 'rgba(239, 68, 68, 0.3)',
  color: 'var(--danger)'
};

const ctrlBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px'
};

const recordingStatusTipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontSize: '0.72rem',
  color: 'var(--text-muted)',
  marginTop: '6px'
};
export default App;
