import React, { useEffect, useState } from 'react';
import { X, Download, Film, HardDrive, RefreshCw } from 'lucide-react';
import type { StreamConfig, RecordingInfo } from 'shared';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  streamConfig: StreamConfig;
  onSaveStreamConfig: (config: StreamConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  streamConfig,
  onSaveStreamConfig
}) => {
  const [activeTab, setActiveTab] = useState<'stream' | 'video' | 'recordings'>('stream');
  const [rtmpUrl, setRtmpUrl] = useState(streamConfig.rtmpUrl);
  const [streamKey, setStreamKey] = useState(streamConfig.streamKey);
  const [width, setWidth] = useState(streamConfig.resolution.width);
  const [height, setHeight] = useState(streamConfig.resolution.height);
  const [fps, setFps] = useState(streamConfig.fps);
  const [videoBitrate, setVideoBitrate] = useState(streamConfig.videoBitrate);
  const [audioBitrate, setAudioBitrate] = useState(streamConfig.audioBitrate);
  
  const [recordings, setRecordings] = useState<RecordingInfo[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);

  const fetchRecordings = async () => {
    setIsLoadingRecs(true);
    try {
      const res = await fetch('/api/recordings');
      if (res.ok) {
        const data = await res.json();
        setRecordings(data);
      }
    } catch (e) {
      console.error('Failed to load recordings:', e);
    } finally {
      setIsLoadingRecs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecordings();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveStreamConfig({
      rtmpUrl,
      streamKey,
      resolution: { width, height },
      fps,
      videoBitrate,
      audioBitrate
    });
    onClose();
  };

  return (
    <div style={modalOverlayStyle}>
      <div className="glass-panel" style={modalContainerStyle}>
        {/* Modal Header */}
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={20} color="#5F5DEC" />
            <h3 style={{ margin: 0, fontWeight: 600 }}>BOBS Studio Settings</h3>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Content Grid */}
        <div style={modalBodyStyle}>
          {/* Sidebar */}
          <div style={sidebarStyle}>
            <button
              onClick={() => setActiveTab('stream')}
              style={activeTab === 'stream' ? tabActiveStyle : tabStyle}
            >
              Stream Output
            </button>
            <button
              onClick={() => setActiveTab('video')}
              style={activeTab === 'video' ? tabActiveStyle : tabStyle}
            >
              Video Canvas
            </button>
            <button
              onClick={() => setActiveTab('recordings')}
              style={activeTab === 'recordings' ? tabActiveStyle : tabStyle}
            >
              Saved Recordings
            </button>
          </div>

          {/* Main pane */}
          <div style={mainPaneStyle}>
            {activeTab === 'stream' && (
              <div style={paneContentStyle}>
                <h4 style={paneTitleStyle}>Stream Server Configuration</h4>
                <p style={paneSubStyle}>Configure the RTMP streaming server destination (Twitch, YouTube, custom RTMP).</p>
                
                <div style={formGroupStyle}>
                  <label style={labelStyle}>RTMP Ingest URL</label>
                  <input
                    type="text"
                    value={rtmpUrl}
                    onChange={(e) => setRtmpUrl(e.target.value)}
                    placeholder="rtmp://localhost/live"
                    style={{ width: '100%' }}
                  />
                </div>
                
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Stream Key</label>
                  <input
                    type="password"
                    value={streamKey}
                    onChange={(e) => setStreamKey(e.target.value)}
                    placeholder="stream-key-credentials"
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Video Bitrate (kbps)</label>
                    <input
                      type="number"
                      value={videoBitrate}
                      onChange={(e) => setVideoBitrate(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Audio Bitrate (kbps)</label>
                    <input
                      type="number"
                      value={audioBitrate}
                      onChange={(e) => setAudioBitrate(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'video' && (
              <div style={paneContentStyle}>
                <h4 style={paneTitleStyle}>Canvas & Video Settings</h4>
                <p style={paneSubStyle}>Specify base canvas sizes and targeted framerates for composition and encoding.</p>
                
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Base Resolution (Aspect Ratio 16:9)</label>
                  <select
                    value={`${width}x${height}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      setWidth(w);
                      setHeight(h);
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="1920x1080">1920 x 1080 (FHD 1080p)</option>
                    <option value="1280x720">1280 x 720 (HD 720p)</option>
                    <option value="854x480">854 x 480 (SD 480p)</option>
                  </select>
                </div>

                <div style={formGroupStyle}>
                  <label style={labelStyle}>Target FPS</label>
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    style={{ width: '100%' }}
                  >
                    <option value={30}>30 FPS (Standard Live Broadcast)</option>
                    <option value={60}>60 FPS (High Performance Broadcast)</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'recordings' && (
              <div style={paneContentStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Local Server Recordings</h4>
                  <button onClick={fetchRecordings} style={refreshBtnStyle}>
                    <RefreshCw size={14} className={isLoadingRecs ? 'spin' : ''} /> Refresh
                  </button>
                </div>
                <p style={paneSubStyle}>Browse recorded MP4 files saved on your backend's storage.</p>
                
                <div style={recordingsListStyle}>
                  {recordings.length === 0 ? (
                    <div style={emptyRecsStyle}>
                      <Film size={32} color="#64748B" />
                      <p style={{ margin: '8px 0 0 0', color: '#94A3B8' }}>No local recordings found.</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>Start recording on Program to generate files.</p>
                    </div>
                  ) : (
                    recordings.map((rec) => (
                      <div key={rec.name} style={recordingRowStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                          <span style={recNameStyle} title={rec.name}>{rec.name}</span>
                          <span style={recMetaStyle}>
                            {new Date(rec.createdAt).toLocaleString()} | {(rec.sizeBytes / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                        <a
                          href={rec.downloadUrl}
                          download
                          style={recDownloadBtnStyle}
                          className="btn-secondary"
                        >
                          <Download size={14} /> Download
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={modalFooterStyle}>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary">
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

// Styling Object definitions
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(5, 7, 12, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)'
};

const modalContainerStyle: React.CSSProperties = {
  width: '750px',
  height: '520px',
  display: 'flex',
  flexDirection: 'column',
  background: '#0D111A'
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 24px',
  borderBottom: '1px solid #1F2A3F',
  background: '#121724'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94A3B8',
  padding: '4px',
  borderRadius: '4px',
  display: 'flex'
};

const modalBodyStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0
};

const sidebarStyle: React.CSSProperties = {
  width: '180px',
  background: '#0A0D15',
  borderRight: '1px solid #1F2A3F',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const tabStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94A3B8',
  padding: '10px 12px',
  borderRadius: '6px',
  textAlign: 'left',
  width: '100%',
  fontSize: '0.85rem',
  fontWeight: 500,
  justifyContent: 'flex-start'
};

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'rgba(95, 93, 236, 0.12)',
  color: '#A5B4FC',
  border: '1px solid rgba(95, 93, 236, 0.3)'
};

const mainPaneStyle: React.CSSProperties = {
  flex: 1,
  padding: '24px',
  overflowY: 'auto',
  background: '#0D111A'
};

const paneContentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const paneTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
  fontWeight: 600,
  color: '#F8FAFC'
};

const paneSubStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#94A3B8',
  marginTop: '-8px'
};

const formGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 500,
  color: '#94A3B8'
};

const recordingsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxHeight: '260px',
  overflowY: 'auto',
  paddingRight: '6px'
};

const emptyRecsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 0',
  border: '1px dashed #1F2A3F',
  borderRadius: '8px'
};

const recordingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderRadius: '8px',
  background: 'rgba(20, 26, 41, 0.4)',
  border: '1px solid #1F2A3F'
};

const recNameStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 500,
  color: '#F8FAFC',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

const recMetaStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#94A3B8'
};

const recDownloadBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.8rem',
  textDecoration: 'none',
  borderRadius: '6px'
};

const refreshBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #1F2A3F',
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '0.75rem',
  color: '#94A3B8'
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '12px',
  padding: '16px 24px',
  borderTop: '1px solid #1F2A3F',
  background: '#121724'
};
