import type { Scene, Source } from 'shared';

export interface TransitionState {
  isTransitioning: boolean;
  fromSceneId: string;
  toSceneId: string;
  startTime: number;
  duration: number;
  type: 'cut' | 'fade' | 'slide';
}

export class Compositor {
  private canvasPreview: HTMLCanvasElement | null = null;
  private canvasProgram: HTMLCanvasElement | null = null;
  private ctxPreview: CanvasRenderingContext2D | null = null;
  private ctxProgram: CanvasRenderingContext2D | null = null;
  
  private scenes: Scene[] = [];
  private activeSceneId: string = '';
  private programSceneId: string = '';
  
  private width = 1280;
  private height = 720;
  private isLoopRunning = false;
  
  // HTML media elements cached for rendering: id -> HTMLVideoElement | HTMLImageElement
  private mediaCache = new Map<string, HTMLVideoElement | HTMLImageElement>();
  
  // Interaction/WYSIWYG states
  private selectedSourceId: string | null = null;
  private isDragging = false;
  private isResizing = false;
  private resizeHandle: string | null = null; // 'tl', 'tr', 'bl', 'br', 'tc', 'bc', 'ml', 'mr'
  private dragStart = { x: 0, y: 0 };
  private sourceStart = { x: 0, y: 0, width: 0, height: 0 };
  
  // Transition state
  private transition: TransitionState = {
    isTransitioning: false,
    fromSceneId: '',
    toSceneId: '',
    startTime: 0,
    duration: 300,
    type: 'fade'
  };

  // Callbacks for UI updates
  private onSelectedSourceChange: ((sourceId: string | null) => void) | null = null;
  private onScenesUpdate: ((scenes: Scene[]) => void) | null = null;

  constructor(width = 1280, height = 720) {
    this.width = width;
    this.height = height;
  }

  setCanvases(preview: HTMLCanvasElement, program: HTMLCanvasElement) {
    this.canvasPreview = preview;
    this.canvasProgram = program;
    
    this.canvasPreview.width = this.width;
    this.canvasPreview.height = this.height;
    this.canvasProgram.width = this.width;
    this.canvasProgram.height = this.height;
    
    this.ctxPreview = this.canvasPreview.getContext('2d');
    this.ctxProgram = this.canvasProgram.getContext('2d');
    
    // Setup mouse/touch interactions for WYSIWYG editing on Preview canvas
    this.setupInteractions();
    
    if (!this.isLoopRunning) {
      this.isLoopRunning = true;
      this.renderLoop();
    }
  }

  setCallbacks(
    onSelectedSourceChange: (sourceId: string | null) => void,
    onScenesUpdate: (scenes: Scene[]) => void
  ) {
    this.onSelectedSourceChange = onSelectedSourceChange;
    this.onScenesUpdate = onScenesUpdate;
  }

  destroy() {
    this.isLoopRunning = false;
    this.mediaCache.forEach((el) => {
      if (el instanceof HTMLVideoElement) {
        el.pause();
        el.srcObject = null;
        el.src = '';
      }
    });
    this.mediaCache.clear();
  }

  updateResolution(width: number, height: number) {
    this.width = width;
    this.height = height;
    if (this.canvasPreview) {
      this.canvasPreview.width = width;
      this.canvasPreview.height = height;
    }
    if (this.canvasProgram) {
      this.canvasProgram.width = width;
      this.canvasProgram.height = height;
    }
  }

  // --- Scene / Source Management ---
  setScenes(scenes: Scene[], activeId?: string, programId?: string) {
    this.scenes = scenes;
    if (activeId) this.activeSceneId = activeId;
    if (programId) this.programSceneId = programId;
    
    // Clean cache of removed media sources to avoid memory leaks
    const currentMediaIds = new Set<string>();
    scenes.forEach((scene) => {
      scene.sources.forEach((source) => {
        if (source.type === 'camera' || source.type === 'screen' || source.type === 'image' || source.type === 'video') {
          currentMediaIds.add(source.id);
        }
      });
    });

    this.mediaCache.forEach((el, id) => {
      if (!currentMediaIds.has(id)) {
        if (el instanceof HTMLVideoElement) {
          el.pause();
          el.srcObject = null;
          el.src = '';
        }
        this.mediaCache.delete(id);
      }
    });

    if (this.onScenesUpdate) {
      this.onScenesUpdate([...this.scenes]);
    }
  }

  setActiveScene(sceneId: string) {
    this.activeSceneId = sceneId;
    this.setSelectedSource(null);
  }

  setProgramScene(sceneId: string) {
    this.programSceneId = sceneId;
  }

  setSelectedSource(sourceId: string | null) {
    this.selectedSourceId = sourceId;
    if (this.onSelectedSourceChange) {
      this.onSelectedSourceChange(sourceId);
    }
  }

  // Bind a standard HTML element to a source ID for rendering
  registerMediaElement(sourceId: string, element: HTMLVideoElement | HTMLImageElement) {
    this.mediaCache.set(sourceId, element);
  }

  getMediaElement(sourceId: string): HTMLVideoElement | HTMLImageElement | undefined {
    return this.mediaCache.get(sourceId);
  }

  // Trigger studio transition from Preview (activeScene) to Program
  triggerTransition(type: 'cut' | 'fade' | 'slide', durationMs = 300) {
    if (this.transition.isTransitioning) return;
    
    if (type === 'cut') {
      this.programSceneId = this.activeSceneId;
      return;
    }

    this.transition = {
      isTransitioning: true,
      fromSceneId: this.programSceneId,
      toSceneId: this.activeSceneId,
      startTime: Date.now(),
      duration: durationMs,
      type
    };
  }

  // --- Rendering Loop ---
  private renderLoop = () => {
    if (!this.isLoopRunning) return;

    this.renderPreview();
    this.renderProgram();

    requestAnimationFrame(this.renderLoop);
  };

  // Renders the edit canvas
  private renderPreview() {
    const ctx = this.ctxPreview;
    if (!ctx || !this.canvasPreview) return;

    // Clear background with default grey grid or dark black
    ctx.fillStyle = '#06080E';
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawCheckerboard(ctx);

    const activeScene = this.scenes.find((s) => s.id === this.activeSceneId);
    if (activeScene) {
      // Sort by zIndex to draw back-to-front
      const sortedSources = [...activeScene.sources].sort((a, b) => a.zIndex - b.zIndex);
      sortedSources.forEach((source) => {
        if (source.visible) {
          this.drawSource(ctx, source);
        }
      });

      // Draw active selection outline + handles
      if (this.selectedSourceId) {
        const selectedSource = activeScene.sources.find((s) => s.id === this.selectedSourceId);
        if (selectedSource && selectedSource.visible) {
          this.drawSelectionOutline(ctx, selectedSource);
        }
      }
    } else {
      ctx.fillStyle = '#8F9CAE';
      ctx.font = '24px Outfit';
      ctx.textAlign = 'center';
      ctx.fillText('No Scene Selected', this.width / 2, this.height / 2);
    }
  }

  // Renders the live program broadcast output canvas
  private renderProgram() {
    const ctx = this.ctxProgram;
    if (!ctx || !this.canvasProgram) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.width, this.height);

    const trans = this.transition;
    if (trans.isTransitioning) {
      const elapsed = Date.now() - trans.startTime;
      const progress = Math.min(elapsed / trans.duration, 1);

      if (progress >= 1) {
        // Transition finished
        this.programSceneId = trans.toSceneId;
        trans.isTransitioning = false;
        
        const finalScene = this.scenes.find((s) => s.id === this.programSceneId);
        if (finalScene) {
          const sorted = [...finalScene.sources].sort((a, b) => a.zIndex - b.zIndex);
          sorted.forEach((source) => {
            if (source.visible) this.drawSource(ctx, source);
          });
        }
      } else {
        // Perform interpolation
        const fromScene = this.scenes.find((s) => s.id === trans.fromSceneId);
        const toScene = this.scenes.find((s) => s.id === trans.toSceneId);

        if (trans.type === 'fade') {
          // Offscreen 1: draw From scene
          const tempCanvasFrom = document.createElement('canvas');
          tempCanvasFrom.width = this.width;
          tempCanvasFrom.height = this.height;
          const tempCtxFrom = tempCanvasFrom.getContext('2d')!;
          if (fromScene) {
            [...fromScene.sources].sort((a,b)=>a.zIndex-b.zIndex).forEach((s) => {
              if (s.visible) this.drawSource(tempCtxFrom, s);
            });
          }

          // Offscreen 2: draw To scene
          const tempCanvasTo = document.createElement('canvas');
          tempCanvasTo.width = this.width;
          tempCanvasTo.height = this.height;
          const tempCtxTo = tempCanvasTo.getContext('2d')!;
          if (toScene) {
            [...toScene.sources].sort((a,b)=>a.zIndex-b.zIndex).forEach((s) => {
              if (s.visible) this.drawSource(tempCtxTo, s);
            });
          }

          // Merge onto Program
          ctx.globalAlpha = 1 - progress;
          ctx.drawImage(tempCanvasFrom, 0, 0);
          ctx.globalAlpha = progress;
          ctx.drawImage(tempCanvasTo, 0, 0);
          ctx.globalAlpha = 1.0; // reset
        } 
        else if (trans.type === 'slide') {
          // Draw old sliding out left, new sliding in from right
          const offset = progress * this.width;

          // Draw FromScene translated
          ctx.save();
          ctx.translate(-offset, 0);
          if (fromScene) {
            [...fromScene.sources].sort((a,b)=>a.zIndex-b.zIndex).forEach((s) => {
              if (s.visible) this.drawSource(ctx, s);
            });
          }
          ctx.restore();

          // Draw ToScene translated
          ctx.save();
          ctx.translate(this.width - offset, 0);
          if (toScene) {
            [...toScene.sources].sort((a,b)=>a.zIndex-b.zIndex).forEach((s) => {
              if (s.visible) this.drawSource(ctx, s);
            });
          }
          ctx.restore();
        }
      }
    } else {
      // Normal static rendering of Program scene
      const programScene = this.scenes.find((s) => s.id === this.programSceneId);
      if (programScene) {
        const sortedSources = [...programScene.sources].sort((a, b) => a.zIndex - b.zIndex);
        sortedSources.forEach((source) => {
          if (source.visible) {
            this.drawSource(ctx, source);
          }
        });
      }
    }
  }

  // Draw background dark checkers to see transparency easily
  private drawCheckerboard(ctx: CanvasRenderingContext2D) {
    const size = 30;
    ctx.fillStyle = '#0A0E1A';
    for (let y = 0; y < this.height; y += size * 2) {
      for (let x = 0; x < this.width; x += size * 2) {
        ctx.fillRect(x, y, size, size);
        ctx.fillRect(x + size, y + size, size, size);
      }
    }
  }

  // Core function to draw a single source based on its configuration
  private drawSource(ctx: CanvasRenderingContext2D, source: Source) {
    ctx.save();
    ctx.globalAlpha = source.opacity;

    const { x, y, width: w, height: h } = source;

    switch (source.type) {
      case 'color': {
        ctx.fillStyle = source.settings.colorHex || '#1E293B';
        ctx.fillRect(x, y, w, h);
        break;
      }

      case 'text': {
        const text = source.settings.textContent || '';
        const size = source.settings.fontSize || 48;
        const color = source.settings.fontColor || '#ffffff';
        const family = source.settings.fontFamily || 'Outfit';
        const weight = source.settings.fontWeight || 'normal';

        ctx.font = `${weight} ${size}px ${family}`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        
        // Handle multiline texts safely
        const lines = text.split('\n');
        lines.forEach((line, index) => {
          ctx.fillText(line, x, y + index * (size * 1.25));
        });
        break;
      }

      case 'image': {
        const img = this.mediaCache.get(source.id) as HTMLImageElement;
        if (img && img.complete) {
          ctx.drawImage(img, x, y, w, h);
        } else {
          // Placeholder drawing while image loads
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#38BDF8';
          ctx.font = '14px Outfit';
          ctx.textAlign = 'center';
          ctx.fillText('Image Loading...', x + w / 2, y + h / 2);
        }
        break;
      }

      case 'camera':
      case 'screen':
      case 'video': {
        const video = this.mediaCache.get(source.id) as HTMLVideoElement;
        if (video && video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
          ctx.drawImage(video, x, y, w, h);
        } else {
          // Draw beautiful themed feed placeholders
          ctx.strokeStyle = source.type === 'screen' ? '#8B5CF6' : '#10B981';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = source.type === 'screen' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)';
          ctx.fillRect(x, y, w, h);
          
          ctx.fillStyle = '#E2E8F0';
          ctx.font = '14px Outfit';
          ctx.textAlign = 'center';
          const label = source.type === 'screen' ? `📺 Screenshare: ${source.name}` : `📷 Webcam: ${source.name}`;
          ctx.fillText(label, x + w / 2, y + h / 2);
        }
        break;
      }
    }

    ctx.restore();
  }

  // Draw selection outline around a selected item
  private drawSelectionOutline(ctx: CanvasRenderingContext2D, source: Source) {
    const { x, y, width: w, height: h } = source;
    
    ctx.save();
    ctx.strokeStyle = '#5F5DEC'; // primary glowing violet selection line
    ctx.lineWidth = 2;
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(95, 93, 236, 0.8)';
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // Draw 8 resize handle circles
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#5F5DEC';
    ctx.lineWidth = 2;
    const r = 5;

    const handles = [
      { x: x, y: y }, // tl
      { x: x + w / 2, y: y }, // tc
      { x: x + w, y: y }, // tr
      { x: x, y: y + h / 2 }, // ml
      { x: x + w, y: y + h / 2 }, // mr
      { x: x, y: y + h }, // bl
      { x: x + w / 2, y: y + h }, // bc
      { x: x + w, y: y + h } // br
    ];

    handles.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  // --- Interaction Setup (WYSIWYG click, drag and resize) ---
  private setupInteractions() {
    if (!this.canvasPreview) return;

    const getCanvasMousePos = (e: MouseEvent) => {
      const rect = this.canvasPreview!.getBoundingClientRect();
      // Translate window coordinate to canvas backing resolution coordinate
      const x = ((e.clientX - rect.left) / rect.width) * this.width;
      const y = ((e.clientY - rect.top) / rect.height) * this.height;
      return { x, y };
    };

    this.canvasPreview.addEventListener('mousedown', (e) => {
      const pos = getCanvasMousePos(e);
      const activeScene = this.scenes.find((s) => s.id === this.activeSceneId);
      if (!activeScene) return;

      // 1. Check if clicked a resize handle of the currently selected source
      if (this.selectedSourceId) {
        const source = activeScene.sources.find((s) => s.id === this.selectedSourceId);
        if (source && source.visible) {
          const handle = this.getHitHandle(pos.x, pos.y, source);
          if (handle) {
            this.isResizing = true;
            this.resizeHandle = handle;
            this.dragStart = pos;
            this.sourceStart = { x: source.x, y: source.y, width: source.width, height: source.height };
            return;
          }
        }
      }

      // 2. Otherwise, check if clicked inside any source bounding box (topmost first)
      const sorted = [...activeScene.sources].sort((a, b) => b.zIndex - a.zIndex); // check front layers first
      const hitSource = sorted.find((source) => {
        if (!source.visible) return false;
        
        // For text, we can approximate dimensions if they are not exact
        const { x, y, width: w, height: h } = source;
        return pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h;
      });

      if (hitSource) {
        this.setSelectedSource(hitSource.id);
        this.isDragging = true;
        this.dragStart = pos;
        this.sourceStart = { x: hitSource.x, y: hitSource.y, width: hitSource.width, height: hitSource.height };
      } else {
        this.setSelectedSource(null);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.canvasPreview || (!this.isDragging && !this.isResizing)) return;

      const pos = getCanvasMousePos(e);
      const dx = pos.x - this.dragStart.x;
      const dy = pos.y - this.dragStart.y;

      const activeScene = this.scenes.find((s) => s.id === this.activeSceneId);
      if (!activeScene || !this.selectedSourceId) return;

      const source = activeScene.sources.find((s) => s.id === this.selectedSourceId);
      if (!source) return;

      if (this.isDragging) {
        // Drag move source
        source.x = Math.round(this.sourceStart.x + dx);
        source.y = Math.round(this.sourceStart.y + dy);
      } 
      else if (this.isResizing && this.resizeHandle) {
        const handle = this.resizeHandle;
        const start = this.sourceStart;

        // Perform resize calculations
        let newX = start.x;
        let newY = start.y;
        let newW = start.width;
        let newH = start.height;

        if (handle.includes('l')) {
          newX = start.x + dx;
          newW = start.width - dx;
        }
        if (handle.includes('r')) {
          newW = start.width + dx;
        }
        if (handle.includes('t')) {
          newY = start.y + dy;
          newH = start.height - dy;
        }
        if (handle.includes('b')) {
          newH = start.height + dy;
        }

        // Enforce minimum dimensions to avoid flips
        if (newW > 10) {
          source.x = Math.round(newX);
          source.width = Math.round(newW);
        }
        if (newH > 10) {
          source.y = Math.round(newY);
          source.height = Math.round(newH);
        }
      }
    });

    const stopAction = () => {
      if (this.isDragging || this.isResizing) {
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        
        // Push state updates back to UI
        if (this.onScenesUpdate) {
          this.onScenesUpdate([...this.scenes]);
        }
      }
    };

    window.addEventListener('mouseup', stopAction);
  }

  // Check if click position hit one of the 8 handles of a source
  private getHitHandle(mx: number, my: number, source: Source): string | null {
    const { x, y, width: w, height: h } = source;
    const clickRadius = 8; // generous click box

    const distance = (x1: number, y1: number, x2: number, y2: number) => {
      return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
    };

    // Define coordinates of each handle
    const handles: Record<string, { x: number, y: number }> = {
      tl: { x: x, y: y },
      tc: { x: x + w / 2, y: y },
      tr: { x: x + w, y: y },
      ml: { x: x, y: y + h / 2 },
      mr: { x: x + w, y: y + h / 2 },
      bl: { x: x, y: y + h },
      bc: { x: x + w / 2, y: y + h },
      br: { x: x + w, y: y + h }
    };

    for (const [key, pt] of Object.entries(handles)) {
      if (distance(mx, my, pt.x, pt.y) <= clickRadius) {
        return key;
      }
    }

    return null;
  }
}
export const compositor = new Compositor();
