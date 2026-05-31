import React, { useState, useEffect } from 'react';
import { X, Sliders, Volume2, Video, Sparkles } from 'lucide-react';
import type { Source } from 'shared';
import { audioMixer } from '../utils/AudioMix';

interface FiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: Source | null;
  onUpdateSourceSettings: (sourceId: string, settings: any) => void;
}

export const FiltersModal: React.FC<FiltersModalProps> = ({
  isOpen,
  onClose,
  source,
  onUpdateSourceSettings
}) => {
  if (!isOpen || !source) return null;

  // Video Chroma Key filter states
  const [chromaKeyEnabled, setChromaKeyEnabled] = useState(source.settings.chromaKeyEnabled ?? false);
  const [chromaKeyColor, setChromaKeyColor] = useState(source.settings.chromaKeyColor ?? '#00ff00');
  const [chromaKeySimilarity, setChromaKeySimilarity] = useState(source.settings.chromaKeySimilarity ?? 0.4);
  const [chromaKeySmoothness, setChromaKeySmoothness] = useState(source.settings.chromaKeySmoothness ?? 0.1);

  // Audio filter states
  const [gateEnabled, setGateEnabled] = useState(audioMixer.getGateEnabled(source.id));
  const [compressorEnabled, setCompressorEnabled] = useState(audioMixer.getCompressorEnabled(source.id));

  // Sync state when source changes
  useEffect(() => {
    setChromaKeyEnabled(source.settings.chromaKeyEnabled ?? false);
    setChromaKeyColor(source.settings.chromaKeyColor ?? '#00ff00');
    setChromaKeySimilarity(source.settings.chromaKeySimilarity ?? 0.4);
    setChromaKeySmoothness(source.settings.chromaKeySmoothness ?? 0.1);
    
    setGateEnabled(audioMixer.getGateEnabled(source.id));
    setCompressorEnabled(audioMixer.getCompressorEnabled(source.id));
  }, [source]);

  const handleSave = () => {
    // 1. Update source settings in compositor / React state
    const updatedSettings = {
      ...source.settings,
      chromaKeyEnabled,
      chromaKeyColor,
      chromaKeySimilarity,
      chromaKeySmoothness
    };
    onUpdateSourceSettings(source.id, updatedSettings);

    // 2. Update real-time audio mixers DSP settings
    audioMixer.setGateEnabled(source.id, gateEnabled);
    audioMixer.setCompressorEnabled(source.id, compressorEnabled);

    onClose();
  };

  const isVideoSource = ['camera', 'screen', 'window', 'game', 'video', 'image'].includes(source.type);
  const isAudioSource = ['camera', 'screen', 'video'].includes(source.type);

  return (
    <div style={modalOverlayStyle}>
      <div className="glass-panel" style={modalContainerStyle}>
        {/* Header */}
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="#5F5DEC" />
            <h3 style={{ margin: 0, fontWeight: 600 }}>Filters for {source.name}</h3>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={modalBodyStyle}>
          {/* Video Filters Column */}
          {isVideoSource && (
            <div style={columnStyle}>
              <h4 style={columnTitleStyle}><Video size={16} color="#A5B4FC" /> Video Filters</h4>
              <p style={columnSubStyle}>Configure color keying transparency rules.</p>
              
              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={chromaKeyEnabled}
                  onChange={(e) => setChromaKeyEnabled(e.target.checked)}
                />
                Enable Chroma Key (Green Screen)
              </label>

              {chromaKeyEnabled && (
                <div style={filterFormGroupStyle}>
                  <div style={formRowStyle}>
                    <label style={labelStyle}>Key Color</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={chromaKeyColor}
                        onChange={(e) => setChromaKeyColor(e.target.value)}
                        style={{ width: '40px', height: '30px', padding: '2px', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={chromaKeyColor}
                        onChange={(e) => setChromaKeyColor(e.target.value)}
                        style={{ width: '80px', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>

                  <div style={formRowStyle}>
                    <label style={labelStyle}>Similarity ({chromaKeySimilarity.toFixed(2)})</label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.95"
                      step="0.05"
                      value={chromaKeySimilarity}
                      onChange={(e) => setChromaKeySimilarity(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={formRowStyle}>
                    <label style={labelStyle}>Smoothness ({chromaKeySmoothness.toFixed(2)})</label>
                    <input
                      type="range"
                      min="0.02"
                      max="0.5"
                      step="0.02"
                      value={chromaKeySmoothness}
                      onChange={(e) => setChromaKeySmoothness(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  
                  <div style={tipBoxStyle}>
                    <Sparkles size={12} />
                    <span>Feather edges smoothly to eliminate pixelated color borders.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Vertical Separator */}
          {isVideoSource && isAudioSource && <div style={dividerStyle} />}

          {/* Audio Filters Column */}
          {isAudioSource && (
            <div style={columnStyle}>
              <h4 style={columnTitleStyle}><Volume2 size={16} color="#10B981" /> Audio Filters</h4>
              <p style={columnSubStyle}>Chained DSP algorithms for studio-quality input.</p>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={gateEnabled}
                  onChange={(e) => setGateEnabled(e.target.checked)}
                />
                Enable Noise Gate
              </label>
              <p style={descStyle}>Mutes microphone background hum when you are not speaking (threshold approx. -36dB).</p>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={compressorEnabled}
                  onChange={(e) => setCompressorEnabled(e.target.checked)}
                />
                Enable Vocal Compressor
              </label>
              <p style={descStyle}>Automatically limits peak yells and boosts quiet speech for balanced broadcasting output.</p>
            </div>
          )}

          {!isVideoSource && !isAudioSource && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
              No DSP filters available for this source type.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={modalFooterStyle}>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary">
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

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
  width: '580px',
  height: '380px',
  display: 'flex',
  flexDirection: 'column',
  background: '#0D111A'
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
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
  padding: '20px',
  gap: '20px',
  minHeight: 0,
  background: '#0D111A'
};

const columnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  overflowY: 'auto'
};

const columnTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.95rem',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
};

const columnSubStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.75rem',
  color: '#94A3B8',
  marginTop: '-6px'
};

const filterFormGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  background: 'rgba(20, 26, 41, 0.3)',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #1F2A3F'
};

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 500,
  color: '#94A3B8'
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: '#F8FAFC',
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer'
};

const descStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.72rem',
  color: '#64748B',
  marginTop: '-6px',
  lineHeight: 1.3
};

const dividerStyle: React.CSSProperties = {
  width: '1px',
  background: '#1F2A3F',
  alignSelf: 'stretch'
};

const tipBoxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.7rem',
  color: '#A5B4FC',
  background: 'rgba(95, 93, 236, 0.08)',
  border: '1px solid rgba(95, 93, 236, 0.15)',
  padding: '6px 8px',
  borderRadius: '4px',
  marginTop: '4px'
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '12px',
  padding: '12px 20px',
  borderTop: '1px solid #1F2A3F',
  background: '#0A0D15'
};
