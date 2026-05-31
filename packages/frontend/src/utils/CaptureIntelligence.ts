import type { Source, SourceType } from 'shared';

export interface CaptureProfile {
  type: SourceType;
  label: string;
  defaultName: string;
  defaultSettings: Source['settings'];
  activationLabel: string;
  browserSurface: 'monitor' | 'window' | 'camera' | 'media';
}

export interface CaptureCompatibilityNotice {
  level: 'info' | 'warning';
  message: string;
  recommendedType?: SourceType;
}

const chromiumExecutables = ['chrome.exe', 'msedge.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe'];
const gameCaptureBlockedTitles = [
  'destiny 2',
  'roblox',
  'league of legends launcher',
  'grand theft auto: san andreas',
  'san andreas multiplayer'
];
const gameCaptureAdminTitles = [
  'call of duty',
  'genshin impact',
  'honkai: star rail',
  'zenless zone zero',
  'marvel rivals',
  'fragpunk',
  'wuthering waves'
];

export const CAPTURE_PROFILES: Record<'screen' | 'window' | 'game', CaptureProfile> = {
  screen: {
    type: 'screen',
    label: 'Display Capture',
    defaultName: 'Display Capture',
    activationLabel: 'display ingest',
    browserSurface: 'monitor',
    defaultSettings: {
      captureMethod: 'automatic',
      displayLabel: 'Primary Monitor',
      captureCursor: true,
      captureAudio: true,
      forceSdr: false
    }
  },
  window: {
    type: 'window',
    label: 'Window Capture',
    defaultName: 'Window Capture',
    activationLabel: 'window ingest',
    browserSurface: 'window',
    defaultSettings: {
      captureMethod: 'automatic',
      captureAudio: false,
      captureCursor: true,
      clientArea: true,
      forceSdr: false,
      windowMatchPriority: 'title-then-executable'
    }
  },
  game: {
    type: 'game',
    label: 'Game Capture',
    defaultName: 'Game Capture',
    activationLabel: 'game ingest',
    browserSurface: 'window',
    defaultSettings: {
      captureMethod: 'automatic',
      captureAudio: false,
      windowMatchPriority: 'title-then-executable',
      gameCaptureMode: 'specific-window',
      sliCrossfireCaptureMode: false,
      allowTransparency: false
    }
  }
};

export function getCaptureProfile(type: SourceType): CaptureProfile | undefined {
  if (type === 'screen' || type === 'window' || type === 'game') {
    return CAPTURE_PROFILES[type];
  }
  return undefined;
}

export function createCaptureSettings(type: SourceType, settings: Source['settings'] = {}): Source['settings'] {
  const profile = getCaptureProfile(type);
  return profile ? { ...profile.defaultSettings, ...settings } : settings;
}

export function isCaptureSource(type: SourceType): boolean {
  return type === 'screen' || type === 'window' || type === 'game';
}

export function analyzeCaptureCompatibility(source: Pick<Source, 'type' | 'settings'>): CaptureCompatibilityNotice[] {
  const { type, settings } = source;
  const executable = settings.windowExecutable?.trim().toLowerCase() || '';
  const title = settings.windowTitle?.trim().toLowerCase() || '';
  const notices: CaptureCompatibilityNotice[] = [];

  if (type === 'game' && chromiumExecutables.includes(executable)) {
    notices.push({
      level: 'warning',
      recommendedType: 'window',
      message: 'Chromium-based windows are poor Game Capture targets. Use Window Capture or Display Capture instead.'
    });
  }

  if (type === 'game' && gameCaptureBlockedTitles.some((blocked) => title.includes(blocked))) {
    notices.push({
      level: 'warning',
      recommendedType: 'window',
      message: 'This title is commonly blocked for Game Capture. Use Window Capture or Display Capture instead.'
    });
  }

  if (type === 'game' && gameCaptureAdminTitles.some((adminTitle) => title.includes(adminTitle))) {
    notices.push({
      level: 'info',
      message: 'This title may require elevated native capture privileges in OBS-style Game Capture.'
    });
  }

  if ((type === 'window' || type === 'game') && !settings.windowTitle && !settings.windowExecutable) {
    notices.push({
      level: 'info',
      message: 'Set a window title or executable to preserve OBS-style matching intent for native capture bridges.'
    });
  }

  return notices;
}
