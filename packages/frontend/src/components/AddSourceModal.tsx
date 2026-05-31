import React, { useEffect, useState } from 'react';
import { X, Tv, Camera, Image, Type, Palette, Video } from 'lucide-react';
import type { SourceType } from 'shared';

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSource: (type: SourceType, name: string, settings: any) => void;
}

export const AddSourceModal: React.FC<AddSourceModalProps> = ({
  isOpen,
  onClose,
  onAddSource
}) => {
  const [type, setType] = useState<SourceType>('screen');
  const [name, setName] = useState('Screen Share');
  
  // Settings based on type
  const [textContent, setTextContent] = useState('BOBS Studio Live');
  const [fontSize, setFontSize] = useState(48);
  const [fontColor, setFontColor] = useState('#ffffff');
  const [colorHex, setColorHex] = useState('#6366F1');
  const [mediaUrl, setMediaUrl] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Set default name on type change
      if (type === 'screen') setName('Screen Capture');
      else if (type === 'camera') setName('Webcam Video');
      else if (type === 'image') setName('Overlay Logo');
      else if (type === 'text') setName('Text Banner');
      else if (type === 'color') setName('Background Color');
      else if (type === 'video') setName('Video Loop');

      // Fetch devices if camera selected
      if (type === 'camera') {
        navigator.mediaDevices.enumerateDevices()
          .then((devs) => {
            const videoDevs = devs.filter(d => d.kind === 'videoinput');
            setDevices(videoDevs);
            if (videoDevs.length > 0) {
              setSelectedDeviceId(videoDevs[0].deviceId);
            }
          })
          .catch(e => console.error('Enumerate devices error:', e));
      }
    }
  }, [type, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let settings: any = {};
    if (type === 'text') {
      settings = { textContent, fontSize, fontColor };
    } else if (type === 'color') {
      settings = { colorHex };
    } else if (type === 'image' || type === 'video') {
      settings = { mediaUrl };
    } else if (type === 'camera') {
      settings = { deviceId: selectedDeviceId };
    }

    onAddSource(type, name, settings);
    onClose();
  };

  const sourceTypes: { value: SourceType; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: 'screen', label: 'Screen Share', icon: <Tv size={18} />, desc: 'Capture any desktop screen, application window, or browser tab' },
    { value: 'camera', label: 'Video Capture (Webcam)', icon: <Camera size={18} />, desc: 'Capture your local camera device feed' },
    { value: 'image', label: 'Image Overlay', icon: <Image size={18} />, desc: 'Overlay PNG/JPG images or transparent graphics' },
    { value: 'text', label: 'Text Source', icon: <Type size={18} />, desc: 'Render text banners, titles, or lower thirds' },
    { value: 'color', label: 'Color Background', icon: <Palette size={18} />, desc: 'Solid color background plane' },
    { value: 'video', label: 'Video File', icon: <Video size={18} />, desc: 'Play local media files or video loops' },
  ];

  return (
    <div style={modalOverlayStyle}>
      <form onSubmit={handleSubmit} className="glass-panel" style={modalContainerStyle}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, fontWeight: 600 }}>Create New Video Source</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            <X size={18} />
          </button>
        </div>

        <div style={modalBodyStyle}>
          {/* Left Grid Selector */}
          <div style={selectorGridStyle}>
            <label style={labelStyle}>Source Type</label>
            <div style={typesListStyle}>
              {sourceTypes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setType(item.value)}
                  style={type === item.value ? typeActiveCardStyle : typeCardStyle}
                >
                  <span style={type === item.value ? iconActiveStyle : iconStyle}>{item.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#F8FAFC' }}>{item.label}</span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.2 }}>{item.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Configuration Forms */}
          <div style={configPaneStyle}>
            <label style={labelStyle}>Source Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Capture Screen"
              style={{ width: '100%', marginBottom: '16px' }}
            />

            {/* Dynamic settings forms */}
            {type === 'text' && (
              <div style={subFormStyle}>
                <label style={labelStyle}>Text Content</label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Type overlay text here..."
                  style={{ width: '100%', height: '70px', resize: 'none' }}
                />
                
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Font Size (px)</label>
                    <input
                      type="number"
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Font Color</label>
                    <input
                      type="color"
                      value={fontColor}
                      onChange={(e) => setFontColor(e.target.value)}
                      style={{ width: '100%', padding: '2px 4px', height: '36px', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {type === 'color' && (
              <div style={subFormStyle}>
                <label style={labelStyle}>Select Background Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="color"
                    value={colorHex}
                    onChange={(e) => setColorHex(e.target.value)}
                    style={{ width: '60px', height: '40px', padding: '2px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={colorHex}
                    onChange={(e) => setColorHex(e.target.value)}
                    placeholder="#6366F1"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            )}

            {(type === 'image' || type === 'video') && (
              <div style={subFormStyle}>
                <label style={labelStyle}>Media URL or Local Resource</label>
                <input
                  type="text"
                  required
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder={type === 'image' ? 'https://images.unsplash.com/... or 0logov3.png' : 'https://www.w3schools.com/html/mov_bbb.mp4'}
                  style={{ width: '100%', marginBottom: '12px' }}
                />
                <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
                  💡 Tip: You can paste a public URL or use relative paths like <code>/0logov3.png</code>.
                </p>
              </div>
            )}

            {type === 'camera' && (
              <div style={subFormStyle}>
                <label style={labelStyle}>Webcam Input Device</label>
                {devices.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#EF4444', margin: 0 }}>
                    ⚠️ No webcam hardware discovered. Please grant browser permissions or plug in a device.
                  </p>
                ) : (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {type === 'screen' && (
              <div style={subFormStyle}>
                <p style={{ fontSize: '0.82rem', color: '#A5B4FC', margin: 0, padding: '10px', background: 'rgba(95, 93, 236, 0.08)', border: '1px solid rgba(95, 93, 236, 0.2)', borderRadius: '6px' }}>
                  📺 Click **Create Source** then authorize screensharing. You can capture entire desktops, dual screens, chrome tabs, or application windows!
                </p>
              </div>
            )}
          </div>
        </div>

        <div style={modalFooterStyle}>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Create Source
          </button>
        </div>
      </form>
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
  width: '680px',
  height: '460px',
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
  minHeight: 0
};

const selectorGridStyle: React.CSSProperties = {
  width: '280px',
  background: '#0A0D15',
  borderRight: '1px solid #1F2A3F',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const typesListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  overflowY: 'auto',
  flex: 1
};

const typeCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 10px',
  borderRadius: '8px',
  background: 'rgba(20, 26, 41, 0.3)',
  border: '1px solid transparent',
  width: '100%',
  cursor: 'pointer',
  transition: 'all 0.2s'
};

const typeActiveCardStyle: React.CSSProperties = {
  ...typeCardStyle,
  background: 'rgba(95, 93, 236, 0.12)',
  border: '1px solid var(--accent)',
};

const iconStyle: React.CSSProperties = {
  color: '#94A3B8',
  display: 'flex'
};

const iconActiveStyle: React.CSSProperties = {
  color: '#A5B4FC',
  display: 'flex'
};

const configPaneStyle: React.CSSProperties = {
  flex: 1,
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  background: '#0D111A'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 500,
  color: '#94A3B8',
  marginBottom: '6px',
  display: 'block'
};

const subFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
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
