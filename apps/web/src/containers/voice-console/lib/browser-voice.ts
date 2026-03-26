export interface BrowserSpeechRecognitionResultItem {
  transcript: string;
}

export interface BrowserSpeechRecognitionEvent {
  results: ArrayLike<
    ArrayLike<BrowserSpeechRecognitionResultItem> & {
      isFinal?: boolean;
    }
  >;
}

export interface BrowserSpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

export interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

interface BrowserAudioSnapshot {
  available: boolean;
  inputDeviceLabel: string | null;
  error: string | null;
}

function getSpeechRecognitionConstructor() {
  const candidate = (
    window as Window & {
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }
  ).webkitSpeechRecognition ??
    (
      window as Window & {
        webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
        SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      }
    ).SpeechRecognition;

  return candidate ?? null;
}

export function supportsBrowserSpeechRecognition() {
  return typeof window !== 'undefined' && getSpeechRecognitionConstructor() !== null;
}

export function createBrowserSpeechRecognition() {
  const Recognition = getSpeechRecognitionConstructor();
  if (!Recognition) {
    throw new Error('Browser speech recognition is not supported in this browser.');
  }

  return new Recognition();
}

export async function readBrowserAudioSnapshot(requestPermission = false): Promise<BrowserAudioSnapshot> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return {
      available: false,
      inputDeviceLabel: null,
      error: 'Browser media devices API is not available.'
    };
  }

  let stream: MediaStream | null = null;

  try {
    if (requestPermission) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0] ?? null;

      if (track) {
        return {
          available: true,
          inputDeviceLabel: track.label || null,
          error: null
        };
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === 'audioinput');

    if (inputs.length === 0) {
      return {
        available: false,
        inputDeviceLabel: null,
        error: 'No microphone detected.'
      };
    }

    const defaultInput =
      inputs.find((device) => device.deviceId === 'default') ?? inputs[0];

    return {
      available: true,
      inputDeviceLabel: defaultInput.label || 'System default microphone',
      error: null
    };
  } catch (error) {
    const name =
      error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
        ? error.name
        : '';

    if (name === 'NotAllowedError') {
      return {
        available: false,
        inputDeviceLabel: null,
        error: 'Microphone permission was denied in the browser.'
      };
    }

    if (name === 'NotFoundError') {
      return {
        available: false,
        inputDeviceLabel: null,
        error: 'No microphone detected.'
      };
    }

    return {
      available: false,
      inputDeviceLabel: null,
      error: error instanceof Error ? error.message : 'Unable to inspect browser audio devices.'
    };
  } finally {
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
  }
}

export function normalizeSpeechRecognitionError(error: string) {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Speech recognition permission was denied in the browser.';
  }

  if (error === 'audio-capture') {
    return 'The browser could not access an active microphone.';
  }

  if (error === 'network') {
    return 'Browser speech recognition network error.';
  }

  if (error === 'no-speech') {
    return 'No speech detected yet.';
  }

  return `Browser speech recognition error: ${error}`;
}

export function browserSpeechUsesSystemInput() {
  return true;
}
