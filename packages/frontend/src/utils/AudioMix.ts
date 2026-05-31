export interface AudioSourceNodeGroup {
  sourceNode: AudioNode;
  gateNode: GainNode;                    // Dynamic noise gate gain node
  compressorNode: DynamicsCompressorNode; // Vocal dynamics compressor
  gainNode: GainNode;                    // Main user volume slider
  analyserNode: AnalyserNode;            // Output level analyzer
}

export class AudioMixer {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private nodes = new Map<string, AudioSourceNodeGroup>();
  
  // Track configurations locally
  private volumes = new Map<string, number>(); // sourceId -> volume (0..1)
  private mutes = new Map<string, boolean>();   // sourceId -> isMuted
  
  // DSP Filter state tracks
  private gateEnabledStates = new Map<string, boolean>();
  private compressorEnabledStates = new Map<string, boolean>();

  init() {
    if (this.ctx) return;
    
    // Start AudioContext (typically requires user gesture)
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    this.dest = this.ctx.createMediaStreamDestination();
    console.log('[AudioMixer] Initialized Web Audio context & destination node');
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  getDestinationNode(): MediaStreamAudioDestinationNode | null {
    return this.dest;
  }

  getMixedStream(): MediaStream | null {
    return this.dest ? this.dest.stream : null;
  }

  // Set filter toggles
  setGateEnabled(sourceId: string, enabled: boolean) {
    this.gateEnabledStates.set(sourceId, enabled);
    console.log(`[AudioMixer] Gate toggle for ${sourceId}: ${enabled}`);
  }

  setCompressorEnabled(sourceId: string, enabled: boolean) {
    this.compressorEnabledStates.set(sourceId, enabled);
    const group = this.nodes.get(sourceId);
    if (group && this.ctx) {
      if (enabled) {
        // High-quality broadcast vocal compression settings
        group.compressorNode.threshold.setValueAtTime(-24, this.ctx.currentTime);
        group.compressorNode.knee.setValueAtTime(30, this.ctx.currentTime);
        group.compressorNode.ratio.setValueAtTime(12, this.ctx.currentTime);
        group.compressorNode.attack.setValueAtTime(0.003, this.ctx.currentTime);
        group.compressorNode.release.setValueAtTime(0.25, this.ctx.currentTime);
      } else {
        // Disable compression by resetting threshold to 0dB
        group.compressorNode.threshold.setValueAtTime(0, this.ctx.currentTime);
      }
      console.log(`[AudioMixer] Compressor configured for ${sourceId}: ${enabled}`);
    }
  }

  getGateEnabled(sourceId: string): boolean {
    return this.gateEnabledStates.get(sourceId) ?? false;
  }

  getCompressorEnabled(sourceId: string): boolean {
    return this.compressorEnabledStates.get(sourceId) ?? false;
  }

  // Helper to establish DSP routing chain
  private createSourceChain(sourceNode: AudioNode, sourceId: string): AudioSourceNodeGroup {
    if (!this.ctx || !this.dest) {
      throw new Error('AudioContext not initialized');
    }

    const gateNode = this.ctx.createGain();
    const compressorNode = this.ctx.createDynamicsCompressor();
    const gainNode = this.ctx.createGain();
    const analyserNode = this.ctx.createAnalyser();
    analyserNode.fftSize = 256;

    // Route chain: Source -> Gate (Noise Gate) -> Compressor (Dynamics) -> Gain (Volume) -> Analyser -> Dest
    sourceNode.connect(gateNode);
    gateNode.connect(compressorNode);
    compressorNode.connect(gainNode);
    gainNode.connect(analyserNode);
    analyserNode.connect(this.dest);

    // Apply cached volume and mute settings
    const vol = this.volumes.has(sourceId) ? this.volumes.get(sourceId)! : 0.8;
    const mute = this.mutes.has(sourceId) ? this.mutes.get(sourceId)! : false;
    gainNode.gain.setValueAtTime(mute ? 0 : vol, this.ctx.currentTime);
    
    // Apply cached filter settings
    const compEnabled = this.compressorEnabledStates.get(sourceId) ?? false;

    if (compEnabled) {
      compressorNode.threshold.setValueAtTime(-24, this.ctx.currentTime);
      compressorNode.knee.setValueAtTime(30, this.ctx.currentTime);
      compressorNode.ratio.setValueAtTime(12, this.ctx.currentTime);
      compressorNode.attack.setValueAtTime(0.003, this.ctx.currentTime);
      compressorNode.release.setValueAtTime(0.25, this.ctx.currentTime);
    } else {
      compressorNode.threshold.setValueAtTime(0, this.ctx.currentTime);
    }

    this.volumes.set(sourceId, vol);
    this.mutes.set(sourceId, mute);

    return { sourceNode, gateNode, compressorNode, gainNode, analyserNode };
  }

  // Route a microphone MediaStream
  connectMicrophone(sourceId: string, stream: MediaStream) {
    this.init();
    if (!this.ctx || !this.dest) return;

    this.disconnectSource(sourceId);

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn(`[AudioMixer] No audio tracks found for mic source: ${sourceId}`);
      return;
    }

    try {
      const sourceNode = this.ctx.createMediaStreamSource(stream);
      const nodeGroup = this.createSourceChain(sourceNode, sourceId);
      this.nodes.set(sourceId, nodeGroup);
      console.log(`[AudioMixer] Connected microphone source with DSP: ${sourceId}`);
    } catch (err) {
      console.error('[AudioMixer] Error connecting mic:', err);
    }
  }

  // Route Desktop system audio from Screenshare getDisplayMedia
  connectScreenAudio(sourceId: string, stream: MediaStream) {
    this.init();
    if (!this.ctx || !this.dest) return;

    this.disconnectSource(sourceId);

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      return;
    }

    try {
      const sourceNode = this.ctx.createMediaStreamSource(stream);
      const nodeGroup = this.createSourceChain(sourceNode, sourceId);
      this.nodes.set(sourceId, nodeGroup);
      console.log(`[AudioMixer] Connected screenshare audio source with DSP: ${sourceId}`);
    } catch (err) {
      console.error('[AudioMixer] Error connecting screenshare audio:', err);
    }
  }

  // Route HTML5 Video / Audio elements (e.g. Media files played on canvas)
  connectMediaElement(sourceId: string, videoElement: HTMLVideoElement) {
    this.init();
    if (!this.ctx || !this.dest) return;

    this.disconnectSource(sourceId);

    try {
      videoElement.crossOrigin = 'anonymous';
      
      const sourceNode = this.ctx.createMediaElementSource(videoElement);
      const nodeGroup = this.createSourceChain(sourceNode, sourceId);
      
      // Connect final volume slider to local audio output speakers so broadcaster can hear it too
      nodeGroup.gainNode.connect(this.ctx.destination);

      this.nodes.set(sourceId, nodeGroup);
      console.log(`[AudioMixer] Connected media element audio source with DSP: ${sourceId}`);
    } catch (err) {
      console.error('[AudioMixer] Error connecting media element audio:', err);
    }
  }

  disconnectSource(sourceId: string) {
    const group = this.nodes.get(sourceId);
    if (!group) return;

    try {
      group.sourceNode.disconnect();
      group.gateNode.disconnect();
      group.compressorNode.disconnect();
      group.gainNode.disconnect();
      group.analyserNode.disconnect();
    } catch (e) {
      // Nodes already disconnected
    }

    this.nodes.delete(sourceId);
    console.log(`[AudioMixer] Disconnected audio source: ${sourceId}`);
  }

  setVolume(sourceId: string, volume: number) {
    this.volumes.set(sourceId, volume);
    const group = this.nodes.get(sourceId);
    if (group && this.ctx) {
      const mute = this.mutes.get(sourceId) || false;
      group.gainNode.gain.setValueAtTime(mute ? 0 : volume, this.ctx.currentTime);
    }
  }

  setMute(sourceId: string, isMuted: boolean) {
    this.mutes.set(sourceId, isMuted);
    const group = this.nodes.get(sourceId);
    if (group && this.ctx) {
      const vol = this.volumes.get(sourceId) || 0.8;
      group.gainNode.gain.setValueAtTime(isMuted ? 0 : vol, this.ctx.currentTime);
    }
  }

  getVolume(sourceId: string): number {
    return this.volumes.get(sourceId) ?? 0.8;
  }

  getMute(sourceId: string): boolean {
    return this.mutes.get(sourceId) ?? false;
  }

  // Get real-time volume level from 0 to 100 with dynamic software Noise Gate processing
  getAudioLevel(sourceId: string): number {
    const group = this.nodes.get(sourceId);
    if (!group) return 0;

    const analyser = group.analyserNode;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    let maxVal = 0;
    for (let i = 0; i < bufferLength; i++) {
      const deviation = Math.abs(dataArray[i] - 128);
      if (deviation > maxVal) {
        maxVal = deviation;
      }
    }

    const ratio = maxVal / 128.0;

    // Real-Time DSP Noise Gate implementation
    const gateEnabled = this.gateEnabledStates.get(sourceId) ?? false;
    if (gateEnabled && this.ctx) {
      const threshold = 0.015; // Gate threshold level (approx -36dB vocal activation limit)
      if (ratio < threshold) {
        // Dynamic gating: ramp down immediately
        group.gateNode.gain.setValueAtTime(0, this.ctx.currentTime);
      } else {
        // Vocal activation: open gate immediately
        group.gateNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
      }
    } else if (this.ctx) {
      // Pass-through
      group.gateNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
    }

    const value = Math.min(Math.round(ratio * 150), 100); // Visual amplification factor
    return value;
  }
}
export const audioMixer = new AudioMixer();
