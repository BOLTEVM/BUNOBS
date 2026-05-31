export interface AudioSourceNodeGroup {
  sourceNode: AudioNode;
  gainNode: GainNode;
  analyserNode: AnalyserNode;
}

export class AudioMixer {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private nodes = new Map<string, AudioSourceNodeGroup>();
  
  // Track configurations locally
  private volumes = new Map<string, number>(); // sourceId -> volume (0..1)
  private mutes = new Map<string, boolean>();   // sourceId -> isMuted

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

  // Route a microphone MediaStream
  connectMicrophone(sourceId: string, stream: MediaStream) {
    this.init();
    if (!this.ctx || !this.dest) return;

    // Disconnect old nodes if exist
    this.disconnectSource(sourceId);

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn(`[AudioMixer] No audio tracks found for mic source: ${sourceId}`);
      return;
    }

    try {
      const sourceNode = this.ctx.createMediaStreamSource(stream);
      const gainNode = this.ctx.createGain();
      const analyserNode = this.ctx.createAnalyser();
      analyserNode.fftSize = 256;

      // Routing: Source -> Gain -> Analyser -> Destination
      sourceNode.connect(gainNode);
      gainNode.connect(analyserNode);
      analyserNode.connect(this.dest);

      // Apply initial values
      const vol = this.volumes.has(sourceId) ? this.volumes.get(sourceId)! : 0.8;
      const mute = this.mutes.has(sourceId) ? this.mutes.get(sourceId)! : false;
      
      gainNode.gain.setValueAtTime(mute ? 0 : vol, this.ctx.currentTime);
      this.volumes.set(sourceId, vol);
      this.mutes.set(sourceId, mute);

      this.nodes.set(sourceId, { sourceNode, gainNode, analyserNode });
      console.log(`[AudioMixer] Connected microphone source: ${sourceId}`);
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
      // Screen share has no audio, ignore
      return;
    }

    try {
      const sourceNode = this.ctx.createMediaStreamSource(stream);
      const gainNode = this.ctx.createGain();
      const analyserNode = this.ctx.createAnalyser();
      analyserNode.fftSize = 256;

      sourceNode.connect(gainNode);
      gainNode.connect(analyserNode);
      analyserNode.connect(this.dest);

      const vol = this.volumes.has(sourceId) ? this.volumes.get(sourceId)! : 0.8;
      const mute = this.mutes.has(sourceId) ? this.mutes.get(sourceId)! : false;

      gainNode.gain.setValueAtTime(mute ? 0 : vol, this.ctx.currentTime);
      this.volumes.set(sourceId, vol);
      this.mutes.set(sourceId, mute);

      this.nodes.set(sourceId, { sourceNode, gainNode, analyserNode });
      console.log(`[AudioMixer] Connected screenshare audio source: ${sourceId}`);
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
      // Create element source (handles cross-origin requirements if needed)
      videoElement.crossOrigin = 'anonymous';
      
      const sourceNode = this.ctx.createMediaElementSource(videoElement);
      const gainNode = this.ctx.createGain();
      const analyserNode = this.ctx.createAnalyser();
      analyserNode.fftSize = 256;

      sourceNode.connect(gainNode);
      gainNode.connect(analyserNode);
      analyserNode.connect(this.dest);
      
      // Also connect to speaker output so the local user can hear the video audio!
      gainNode.connect(this.ctx.destination);

      const vol = this.volumes.has(sourceId) ? this.volumes.get(sourceId)! : 0.8;
      const mute = this.mutes.has(sourceId) ? this.mutes.get(sourceId)! : false;

      gainNode.gain.setValueAtTime(mute ? 0 : vol, this.ctx.currentTime);
      this.volumes.set(sourceId, vol);
      this.mutes.set(sourceId, mute);

      this.nodes.set(sourceId, { sourceNode, gainNode, analyserNode });
      console.log(`[AudioMixer] Connected media element audio source: ${sourceId}`);
    } catch (err) {
      console.error('[AudioMixer] Error connecting media element audio:', err);
    }
  }

  disconnectSource(sourceId: string) {
    const group = this.nodes.get(sourceId);
    if (!group) return;

    try {
      group.sourceNode.disconnect();
      group.gainNode.disconnect();
      group.analyserNode.disconnect();
    } catch (e) {
      // Node might already be disconnected
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

  // Get real-time volume level from 0 to 100 for decibel meter
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

    // Convert deviation ratio (0..128) to standard peak ratio (0..100)
    // Add a logarithmic scale or soft multiplier for responsive visual bounce
    const ratio = maxVal / 128.0;
    const value = Math.min(Math.round(ratio * 150), 100); // amplify slightly for better UI visibility
    return value;
  }
}
export const audioMixer = new AudioMixer();
