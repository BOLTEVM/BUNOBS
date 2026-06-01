import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { StreamConfig } from 'shared';

/**
 * Detects the host operating system platform.
 * Returns 'windows', 'linux', or 'unsupported'.
 */
function detectPlatform(): 'windows' | 'linux' | 'unsupported' {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  return 'unsupported';
}

export class FFmpegManager {
  private recordingProcess: any = null;
  private streamingProcess: any = null;
  private virtualCamProcess: any = null;
  private recordingsDir: string;
  private platform: 'windows' | 'linux' | 'unsupported';

  constructor() {
    this.recordingsDir = join(import.meta.dir, '..', 'recordings');
    if (!existsSync(this.recordingsDir)) {
      mkdirSync(this.recordingsDir, { recursive: true });
    }
    this.platform = detectPlatform();
    console.log(`[FFmpeg] Detected platform: ${this.platform}`);
  }

  getRecordingsDir(): string {
    return this.recordingsDir;
  }

  isRecording(): boolean {
    return this.recordingProcess !== null;
  }

  isStreaming(): boolean {
    return this.streamingProcess !== null;
  }

  isVirtualCamActive(): boolean {
    return this.virtualCamProcess !== null;
  }

  startRecording(): string {
    if (this.recordingProcess) {
      throw new Error('Recording is already in progress');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `bobs_rec_${timestamp}.mp4`;
    const outputPath = join(this.recordingsDir, filename);

    console.log(`[FFmpeg] Starting local recording to: ${outputPath}`);

    // Browser MediaRecorder outputting WebM (VP8/Opus or H264/Opus) is fed to stdin
    // We transcode to high-quality MP4 (H264/AAC)
    const args = [
      'ffmpeg',
      '-y',
      '-loglevel', 'info',
      '-i', 'pipe:0',             // Input from standard input (WebSocket binary stream)
      '-c:v', 'libx264',          // Transcode video to H.264
      '-preset', 'ultrafast',     // Ultrafast preset for real-time encoding with low CPU
      '-crf', '23',               // Reasonable visual quality
      '-pix_fmt', 'yuv420p',      // Standard color space for universal playability
      '-c:a', 'aac',              // Transcode audio to AAC
      '-b:a', '128k',             // 128kbps audio
      '-ar', '44100',             // 44.1kHz audio sampling rate
      '-movflags', '+faststart',  // Web optimization (moov atom at beginning)
      outputPath
    ];

    try {
      this.recordingProcess = Bun.spawn({
        cmd: args,
        stdin: 'pipe',
        stdout: 'inherit',
        stderr: 'pipe', // Pipe stderr so we can inspect FFmpeg's output
      });

      this.monitorProcess(this.recordingProcess, 'Recording');
      return filename;
    } catch (err) {
      console.error('[FFmpeg] Failed to spawn recording process:', err);
      this.recordingProcess = null;
      throw err;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.recordingProcess) return;

    console.log('[FFmpeg] Stopping local recording, finalizing file...');
    try {
      this.recordingProcess.stdin.close(); // Signal EOF to FFmpeg so it wraps up the container
      const exitCode = await this.recordingProcess.exited;
      console.log(`[FFmpeg] Recording process exited with code ${exitCode}`);
    } catch (err) {
      console.error('[FFmpeg] Error stopping recording process:', err);
    } finally {
      this.recordingProcess = null;
    }
  }

  startStreaming(config: StreamConfig): void {
    if (this.streamingProcess) {
      throw new Error('Streaming is already in progress');
    }

    const { rtmpUrl, streamKey, fps, videoBitrate, audioBitrate } = config;
    const fullRtmpPath = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl;

    console.log(`[FFmpeg] Starting RTMP stream to: ${rtmpUrl} (key length: ${streamKey?.length || 0})`);

    // Stream ingestion and transcoding to FLV for RTMP push
    const args = [
      'ffmpeg',
      '-y',
      '-loglevel', 'info',
      '-i', 'pipe:0',                       // Input from stdin
      '-c:v', 'libx264',                    // Encode to H.264
      '-preset', 'veryfast',                // Low latency, moderate CPU usage
      '-b:v', `${videoBitrate}k`,           // Video Bitrate
      '-maxrate', `${videoBitrate}k`,
      '-bufsize', `${videoBitrate * 2}k`,
      '-pix_fmt', 'yuv420p',                // YUV420 color format for ingest
      '-g', `${fps * 2}`,                   // Keyframe interval (2 seconds)
      '-c:a', 'aac',                        // Encode audio to AAC
      '-b:a', `${audioBitrate}k`,           // Audio Bitrate
      '-ar', '44100',                       // 44.1kHz audio
      '-f', 'flv',                          // Flash Video format for RTMP ingest
      fullRtmpPath
    ];

    try {
      this.streamingProcess = Bun.spawn({
        cmd: args,
        stdin: 'pipe',
        stdout: 'inherit',
        stderr: 'pipe',
      });

      this.monitorProcess(this.streamingProcess, 'Streaming');
    } catch (err) {
      console.error('[FFmpeg] Failed to spawn streaming process:', err);
      this.streamingProcess = null;
      throw err;
    }
  }

  async stopStreaming(): Promise<void> {
    if (!this.streamingProcess) return;

    console.log('[FFmpeg] Stopping RTMP stream...');
    try {
      this.streamingProcess.stdin.close(); // Signal EOF
      const exitCode = await this.streamingProcess.exited;
      console.log(`[FFmpeg] Streaming process exited with code ${exitCode}`);
    } catch (err) {
      console.error('[FFmpeg] Error stopping streaming process:', err);
    } finally {
      this.streamingProcess = null;
    }
  }

  // ================================================================
  // Phase 3: Virtual Camera Loopback
  // ================================================================
  //
  // Binds the composed browser Program feed back into the operating system
  // as a native webcam device for use in external apps (Zoom, Teams, Discord).
  //
  // Windows: Uses FFmpeg's `dshow` output with a virtual camera driver.
  //   Requires a DirectShow virtual camera driver to be installed:
  //   - OBS Virtual Camera (OBS-VirtualCam)
  //   - scream-virtual-camera
  //   - Unity Capture
  //
  // Linux: Uses `v4l2loopback` kernel module.
  //   Requires: sudo modprobe v4l2loopback devices=1 video_nr=10
  //             card_label="BOBS Virtual Camera"
  // ================================================================

  /**
   * Detect available virtual camera output targets on the system.
   * Returns the device name/path if found, or null if no virtual cam driver is available.
   */
  async detectVirtualCamDevice(): Promise<{ device: string; driver: string } | null> {
    if (this.platform === 'windows') {
      // Try to detect OBS Virtual Camera or other DirectShow virtual cameras
      // by listing DirectShow devices via FFmpeg
      try {
        const listProc = Bun.spawn({
          cmd: ['ffmpeg', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
        });

        // FFmpeg outputs device list to stderr
        const stderr = await new Response(listProc.stderr).text();
        await listProc.exited;

        // Look for known virtual camera device names
        const virtualCamPatterns = [
          { pattern: /\"OBS Virtual Camera\"/i, name: 'OBS Virtual Camera', driver: 'obs-virtualcam' },
          { pattern: /\"BOBS Virtual Camera\"/i, name: 'BOBS Virtual Camera', driver: 'bobs-vcam' },
          { pattern: /\"Unity Video Capture\"/i, name: 'Unity Video Capture', driver: 'unity-capture' },
          { pattern: /\"Dummy video\"/i, name: 'Dummy video', driver: 'dummy' },
          { pattern: /\"screen-capture-recorder\"/i, name: 'screen-capture-recorder', driver: 'scr' },
        ];

        for (const { pattern, name, driver } of virtualCamPatterns) {
          if (pattern.test(stderr)) {
            console.log(`[FFmpeg VCam] Found virtual camera device: ${name} (driver: ${driver})`);
            return { device: name, driver };
          }
        }

        // If no known device found, check if any video output devices exist
        console.log('[FFmpeg VCam] No known virtual camera device found on Windows.');
        console.log('[FFmpeg VCam] Available devices:', stderr.substring(0, 500));
        return null;
      } catch (err) {
        console.error('[FFmpeg VCam] Failed to enumerate DirectShow devices:', err);
        return null;
      }
    }

    if (this.platform === 'linux') {
      // Check for v4l2loopback devices
      const loopbackDevices = ['/dev/video10', '/dev/video20', '/dev/video2', '/dev/video3'];
      for (const device of loopbackDevices) {
        if (existsSync(device)) {
          console.log(`[FFmpeg VCam] Found v4l2 loopback device: ${device}`);
          return { device, driver: 'v4l2loopback' };
        }
      }
      console.log('[FFmpeg VCam] No v4l2loopback device found on Linux.');
      return null;
    }

    console.log(`[FFmpeg VCam] Virtual camera not supported on platform: ${this.platform}`);
    return null;
  }

  /**
   * Start the virtual camera loopback.
   * Spawns an FFmpeg process that decodes the WebM stdin stream and pipes raw
   * video frames to the virtual camera device on the host OS.
   */
  async startVirtualCam(resolution?: { width: number; height: number }): Promise<string> {
    if (this.virtualCamProcess) {
      throw new Error('Virtual camera is already active');
    }

    const width = resolution?.width ?? 1280;
    const height = resolution?.height ?? 720;

    // Detect available virtual camera device
    const device = await this.detectVirtualCamDevice();

    let args: string[];

    if (this.platform === 'windows') {
      if (device) {
        // Output to detected DirectShow virtual camera device
        console.log(`[FFmpeg VCam] Starting virtual camera → ${device.device}`);
        args = [
          'ffmpeg',
          '-y',
          '-loglevel', 'warning',
          '-i', 'pipe:0',                             // WebM from stdin
          '-c:v', 'rawvideo',                         // Decode to raw frames for DirectShow
          '-pix_fmt', 'yuv420p',                      // Standard pixel format
          '-s', `${width}x${height}`,                 // Force resolution
          '-r', '30',                                 // 30fps output
          '-f', 'dshow',                              // DirectShow output format
          `video=${device.device}`,                   // Target virtual camera device
        ];
      } else {
        // Fallback: Use GDIgrab loopback or named pipe for preview
        // When no virtual cam driver exists, we output raw video to a named pipe
        // that other software can read from
        console.log('[FFmpeg VCam] No virtual camera driver found. Using raw video output fallback.');
        console.log('[FFmpeg VCam] Install OBS Virtual Camera or a DirectShow loopback driver for system-wide webcam support.');
        args = [
          'ffmpeg',
          '-y',
          '-loglevel', 'warning',
          '-i', 'pipe:0',                             // WebM from stdin
          '-c:v', 'rawvideo',                         // Decode to raw frames
          '-pix_fmt', 'bgra',                         // BGRA for Windows compatibility
          '-s', `${width}x${height}`,                 // Force resolution
          '-r', '30',                                 // 30fps
          '-f', 'rawvideo',                           // Raw video output (pipe/file)
          'pipe:1',                                   // Output to stdout (can be piped to other tools)
        ];
      }
    } else if (this.platform === 'linux') {
      const v4lDevice = device?.device ?? '/dev/video10';
      console.log(`[FFmpeg VCam] Starting virtual camera → ${v4lDevice}`);
      args = [
        'ffmpeg',
        '-y',
        '-loglevel', 'warning',
        '-i', 'pipe:0',                               // WebM from stdin
        '-c:v', 'rawvideo',                           // Decode to raw frames
        '-pix_fmt', 'yuv420p',                        // v4l2loopback compatible pixel format
        '-s', `${width}x${height}`,                   // Force resolution
        '-r', '30',                                   // 30fps
        '-f', 'v4l2',                                 // Video4Linux2 output
        v4lDevice,                                    // Target loopback device
      ];
    } else {
      throw new Error(`Virtual camera is not supported on platform: ${this.platform}`);
    }

    try {
      this.virtualCamProcess = Bun.spawn({
        cmd: args,
        stdin: 'pipe',
        stdout: 'ignore',   // Raw video output goes nowhere (or to device)
        stderr: 'pipe',
      });

      this.monitorProcess(this.virtualCamProcess, 'VirtualCam');
      
      const deviceName = device?.device ?? (this.platform === 'windows' ? 'BOBS Virtual Camera (fallback)' : '/dev/video10');
      console.log(`[FFmpeg VCam] Virtual camera active: ${deviceName}`);
      return deviceName;
    } catch (err) {
      console.error('[FFmpeg VCam] Failed to spawn virtual camera process:', err);
      this.virtualCamProcess = null;
      throw err;
    }
  }

  /**
   * Stop the virtual camera loopback process.
   */
  async stopVirtualCam(): Promise<void> {
    if (!this.virtualCamProcess) return;

    console.log('[FFmpeg VCam] Stopping virtual camera...');
    try {
      this.virtualCamProcess.stdin.close();
      const exitCode = await this.virtualCamProcess.exited;
      console.log(`[FFmpeg VCam] Virtual camera process exited with code ${exitCode}`);
    } catch (err) {
      console.error('[FFmpeg VCam] Error stopping virtual camera process:', err);
    } finally {
      this.virtualCamProcess = null;
    }
  }

  /**
   * Get the platform and driver information for the virtual camera.
   */
  getVirtualCamInfo(): { platform: string; isActive: boolean; supported: boolean } {
    return {
      platform: this.platform,
      isActive: this.virtualCamProcess !== null,
      supported: this.platform !== 'unsupported',
    };
  }

  // Feed binary data chunk from WebSocket into ALL running processes
  writeChunk(chunk: Uint8Array): void {
    let written = false;

    if (this.recordingProcess && this.recordingProcess.stdin) {
      try {
        this.recordingProcess.stdin.write(chunk);
        this.recordingProcess.stdin.flush();
        written = true;
      } catch (err) {
        console.error('[FFmpeg] Error writing chunk to recording stdin:', err);
      }
    }

    if (this.streamingProcess && this.streamingProcess.stdin) {
      try {
        this.streamingProcess.stdin.write(chunk);
        this.streamingProcess.stdin.flush();
        written = true;
      } catch (err) {
        console.error('[FFmpeg] Error writing chunk to streaming stdin:', err);
      }
    }

    // Phase 3: Also feed chunks to the virtual camera process
    if (this.virtualCamProcess && this.virtualCamProcess.stdin) {
      try {
        this.virtualCamProcess.stdin.write(chunk);
        this.virtualCamProcess.stdin.flush();
        written = true;
      } catch (err) {
        console.error('[FFmpeg] Error writing chunk to virtual camera stdin:', err);
      }
    }

    if (!written) {
      // Processes might have closed or not started yet
    }
  }

  // Monitor stderr to output useful logs or detect errors
  private async monitorProcess(proc: any, label: string) {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const logLine = decoder.decode(value);
        // Print logs in backend console; filter noise if needed or print full details
        if (logLine.includes('Error') || logLine.includes('warning') || logLine.includes('failed')) {
          console.warn(`[FFmpeg ${label} Alert] ${logLine.trim()}`);
        } else {
          // Log general progress
          console.log(`[FFmpeg ${label}] ${logLine.trim().split('\n').slice(-1)[0]}`);
        }
      }
    } catch (err) {
      console.error(`[FFmpeg ${label}] Error reading stderr:`, err);
    }
  }
}
export const ffmpeg = new FFmpegManager();
