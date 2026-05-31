import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { StreamConfig } from 'shared';

export class FFmpegManager {
  private recordingProcess: any = null;
  private streamingProcess: any = null;
  private recordingsDir: string;

  constructor() {
    this.recordingsDir = join(import.meta.dir, '..', 'recordings');
    if (!existsSync(this.recordingsDir)) {
      mkdirSync(this.recordingsDir, { recursive: true });
    }
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

  // Feed binary data chunk from WebSocket into the running processes
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
