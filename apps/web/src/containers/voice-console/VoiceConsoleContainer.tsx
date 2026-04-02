import {
  Suspense,
  startTransition,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { MobileDock } from './components/MobileDock';
import { ScreenSkeleton } from './components/ScreenSkeleton';
import { SettingsDrawer } from './components/SettingsDrawer';
import { SidebarNav } from './components/SidebarNav';
import { ToastViewport } from './components/ToastViewport';
import { TopBar } from './components/TopBar';
import { buildNavigationHints, getSuggestedScreen, getVoiceState, mergeUniqueMessages } from './lib/helpers';
import type {
  AppSettings,
  AssistantProviderId,
  ApprovalHistoryEntry,
  ApprovalRequiredResponse,
  AudioState,
  ChatStreamEvent,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  ConsolePreferences,
  MessageEntry,
  ScreenId,
  StatusResponse,
  SystemResponse,
  ReplyResponse,
  VoiceCommandOption,
  VoiceCommandResolveResponse,
  VoiceNarrationMode,
  VoiceSettings,
  VoiceSessionState,
  VoiceSettingsResponse
} from './lib/types';
import type { DesktopRuntimeStatus } from '../../desktop-shell';
import { OperatorConsoleApiService } from '../../services/api/OperatorConsoleApiService';
import { OnboardingScreen } from './components/OnboardingScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { TerminalScreen } from './components/TerminalScreen';
import { ComingSoonScreen } from './components/ComingSoonScreen';
import { ShellScreen } from './components/ShellScreen';
import { VoiceScreen } from './components/VoiceScreen';
import { WorkspaceScreen } from './components/WorkspaceScreen';
import {
  createBrowserSpeechRecognition,
  normalizeSpeechRecognitionError,
  readBrowserAudioSnapshot,
  supportsBrowserSpeechRecognition,
  type BrowserSpeechRecognition
} from './lib/browser-voice';
import {
  computeTimeDomainRms,
  desktopVadConfig,
  getEffectiveEndpointDelayMs,
  smoothRms
} from './lib/endpointing';
import { downmixChannels, encodePcm16Wav, mergePcmChunks } from './lib/pcm-audio';
import { splitSpeechIntoChunks } from './lib/speech-chunks';
import { createVoiceLatencyTrace, type VoiceLatencyTrace } from './lib/voice-latency';

function getApiBaseUrl() {
  return window.desktopShell?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8787';
}

function getApiAuthToken() {
  return window.desktopShell?.apiAuthToken ?? import.meta.env.VITE_LOCAL_API_AUTH_TOKEN ?? null;
}

interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  detail: string;
}

const consolePreferencesStorageKey = 'voice-codex-local.console-preferences';
const appThemeStorageKey = 'voice-codex-local.app-theme';

const defaultConsolePreferences: ConsolePreferences = {
  defaultScreen: 'voice',
  transcriptDensity: 'comfortable',
  motionMode: 'full'
};

const defaultSilenceWindowMs = 800;
const RATE_LIMIT_COOLDOWN_MS = 15_000;
const MAX_VOICE_ACTIVITY_ITEMS = 5;
const NARRATION_COOLDOWN_MS = 2600;
const TYPING_TICK_MS = 24;
const UI_CUE_GAIN = 0.028;
const DESKTOP_CAPTURE_PREROLL_MS = 900;
const STREAMED_TTS_START_DELAY_MS = 1400;
const BARGE_IN_ARM_DELAY_MS = 900;
const STREAMED_TTS_MIN_CHUNKS = 2;
const STREAMED_TTS_MIN_CHARS = 120;

type UiCueKind = 'turn_end' | 'session_end';

function getDesktopVadTuning(settings: VoiceSettings | null | undefined) {
  const noiseMode = settings?.noiseMode ?? 'focused';

  if (noiseMode === 'noisy_room') {
    return {
      minSpeechMs: 280,
      smoothingFactor: 0.44,
      startThreshold: 0.032,
      sustainThreshold: 0.021,
      ambientMultiplier: 2.5,
      ambientPadding: 0.008
    };
  }

  if (noiseMode === 'normal') {
    return {
      minSpeechMs: desktopVadConfig.minSpeechMs,
      smoothingFactor: desktopVadConfig.smoothingFactor,
      startThreshold: desktopVadConfig.startThreshold,
      sustainThreshold: desktopVadConfig.sustainThreshold,
      ambientMultiplier: 2.2,
      ambientPadding: 0.007
    };
  }

  return {
    minSpeechMs: 170,
    smoothingFactor: 0.3,
    startThreshold: 0.021,
    sustainThreshold: 0.014,
    ambientMultiplier: 1.95,
    ambientPadding: 0.004
  };
}

function getDesktopAudioConstraints(settings: VoiceSettings | null | undefined): MediaTrackConstraints {
  const noiseMode = settings?.noiseMode ?? 'focused';

  if (noiseMode === 'noisy_room') {
    return {
      channelCount: 1,
      noiseSuppression: true,
      autoGainControl: false,
      echoCancellation: true,
      sampleRate: 16000
    };
  }

  if (noiseMode === 'normal') {
    return {
      channelCount: 1,
      noiseSuppression: true,
      autoGainControl: true,
      echoCancellation: false,
      sampleRate: 16000
    };
  }

  return {
    channelCount: 1,
    noiseSuppression: true,
    autoGainControl: true,
    echoCancellation: true,
    sampleRate: 16000
  };
}

function getActiveProviderName(status: StatusResponse | null) {
  return status?.assistantProviders.activeProvider?.name ?? 'Assistant';
}

function getActiveProviderShortName(status: StatusResponse | null) {
  return status?.assistantProviders.activeProvider?.id === 'claude' ? 'Claude Code' : 'Codex';
}

function extractErrorKind(error: unknown): string {
  if (error instanceof Error && 'errorKind' in error) {
    return String((error as { errorKind?: string }).errorKind ?? 'unknown');
  }
  if (error instanceof Error && 'kind' in error) {
    return String((error as { kind?: string }).kind ?? 'unknown');
  }
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/rate.?limit|429|quota|throttl/i.test(message)) return 'rate_limit';
  if (/not logged in|auth|unauthorized|401|403|session/i.test(message)) return 'auth';
  if (/timeout|econnrefused|econnreset|network/i.test(message)) return 'service';
  return 'unknown';
}

function getFriendlyErrorMessage(error: unknown): string {
  if (error instanceof Error && 'friendlyMessage' in error) {
    const friendlyMessage = (error as { friendlyMessage?: unknown }).friendlyMessage;
    if (typeof friendlyMessage === 'string' && friendlyMessage.trim()) {
      return friendlyMessage;
    }
  }
  const kind = extractErrorKind(error);
  if (kind === 'rate_limit') return 'The active assistant is rate limited right now. Give it a moment and try again.';
  if (kind === 'auth') return 'The active assistant session needs reconnecting. Run the login command to continue.';
  if (kind === 'service') return 'The active assistant is not responding right now. Check your connection and try again.';

  const raw = error instanceof Error ? error.message : String(error);
  if (raw.length > 120 || raw.includes('Command failed:') || raw.includes('--print') || raw.includes('--allowedTools')) {
    return 'Something went wrong with the request. Check the error details in the voice panel.';
  }
  return raw;
}

function playUiCue(kind: UiCueKind) {
  if (typeof window === 'undefined') {
    return;
  }

  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const audioContext = new AudioContextCtor();
  const gainNode = audioContext.createGain();
  gainNode.connect(audioContext.destination);
  gainNode.gain.value = UI_CUE_GAIN;

  const startAt = audioContext.currentTime + 0.01;
  const tones =
    kind === 'turn_end'
      ? [
          { frequency: 720, duration: 0.08, offset: 0 },
          { frequency: 920, duration: 0.11, offset: 0.09 }
        ]
      : [
          { frequency: 560, duration: 0.1, offset: 0 },
          { frequency: 420, duration: 0.16, offset: 0.11 }
        ];

  for (const tone of tones) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = tone.frequency;
    oscillator.connect(gainNode);
    oscillator.start(startAt + tone.offset);
    oscillator.stop(startAt + tone.offset + tone.duration);
  }

  const totalDuration = tones[tones.length - 1]!.offset + tones[tones.length - 1]!.duration + 0.06;
  window.setTimeout(() => {
    void audioContext.close().catch(() => undefined);
  }, Math.ceil(totalDuration * 1000));
}

export function VoiceConsoleContainer() {
  const service = useMemo(
    () => new OperatorConsoleApiService(getApiBaseUrl(), getApiAuthToken()),
    []
  );
  const COMMAND_KEYWORDS = /\b(init|initialize|model|models|switch|set|change|use|status|session|config|configured|active|list|show|current|which|what'?s)\b/i;
  const MAX_COMMAND_WORDS = 20;

  function looksLikeVoiceCommand(transcript: string) {
    const wordCount = transcript.split(/\s+/).length;
    return wordCount <= MAX_COMMAND_WORDS && COMMAND_KEYWORDS.test(transcript);
  }

  const isDesktopShell = Boolean(window.desktopShell?.isDesktop);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const desktopDeviceRestartTimeoutRef = useRef<number | null>(null);
  const desktopMediaStreamRef = useRef<MediaStream | null>(null);
  const desktopPcmProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const desktopMuteGainRef = useRef<GainNode | null>(null);
  const desktopPcmChunksRef = useRef<Float32Array[]>([]);
  const desktopCaptureActiveRef = useRef(false);
  const desktopMediaHasSpeechRef = useRef(false);
  const desktopMediaLastSpeechAtRef = useRef(0);
  const desktopSmoothedRmsRef = useRef(0);
  const desktopSpeechAboveThresholdMsRef = useRef(0);
  const desktopAmbientRmsRef = useRef(0);
  const desktopAudioContextRef = useRef<AudioContext | null>(null);
  const desktopAnalyserRef = useRef<AnalyserNode | null>(null);
  const desktopSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const desktopMonitorIntervalRef = useRef<number | null>(null);
  const bargeInStreamRef = useRef<MediaStream | null>(null);
  const bargeInAudioContextRef = useRef<AudioContext | null>(null);
  const bargeInSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bargeInAnalyserRef = useRef<AnalyserNode | null>(null);
  const bargeInIntervalRef = useRef<number | null>(null);
  const bargeInArmTimeoutRef = useRef<number | null>(null);
  const bargeInAboveThresholdMsRef = useRef(0);
  const bargeInAmbientRmsRef = useRef(0);
  const bargeInTriggeredRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAbortRef = useRef<(() => void) | null>(null);
  const playbackRunIdRef = useRef(0);
  const activeVoiceAssistantMessageIdRef = useRef<string | null>(null);
  const narrationUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationCooldownUntilRef = useRef(0);
  const narrationModeRef = useRef<VoiceNarrationMode>('narrated');
  const previousAudibleNarrationModeRef = useRef<VoiceNarrationMode>('narrated');
  const chatStreamAbortRef = useRef<AbortController | null>(null);
  const activeVoiceSessionRef = useRef(false);
  const awaitingVoiceReplyRef = useRef(false);
  const stoppingVoiceSessionRef = useRef(false);
  const restartingRecognitionRef = useRef(false);
  const transcriptDraftRef = useRef('');
  const voiceLatencyTraceRef = useRef<VoiceLatencyTrace | null>(null);
  const rateLimitCooldownUntilRef = useRef(0);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [approvals, setApprovals] = useState<ApprovalHistoryEntry[]>([]);
  const [codexSettings, setCodexSettings] = useState<CodexSettingsResponse | null>(null);
  const [claudeSettings, setClaudeSettings] = useState<ClaudeSettingsResponse | null>(null);
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettingsResponse | null>(null);
  const [textInput, setTextInput] = useState('');
  const [projectInput, setProjectInput] = useState('');
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [activeScreen, setActiveScreen] = useState<ScreenId>('workspace');
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceCommandPicker, setVoiceCommandPicker] = useState<{
    title: string;
    prompt: string;
    options: VoiceCommandOption[];
  } | null>(null);
  const [voiceActivity, setVoiceActivity] = useState<string | null>(null);
  const [recentVoiceActivities, setRecentVoiceActivities] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<ConsolePreferences>(() => loadConsolePreferences());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [typedMessageText, setTypedMessageText] = useState<Record<string, string>>({});
  const [typingTargets, setTypingTargets] = useState<Record<string, string>>({});
  const [spokenReplyPreview, setSpokenReplyPreview] = useState('');
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1);
  const [onboardingSelectedProviderId, setOnboardingSelectedProviderId] =
    useState<AssistantProviderId | null>(null);
  const [preferredTheme, setPreferredTheme] = useState<AppSettings['theme'] | null>(() =>
    loadStoredAppTheme()
  );
  const lastVoicePhaseRef = useRef<string | null>(null);
  const lastVoiceErrorRef = useRef<string | null>(null);

  const assistantReady = Boolean(status?.assistantProviders.activeProvider?.appConnected);
  const appSettings = status?.appSettings ?? null;
  const currentTheme = preferredTheme ?? appSettings?.theme ?? 'dark';
  const effectiveAppSettings = useMemo<AppSettings | null>(
    () => (appSettings ? { ...appSettings, theme: currentTheme } : null),
    [appSettings, currentTheme]
  );
  const codexConnected = Boolean(
    status?.assistantProviders.providers.some((provider) => provider.id === 'codex' && provider.appConnected)
  );
  const voiceState = getVoiceState(status);
  const narrationMode = voiceSettings?.settings.narrationMode ?? 'narrated';
  const deferredMessages = useDeferredValue(messages);
  const renderedMessages = useMemo(
    () =>
      deferredMessages.map((message) =>
        message.role === 'assistant' && typedMessageText[message.id] !== undefined
          ? {
              ...message,
              text: typedMessageText[message.id]
            }
          : message
      ),
    [deferredMessages, typedMessageText]
  );
  const navigationHints = buildNavigationHints(activeScreen, status, deferredMessages);
  const streamingVoiceDraft =
    voiceState === 'speaking' && spokenReplyPreview
      ? spokenReplyPreview
      : activeVoiceAssistantMessageIdRef.current
        ? typedMessageText[activeVoiceAssistantMessageIdRef.current] ??
          status?.voiceSession.liveTranscript ??
          ''
        : status?.voiceSession.liveTranscript ?? '';

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!window.desktopShell) {
      return;
    }

    let active = true;
    void window.desktopShell.getRuntimeStatus().then((nextStatus) => {
      if (active) {
        setDesktopRuntime(nextStatus);
      }
    });

    const unsubscribe = window.desktopShell.subscribeRuntimeStatus((nextStatus) => {
      setDesktopRuntime(nextStatus);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelNarrationPlayback();
      void stopActiveVoiceSession(false);
    };
  }, []);

  useEffect(() => {
    const persistedTheme = appSettings?.theme;
    if (persistedTheme === 'light' || persistedTheme === 'dark') {
      setPreferredTheme(persistedTheme);
    }
  }, [appSettings?.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = currentTheme;
    storeAppTheme(currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    if (assistantReady) {
      return;
    }

    const hasDisplayName = Boolean(status?.appSettings.displayName?.trim());
    setOnboardingStep((current) => {
      if (!hasDisplayName) {
        return current === 1 ? 1 : current;
      }

      return current === 3 ? 3 : 2;
    });
  }, [assistantReady, status?.appSettings.displayName]);

  useEffect(() => {
    let cancelled = false;
    void service.warmVoiceSession().catch((error) => {
      if (!cancelled) {
        console.warn('[voice] background_warmup_failed', error);
      }
    });

    return () => {
      cancelled = true;
      void service.releaseVoiceWarmup().catch((error) => {
        console.warn('[voice] background_warmup_release_failed', error);
      });
    };
  }, [service]);

  useEffect(() => {
    narrationModeRef.current = narrationMode;
    if (narrationMode !== 'muted') {
      previousAudibleNarrationModeRef.current = narrationMode;
      return;
    }

    cancelNarrationPlayback();
  }, [narrationMode]);

  useEffect(() => {
    if (status?.workspace.projectRoot) {
      setProjectInput(status.workspace.projectRoot);
    }
  }, [status?.workspace.projectRoot]);

  useEffect(() => {
    window.localStorage.setItem(consolePreferencesStorageKey, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (!status) {
      return;
    }

    startTransition(() => {
      setActiveScreen((current) => {
        if (!assistantReady) {
          return 'workspace';
        }

        if (current === 'workspace' && status.workspace.projectRoot) {
          return getSuggestedScreen(status, preferences.defaultScreen);
        }

        if (status.pendingApproval) {
          return 'review';
        }

        return current;
      });
    });
  }, [assistantReady, preferences.defaultScreen, status]);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 3200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toasts]);

  useEffect(() => {
    const typingEntries = Object.entries(typingTargets);
    if (typingEntries.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setTypedMessageText((current) => {
        let changed = false;
        const next = { ...current };

        for (const [messageId, targetText] of typingEntries) {
          const currentText = next[messageId] ?? '';
          if (currentText === targetText) {
            continue;
          }

          const step = Math.max(1, Math.ceil((targetText.length - currentText.length) / 12));
          next[messageId] = targetText.slice(0, Math.min(targetText.length, currentText.length + step));
          changed = true;
        }

        return changed ? next : current;
      });
    }, TYPING_TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [typingTargets]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setError('');
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [error]);

  useEffect(() => {
    const phase = status?.voiceSession.phase ?? null;
    const voiceError = status?.voiceSession.error ?? null;

    if (phase === 'listening' && lastVoicePhaseRef.current !== 'listening') {
      pushToast(
        'success',
        'Voice session active',
        isDesktopShell
          ? `${getActiveProviderShortName(status)} is listening through the desktop microphone capture path.`
          : `${getActiveProviderShortName(status)} is listening through the browser voice path.`
      );
    }

    if (phase === 'error' && voiceError && lastVoiceErrorRef.current !== voiceError) {
      pushToast('error', 'Voice session failed', voiceError);
    }

    lastVoicePhaseRef.current = phase;
    lastVoiceErrorRef.current = voiceError;
  }, [isDesktopShell, status?.voiceSession.error, status?.voiceSession.phase]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return;
    }

    const handleDeviceChange = () => {
      if (isDesktopShell) {
        void handleDesktopMediaDeviceChange();
        return;
      }

      void handleBrowserDeviceChange();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [isDesktopShell, voiceSettings?.settings.autoResumeAfterReply, voiceSettings?.settings.silenceWindowMs, voiceSettings?.settings.voiceLocale]);

  async function initialize() {
    setIsInitializing(true);
    await Promise.allSettled([
      refreshStatus(),
      loadSystem(),
      loadLogs(),
      loadApprovals(),
      loadCodexSettings(),
      loadClaudeSettings(),
      loadVoiceSettings()
    ]);
    if (isDesktopShell) {
      await refreshDesktopAudioState();
    } else {
      await refreshBrowserAudioState(false);
    }
    setIsInitializing(false);
  }

  function pushToast(tone: ToastItem['tone'], title: string, detail: string) {
    setToasts((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tone,
        title,
        detail
      }
    ]);
  }

  function dismissToast(toastId: string) {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  async function refreshStatus() {
    try {
      const nextStatus = await service.getStatus();
      setStatus((current) => mergeStatusWithClientVoiceState(current, nextStatus));
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load status.');
      pushToast('error', 'Status refresh failed', 'Unable to reach the local API right now.');
    }
  }

  async function loadSystem() {
    try {
      const nextSystem = await service.getSystem();
      setSystem(nextSystem);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load system data.');
    }
  }

  async function loadLogs() {
    try {
      const body = await service.getLogs();
      setMessages((current) => mergeUniqueMessages(current, body.messages));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load chat logs.');
    }
  }

  async function loadApprovals() {
    try {
      const body = await service.getApprovals();
      setApprovals(body.approvals);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load approvals.');
    }
  }

  async function loadVoiceSettings() {
    try {
      const next = await service.getVoiceSettings();
      setVoiceSettings(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load voice settings.');
    }
  }

  async function handleAppSettingChange<Key extends keyof AppSettings>(
    key: Key,
    value: AppSettings[Key]
  ) {
    if (key === 'theme') {
      setPreferredTheme(value as AppSettings['theme']);
    }

    try {
      const nextSettings = await service.updateAppSettings({
        [key]: value
      } as Partial<AppSettings>);
      setStatus((current) => (current ? { ...current, appSettings: nextSettings } : current));
    } catch (requestError) {
      if (key === 'theme') {
        setPreferredTheme(appSettings?.theme ?? loadStoredAppTheme() ?? 'dark');
      }
      setError(requestError instanceof Error ? requestError.message : 'Unable to save app settings.');
      pushToast('error', 'Settings not saved', 'Your app preferences could not be updated.');
    }
  }

  async function handleOnboardingDisplayNameSubmit(displayName: string) {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      return;
    }

    try {
      setOnboardingStep(2);
      const nextSettings = await service.updateAppSettings({
        displayName: trimmedName
      });
      setStatus((current) => (current ? { ...current, appSettings: nextSettings } : current));

      if (!nextSettings.welcomedAt) {
        const welcomeMessage = `Good to meet you, ${trimmedName}. Let's get your assistant connected.`;
        try {
          await playAssistantReply(welcomeMessage, {
            allowBargeIn: false
          });
        } catch {
          // Continue even if the first-run greeting could not be spoken.
        }

        const welcomedSettings = await service.updateAppSettings({
          welcomedAt: new Date().toISOString()
        });
        setStatus((current) => (current ? { ...current, appSettings: welcomedSettings } : current));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save your name.');
      pushToast('error', 'Welcome setup failed', 'VOCOD could not save your first-run profile yet.');
    }
  }

  async function loadCodexSettings() {
    try {
      const next = await service.getCodexSettings();
      setCodexSettings(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load model override settings.');
    }
  }

  async function loadClaudeSettings() {
    try {
      const next = await service.getClaudeSettings();
      setClaudeSettings(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load Claude model settings.');
    }
  }

  function abortActiveChatStream() {
    chatStreamAbortRef.current?.abort();
    chatStreamAbortRef.current = null;
  }

  async function streamChatMessage(
    message: string,
    source: 'voice' | 'text',
    options: {
      voiceTurnId?: string;
      onStarted?: (event: Extract<ChatStreamEvent, { type: 'started' }>) => void;
      onDelta?: (event: Extract<ChatStreamEvent, { type: 'delta' }>) => void;
      onActivity?: (event: Extract<ChatStreamEvent, { type: 'activity' }>) => void;
    } = {}
  ): Promise<ReplyResponse | ApprovalRequiredResponse> {
    abortActiveChatStream();
    const abortController = new AbortController();
    chatStreamAbortRef.current = abortController;
    let result: ReplyResponse | ApprovalRequiredResponse | null = null;

    try {
      try {
        await service.streamMessage(
          message,
          source,
          (event) => {
            if (event.type === 'started') {
              setMessages((current) =>
                mergeUniqueMessages(current, [event.userMessage, event.assistantMessage])
              );
              setTypingTargets((current) => ({
                ...current,
                [event.assistantMessage.id]: event.assistantMessage.text
              }));
              setTypedMessageText((current) => ({
                ...current,
                [event.assistantMessage.id]: current[event.assistantMessage.id] ?? ''
              }));
              options.onStarted?.(event);
              return;
            }

            if (event.type === 'delta') {
              setMessages((current) => mergeUniqueMessages(current, [event.assistantMessage]));
              setTypingTargets((current) => ({
                ...current,
                [event.assistantMessage.id]: event.assistantMessage.text
              }));
              options.onDelta?.(event);
              return;
            }

            if (event.type === 'activity') {
              options.onActivity?.(event);
              return;
            }

            if (event.type === 'completed') {
              result = event.result;
              setMessages((current) =>
                mergeUniqueMessages(current, [event.result.userMessage, event.result.assistantMessage])
              );
              setTypingTargets((current) => ({
                ...current,
                [event.result.assistantMessage.id]: event.result.assistantMessage.text
              }));
              return;
            }

            throw new Error(event.error);
          },
          {
            signal: abortController.signal,
            voiceTurnId: options.voiceTurnId
          }
        );
      } catch (streamError) {
        if (abortController.signal.aborted) {
          throw streamError;
        }
        console.warn('[chat][stream] stream failed, falling back to batch', streamError);
      }

      if (!result) {
        const batchResult = await service.sendMessage(message, source, options.voiceTurnId);
        setMessages((current) =>
          mergeUniqueMessages(current, [batchResult.userMessage, batchResult.assistantMessage])
        );
        setTypingTargets((current) => {
          const next = { ...current };
          delete next[batchResult.assistantMessage.id];
          return next;
        });
        setTypedMessageText((current) => {
          const next = { ...current };
          delete next[batchResult.assistantMessage.id];
          return next;
        });
        return batchResult;
      }

      return result;
    } finally {
      if (chatStreamAbortRef.current === abortController) {
        chatStreamAbortRef.current = null;
      }
    }
  }

  function handlePreferenceChange<Key extends keyof ConsolePreferences>(
    key: Key,
    value: ConsolePreferences[Key]
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function handleSaveProject() {
    if (!projectInput.trim()) {
      return;
    }

    setBusyLabel('Saving workspace boundary...');
    try {
      const response = await service.setProjectRoot(projectInput);
      setStatus((current) => (current ? { ...current, workspace: response.workspace } : current));
      await refreshStatus();
      pushToast('success', 'Workspace updated', 'Project boundary saved successfully.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save project root.');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleBrowseProjectFolder() {
    if (!window.desktopShell?.pickProjectFolder) {
      setError('Desktop folder picker is unavailable right now. Restart the desktop app and try again.');
      return;
    }

    try {
      const selectedFolder = await window.desktopShell.pickProjectFolder();
      if (selectedFolder) {
        setProjectInput(selectedFolder);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to open the folder picker.'
      );
    }
  }

  async function handleWriteAccess(enabled: boolean) {
    setBusyLabel(enabled ? 'Enabling approval-gated write mode...' : 'Revoking write mode...');
    try {
      const response = await service.setWriteAccess(enabled);
      setStatus((current) => (current ? { ...current, workspace: response.workspace } : current));
      await refreshStatus();
      pushToast(
        'info',
        enabled ? 'Write mode enabled' : 'Write mode revoked',
        enabled
          ? `${getActiveProviderShortName(status)} can now propose edits that still require explicit approval.`
          : 'The console is back in advisory read-only mode.'
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to change write access.');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleClearChat() {
    setBusyLabel('Clearing conversation history...');
    try {
      await stopActiveVoiceSession(false);
      await service.clearLogs();
      setMessages([]);
      setTypingTargets({});
      setTypedMessageText({});
      activeVoiceAssistantMessageIdRef.current = null;
      await refreshStatus();
      await loadApprovals();
      pushToast('success', 'Chat cleared', 'Conversation history was removed from the active session.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to clear chat.');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleDisconnect() {
    const activeProviderId = status?.assistantProviders.activeProviderId;
    if (!activeProviderId) {
      return;
    }
    const activeProviderName = getActiveProviderShortName(status);
    setBusyLabel(`Disconnecting ${activeProviderName}...`);
    try {
      await stopActiveVoiceSession(false);
      await service.disconnectProvider(activeProviderId);
      setMessages([]);
      setTypingTargets({});
      setTypedMessageText({});
      activeVoiceAssistantMessageIdRef.current = null;
      await Promise.all([refreshStatus(), loadSystem()]);
      pushToast('info', `${activeProviderName} disconnected`, 'The app-level connection was removed.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to disconnect ${activeProviderName}.`);
    } finally {
      setBusyLabel('');
    }
  }

  async function handleStartVoice() {
    setBusyLabel('Starting voice session...');
    let backendVoiceStarted = false;
    try {
      clearVoiceActivity();
      const audio = isDesktopShell
        ? await refreshDesktopAudioState(false)
        : await refreshBrowserAudioState(true);
      if (!audio.available) {
        throw new Error(audio.error ?? 'Voice capture is not available right now.');
      }
      activeVoiceSessionRef.current = true;
      awaitingVoiceReplyRef.current = false;
      stoppingVoiceSessionRef.current = false;
      startTransition(() => {
        setActiveScreen('voice');
      });
      patchVoiceSession({
        active: true,
        phase: 'starting',
        liveTranscript: '',
        error: null,
        silenceWindowMs: voiceSettings?.settings.silenceWindowMs ?? defaultSilenceWindowMs,
        transport: isDesktopShell ? 'desktop-media' : 'browser-webspeech'
      });
      const warmupPromise = service.startVoiceSession();
      backendVoiceStarted = true;
      if (isDesktopShell) {
        await startDesktopVoiceCapture();
      } else {
        await startBrowserRecognition();
      }
      await warmupPromise;
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === 'AbortError') {
        return;
      }
      cancelAssistantPlayback();
      activeVoiceSessionRef.current = false;
      awaitingVoiceReplyRef.current = false;
      stoppingVoiceSessionRef.current = false;
      voiceLatencyTraceRef.current?.finish('error', {
        stage: 'capture',
        error: requestError instanceof Error ? requestError.message : 'Unable to start voice chat.'
      });
      voiceLatencyTraceRef.current = null;
      if (backendVoiceStarted) {
        await stopBackendVoiceSession();
      }
      patchVoiceSession({
        active: false,
        phase: 'error',
        liveTranscript: '',
        error: requestError instanceof Error ? requestError.message : 'Unable to start voice chat.',
        transport: isDesktopShell ? 'desktop-media' : 'browser-webspeech'
      });
      setError(requestError instanceof Error ? requestError.message : 'Unable to start voice chat.');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleStopVoice() {
    setBusyLabel('Ending voice session...');
    try {
      cancelNarrationPlayback();
      await stopActiveVoiceSession();
      playUiCue('session_end');
      pushToast('info', 'Voice session ended', 'Continuous voice loop has been stopped.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to stop voice chat.');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleApprove() {
    if (!status?.pendingApproval) {
      return;
    }

    setBusyLabel('Applying approved changes...');
    try {
      const result = await service.approveChange(status.pendingApproval.id);
      setMessages((current) => [...current, result.assistantMessage]);
      await Promise.all([refreshStatus(), loadApprovals(), loadLogs()]);
      pushToast('success', 'Changes approved', `${getActiveProviderShortName(status)} applied the approved diff to the workspace.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to approve changes.');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleReject() {
    if (!status?.pendingApproval) {
      return;
    }

    setBusyLabel('Rejecting pending changes...');
    try {
      const result = await service.rejectChange(status.pendingApproval.id);
      setMessages((current) => [...current, result.assistantMessage]);
      await Promise.all([refreshStatus(), loadApprovals(), loadLogs()]);
      pushToast('info', 'Changes rejected', 'Pending write request was declined.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to reject changes.');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingTurn) {
      return;
    }

    const nextMessage = textInput.trim();
    if (!nextMessage) {
      return;
    }

    const previousText = textInput;
    setTextInput('');
    setIsSubmittingTurn(true);
    setBusyLabel('Generating reply...');
    clearVoiceActivity();
    try {
      const result = await streamChatMessage(nextMessage, 'text');
      await Promise.all([refreshStatus(), loadApprovals()]);
      startTransition(() => {
        setActiveScreen(result.type === 'approval_required' ? 'review' : 'terminal');
      });
    } catch (requestError) {
      setTextInput(previousText);
      setError(requestError instanceof Error ? requestError.message : 'Unable to send text message.');
    } finally {
      setIsSubmittingTurn(false);
      setBusyLabel('');
    }
  }

  async function handleVoiceSettingChange(
    key: keyof VoiceSettings,
    value: VoiceSettings[keyof VoiceSettings]
  ) {
    if (!voiceSettings) {
      return;
    }

    const optimisticSettings: VoiceSettingsResponse = {
      ...voiceSettings,
      settings: {
        ...voiceSettings.settings,
        [key]: value
      }
    };

    setVoiceSettings(optimisticSettings);
    if (key === 'narrationMode' && value !== 'muted') {
      previousAudibleNarrationModeRef.current = value as VoiceNarrationMode;
    }
    if (key === 'narrationMode' && value === 'muted') {
      cancelAssistantPlayback();
      cancelNarrationPlayback();
    }

    try {
      const next = await service.updateVoiceSettings({
        [key]: value
      } as Partial<VoiceSettings>);
      setVoiceSettings(next);
      if (key === 'silenceWindowMs') {
        patchVoiceSession({
          silenceWindowMs: next.settings.silenceWindowMs
        });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save voice settings.');
      pushToast('error', 'Settings not saved', 'Voice preferences could not be updated.');
      await loadVoiceSettings();
    }
  }

  async function handleCodexSettingChange(
    key: keyof CodexSettingsResponse['settings'],
    value: CodexSettingsResponse['settings'][keyof CodexSettingsResponse['settings']]
  ) {
    if (!codexSettings) {
      return;
    }

    const optimisticSettings: CodexSettingsResponse = {
      ...codexSettings,
      settings: {
        ...codexSettings.settings,
        [key]: value
      }
    };
    setCodexSettings(optimisticSettings);

    try {
      const next = await service.updateCodexSettings({
        [key]: value
      });
      setCodexSettings(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save model override settings.');
      pushToast('error', 'Model overrides not saved', 'Codex preferences could not be updated.');
      await loadCodexSettings();
    }
  }

  async function handleClaudeSettingChange(
    key: keyof ClaudeSettingsResponse['settings'],
    value: ClaudeSettingsResponse['settings'][keyof ClaudeSettingsResponse['settings']]
  ) {
    if (!claudeSettings) {
      return;
    }

    const optimisticSettings: ClaudeSettingsResponse = {
      ...claudeSettings,
      settings: {
        ...claudeSettings.settings,
        [key]: value
      }
    };
    setClaudeSettings(optimisticSettings);

    try {
      const next = await service.updateClaudeSettings({
        [key]: value
      });
      setClaudeSettings(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save Claude model settings.');
      pushToast('error', 'Claude model not saved', 'Claude preferences could not be updated.');
      await loadClaudeSettings();
    }
  }

  async function handleProviderChange(providerId: AssistantProviderId) {
    setBusyLabel(`Switching to ${providerId === 'claude' ? 'Claude Code' : 'Codex'}...`);
    try {
      const assistantProviders = await service.setActiveProvider(providerId);
      setStatus((current) =>
        current
          ? {
              ...current,
              assistantProviders
            }
          : current
      );
      await Promise.all([refreshStatus(), loadSystem()]);
      pushToast(
        'success',
        'Provider switched',
        `${assistantProviders.activeProvider?.name ?? 'Assistant'} is now active.`
      );
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to switch provider.';
      setError(message);
      pushToast('error', 'Provider switch failed', message);
    } finally {
      setBusyLabel('');
    }
  }

  async function handleProviderConnect(providerId: AssistantProviderId) {
    setBusyLabel(`Connecting ${providerId === 'claude' ? 'Claude Code' : 'Codex'}...`);
    try {
      await service.connectProvider(providerId);
      await Promise.all([refreshStatus(), loadSystem()]);
      pushToast(
        'success',
        'Provider connected',
        `${providerId === 'claude' ? 'Claude Code' : 'Codex'} is now available in this app.`
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Login to this provider first, then connect it here.';
      setError(message);
      pushToast('error', 'Connect failed', message);
    } finally {
      setBusyLabel('');
    }
  }

  async function handleProviderDisconnect(providerId: AssistantProviderId) {
    setBusyLabel(`Disconnecting ${providerId === 'claude' ? 'Claude Code' : 'Codex'}...`);
    try {
      await service.disconnectProvider(providerId);
      setMessages([]);
      await Promise.all([refreshStatus(), loadSystem()]);
      pushToast(
        'info',
        `${providerId === 'claude' ? 'Claude Code' : 'Codex'} disconnected`,
        'The app-level connection has been removed.'
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to disconnect provider.');
    } finally {
      setBusyLabel('');
    }
  }

  async function handleResetApp() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Reset VOCOD completely?\n\nThis clears workspace data, chat history, notes, approvals, settings, and app-connected providers.'
      )
    ) {
      return;
    }

    setBusyLabel('Resetting VOCOD...');
    setError('');

    try {
      cancelAssistantPlayback();
      await service.resetApp();
      setMessages([]);
      setApprovals([]);
      setTypedMessageText({});
      setTypingTargets({});
      setSpokenReplyPreview('');
      setVoiceActivity(null);
      setRecentVoiceActivities([]);
      setProjectInput('');
      setTextInput('');
      setVoiceCommandPicker(null);
      setOnboardingStep(1);
      setOnboardingSelectedProviderId(null);
      setActiveScreen('workspace');
      await Promise.all([initialize(), loadSystem()]);
      pushToast(
        'info',
        'VOCOD reset',
        'All local app data has been cleared. Connect a provider again to continue.'
      );
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to reset VOCOD.';
      setError(message);
      pushToast('error', 'Reset failed', message);
    } finally {
      setBusyLabel('');
    }
  }

  function applyVoiceCommandUi(result: Exclude<VoiceCommandResolveResponse, { status: 'no_match' }>) {
    setMessages((current) =>
      mergeUniqueMessages(current, [result.userMessage, result.assistantMessage])
    );

    if (result.status === 'options_required') {
      setVoiceCommandPicker({
        title: result.commandTitle,
        prompt: result.commandPrompt,
        options: result.options
      });
    } else {
      setVoiceCommandPicker(null);
    }

    if (result.suggestedScreen) {
      startTransition(() => {
        setActiveScreen(result.suggestedScreen as ScreenId);
      });
    }
  }

  async function handleApplyVoiceCommandOption(option: VoiceCommandOption) {
    setBusyLabel('Applying voice command...');
    try {
      const result = await service.applyVoiceCommandAction(option.action);
      setMessages((current) => mergeUniqueMessages(current, [result.assistantMessage]));
      setVoiceCommandPicker(null);
      await loadCodexSettings();
      if (result.suggestedScreen) {
        startTransition(() => {
          setActiveScreen(result.suggestedScreen as ScreenId);
        });
      }
      pushToast('success', 'Voice command applied', result.assistantMessage.text);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to apply voice command.');
      pushToast('error', 'Voice command failed', 'The selected command could not be applied.');
    } finally {
      setBusyLabel('');
    }
  }

  function renderScreen() {
    if (!assistantReady) {
      return (
        <OnboardingScreen
          appSettings={effectiveAppSettings}
          step={onboardingStep}
          selectedProviderId={onboardingSelectedProviderId}
          providers={status?.assistantProviders.providers ?? []}
          onConnectProvider={(providerId) => {
            void handleProviderConnect(providerId);
          }}
          onRefresh={() => {
            void Promise.all([refreshStatus(), loadSystem()]);
          }}
          onSaveDisplayName={(displayName) => {
            void handleOnboardingDisplayNameSubmit(displayName);
          }}
          onSelectProvider={(providerId) => {
            setOnboardingSelectedProviderId(providerId);
          }}
          onContinueToInstructions={() => {
            if (onboardingSelectedProviderId) {
              setOnboardingStep(3);
            }
          }}
          onBackToProviderChoice={() => {
            setOnboardingStep(2);
          }}
          onBackToName={() => {
            setOnboardingStep(1);
          }}
        />
      );
    }

    if (activeScreen === 'workspace') {
      return (
        <WorkspaceScreen
          activeProviderName={getActiveProviderName(status)}
          projectInput={projectInput}
          workspace={status?.workspace ?? null}
          canBrowseProjectFolder={true}
          isResetting={busyLabel === 'Resetting VOCOD...'}
          onProjectInputChange={setProjectInput}
          onBrowseProjectFolder={() => {
            void handleBrowseProjectFolder();
          }}
          onSaveProject={() => void handleSaveProject()}
          onToggleWriteAccess={(enabled) => {
            void handleWriteAccess(enabled);
          }}
          onResetApp={() => {
            void handleResetApp();
          }}
        />
      );
    }

    if (activeScreen === 'voice') {
      return (
        <VoiceScreen
          activeProviderName={getActiveProviderName(status)}
          audio={status?.audio ?? null}
          busyLabel={busyLabel}
          codexSettings={codexSettings}
          showCodexSettings={codexConnected}
          narrationMode={narrationMode}
          recentVoiceActivities={recentVoiceActivities}
          spokenReplyPreview={spokenReplyPreview}
          streamedTranscriptOverride={streamingVoiceDraft}
          voiceActivity={voiceActivity}
          voiceSettings={voiceSettings}
          voiceSession={status?.voiceSession ?? null}
          voiceState={voiceState}
          pendingCommandTitle={voiceCommandPicker?.title ?? null}
          pendingCommandPrompt={voiceCommandPicker?.prompt ?? null}
          pendingCommandOptions={voiceCommandPicker?.options ?? []}
          onApplyCommandOption={(option) => {
            void handleApplyVoiceCommandOption(option);
          }}
          onDismissCommandOptions={() => {
            setVoiceCommandPicker(null);
          }}
          onToggleMute={() => {
            void toggleVoiceMute();
          }}
          onStart={() => {
            void handleStartVoice();
          }}
          onStop={() => {
            void handleStopVoice();
          }}
        />
      );
    }

    if (activeScreen === 'review') {
      return (
        <ReviewScreen
          assistantLabel={getActiveProviderName(status)}
          pendingApproval={status?.pendingApproval ?? null}
          lastDiff={status?.lastDiff ?? null}
          approvalHistory={approvals}
          onApprove={() => {
            void handleApprove();
          }}
          onReject={() => {
            void handleReject();
          }}
        />
      );
    }

    if (activeScreen === 'shell') {
      return <ShellScreen cwd={status?.workspace.projectRoot ?? null} theme={currentTheme} />;
    }

    if (activeScreen === 'notes') {
      return (
        <ComingSoonScreen
          icon="📝"
          title="Meeting notes and engineering decisions"
          subtitle="Notes"
          description="Capture meeting notes, engineering decisions, action items, and code context summaries. Search and recall past conversations with voice."
          version="Coming in v1.2"
        />
      );
    }

    if (activeScreen === 'vibemusic') {
      return (
        <ComingSoonScreen
          icon="🎵"
          title="Coding session ambiance"
          subtitle="VibeMusic"
          description="Personalized music and ambient recommendations to keep you in flow during long coding sessions. Session-aware and taste-adaptive."
          version="Coming in v2.0"
        />
      );
    }

    return (
      <TerminalScreen
        active={activeScreen === 'terminal'}
        assistantLabel={getActiveProviderName(status)}
        density={preferences.transcriptDensity}
        disabled={isSubmittingTurn}
        messages={renderedMessages}
        textInput={textInput}
        voiceActive={Boolean(status?.voiceSession.active)}
        onTextInputChange={setTextInput}
        onStartVoice={() => {
          void handleStartVoice();
        }}
        onSubmit={(event) => {
          void handleTextSubmit(event);
        }}
      />
    );
  }

  function patchAudio(nextAudio: Partial<AudioState>) {
    setStatus((current) =>
      current
        ? {
            ...current,
            audio: {
              ...current.audio,
              ...nextAudio,
              lastCheckedAt: new Date().toISOString()
            }
          }
        : current
    );
  }

  function patchVoiceSession(nextVoiceSession: Partial<VoiceSessionState>) {
    setStatus((current) =>
      current
        ? {
            ...current,
            voiceSession: {
              ...current.voiceSession,
              ...nextVoiceSession
            }
          }
        : current
    );
  }

  async function stopBackendVoiceSession() {
    try {
      await service.stopVoiceSession();
    } catch (requestError) {
      console.warn('[voice] backend_session_stop_failed', requestError);
    }
  }

  async function refreshDesktopAudioState(requestPermission = false) {
    const snapshot = await readBrowserAudioSnapshot(requestPermission);
    patchAudio({
      platform: 'darwin',
      available: snapshot.available,
      inputDeviceLabel: snapshot.inputDeviceLabel,
      outputDeviceLabel: null,
      transcriptionEngine:
        snapshot.available && isDesktopShell
          ? 'Desktop media capture + STT provider'
          : 'Unavailable',
      speechEngine: 'Kokoro / Browser fallback',
      error: snapshot.error
    });

    return snapshot;
  }

  async function refreshBrowserAudioState(requestPermission: boolean) {
    const browserSupported = supportsBrowserSpeechRecognition();
    const snapshot = browserSupported
      ? await readBrowserAudioSnapshot(requestPermission)
      : {
          available: false,
          inputDeviceLabel: null,
          error: 'Browser speech recognition is not supported in this browser.'
        };

    patchAudio({
      platform: 'browser',
      available: browserSupported && snapshot.available,
      inputDeviceLabel: snapshot.inputDeviceLabel,
      outputDeviceLabel: null,
      transcriptionEngine: browserSupported ? 'Web Speech API' : 'Unavailable',
      speechEngine: 'TTS Provider / Browser Fallback',
      error: snapshot.error
    });

    return {
      available: browserSupported && snapshot.available,
      inputDeviceLabel: snapshot.inputDeviceLabel,
      error: snapshot.error
    };
  }

  async function stopActiveVoiceSession(showIdle = true) {
    if (isDesktopShell) {
      await stopDesktopVoiceSession(showIdle);
      return;
    }

    await stopBrowserVoiceSession(showIdle);
  }

  async function startDesktopVoiceCapture() {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof AudioContext === 'undefined'
    ) {
      throw new Error('Desktop media capture is unavailable in this app runtime.');
    }

    if (desktopCaptureActiveRef.current) {
      await cancelDesktopPcmCapture('device_restart');
    } else {
      releaseDesktopMediaResources();
    }
    transcriptDraftRef.current = '';
    voiceLatencyTraceRef.current = createVoiceLatencyTrace('desktop-media');
    voiceLatencyTraceRef.current.mark('capture_started');
    const nextAudio = await refreshDesktopAudioState(true);
    if (!nextAudio.available) {
      throw new Error(nextAudio.error ?? 'Desktop microphone capture is unavailable right now.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getDesktopAudioConstraints(voiceSettings?.settings),
      video: false
    });

    const audioContext = new AudioContext();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const muteGain = audioContext.createGain();
    analyser.fftSize = 2048;
    sourceNode.connect(analyser);
    sourceNode.connect(processor);
    processor.connect(muteGain);
    muteGain.gain.value = 0;
    muteGain.connect(audioContext.destination);

    desktopMediaStreamRef.current = stream;
    desktopPcmProcessorRef.current = processor;
    desktopMuteGainRef.current = muteGain;
    desktopAudioContextRef.current = audioContext;
    desktopSourceNodeRef.current = sourceNode;
    desktopAnalyserRef.current = analyser;
    desktopPcmChunksRef.current = [];
    desktopCaptureActiveRef.current = true;
    desktopMediaHasSpeechRef.current = false;
    desktopMediaLastSpeechAtRef.current = Date.now();
    desktopSmoothedRmsRef.current = 0;
    desktopSpeechAboveThresholdMsRef.current = 0;
    desktopAmbientRmsRef.current = 0;
    stoppingVoiceSessionRef.current = false;

    processor.onaudioprocess = (event) => {
      if (!desktopCaptureActiveRef.current) {
        return;
      }

      const channelData: Float32Array[] = [];
      for (let index = 0; index < event.inputBuffer.numberOfChannels; index += 1) {
        channelData.push(event.inputBuffer.getChannelData(index));
      }

      const monoChunk = downmixChannels(channelData);
      if (monoChunk.length > 0) {
        desktopPcmChunksRef.current.push(monoChunk);
        trimDesktopPreSpeechBuffer(audioContext.sampleRate);
      }
    };

    processor.addEventListener('error', () => {
      const message = 'Desktop PCM capture failed.';
      console.error('[voice][desktop-media] pcm_capture_failed', message);
      pushToast('error', 'Desktop voice capture failed', message);
      patchVoiceSession({
        active: false,
        phase: 'error',
        liveTranscript: '',
        error: message,
        transport: 'desktop-media'
      });
      void stopDesktopVoiceSession(false);
    });

    patchVoiceSession({
      active: true,
      phase: 'listening',
      liveTranscript: '',
      error: null,
      silenceWindowMs: voiceSettings?.settings.silenceWindowMs ?? defaultSilenceWindowMs,
      transport: 'desktop-media'
    });

    startDesktopSilenceMonitor();
  }

  async function finalizeDesktopPcmCapture() {
    if (!desktopCaptureActiveRef.current) {
      return;
    }

    desktopCaptureActiveRef.current = false;
    const sampleRate = desktopAudioContextRef.current?.sampleRate ?? 48_000;
    const chunks = desktopPcmChunksRef.current;
    const hadSpeech = desktopMediaHasSpeechRef.current;
    releaseDesktopMediaResources();

    const samples = mergePcmChunks(chunks);
    const audioBytes = encodePcm16Wav(samples, sampleRate);
    const audioBlob = new Blob([audioBytes], { type: 'audio/wav' });

    if (
      !activeVoiceSessionRef.current ||
      awaitingVoiceReplyRef.current ||
      !hadSpeech ||
      audioBlob.size === 0
    ) {
      voiceLatencyTraceRef.current?.finish('cancelled', {
        hadSpeech,
        audioBytes: audioBlob.size
      });
      voiceLatencyTraceRef.current = null;
      patchVoiceSession({
        active: activeVoiceSessionRef.current,
        phase: activeVoiceSessionRef.current ? 'listening' : 'idle',
        liveTranscript: '',
        error: null,
        transport: 'desktop-media'
      });
      return;
    }

    voiceLatencyTraceRef.current?.mark('capture_stopped', {
      audioBytes: audioBlob.size,
      mimeType: 'audio/wav',
      sampleRate
    });
    void transcribeDesktopVoiceAudio(audioBlob, 'audio/wav');
  }

  async function cancelDesktopPcmCapture(reason: 'device_restart' | 'session_stopped') {
    if (!desktopCaptureActiveRef.current) {
      return;
    }

    desktopCaptureActiveRef.current = false;
    const sampleRate = desktopAudioContextRef.current?.sampleRate ?? 48_000;
    const hadSpeech = desktopMediaHasSpeechRef.current;
    const samples = mergePcmChunks(desktopPcmChunksRef.current);
    const audioBytes = encodePcm16Wav(samples, sampleRate);
    releaseDesktopMediaResources();

    voiceLatencyTraceRef.current?.finish('cancelled', {
      reason,
      hadSpeech,
      audioBytes: audioBytes.byteLength
    });
    voiceLatencyTraceRef.current = null;
  }

  async function stopDesktopVoiceSession(showIdle = true, notifyBackend = true) {
    abortActiveChatStream();
    activeVoiceSessionRef.current = false;
    awaitingVoiceReplyRef.current = false;
    restartingRecognitionRef.current = false;
    stoppingVoiceSessionRef.current = true;
    transcriptDraftRef.current = '';
    clearCurrentlySpokenText();
    clearSilenceTimer();
    cancelAssistantPlayback();
    cancelNarrationPlayback();
    clearVoiceActivity();
    if (desktopDeviceRestartTimeoutRef.current !== null) {
      window.clearTimeout(desktopDeviceRestartTimeoutRef.current);
      desktopDeviceRestartTimeoutRef.current = null;
    }
    await cancelDesktopPcmCapture('session_stopped');
    releaseDesktopMediaResources();

    if (showIdle) {
      patchVoiceSession({
        active: false,
        phase: 'idle',
        liveTranscript: '',
        error: null,
        transport: 'desktop-media'
      });
    }

    if (notifyBackend) {
      await stopBackendVoiceSession();
    }
  }

  async function handleDesktopMediaDeviceChange() {
    if (desktopDeviceRestartTimeoutRef.current !== null) {
      window.clearTimeout(desktopDeviceRestartTimeoutRef.current);
    }

    desktopDeviceRestartTimeoutRef.current = window.setTimeout(() => {
      void (async () => {
        const previousLabel = status?.audio.inputDeviceLabel ?? null;
        const nextAudio = await refreshDesktopAudioState(false);

        if (nextAudio.inputDeviceLabel && nextAudio.inputDeviceLabel !== previousLabel) {
          pushToast('info', 'Input device updated', `Switched to ${nextAudio.inputDeviceLabel}.`);
        }

        if (activeVoiceSessionRef.current && !awaitingVoiceReplyRef.current) {
          patchVoiceSession({
            active: true,
            phase: 'starting',
            liveTranscript: '',
            error: null,
            transport: 'desktop-media'
          });
          await startDesktopVoiceCapture();
        }
      })();
    }, 900);
  }

  function startDesktopSilenceMonitor() {
    if (desktopMonitorIntervalRef.current !== null) {
      window.clearInterval(desktopMonitorIntervalRef.current);
    }

    desktopMonitorIntervalRef.current = window.setInterval(() => {
      const analyser = desktopAnalyserRef.current;

      if (!analyser || !desktopCaptureActiveRef.current) {
        return;
      }

      const samples = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(samples);
      const rms = computeTimeDomainRms(samples);
      const now = Date.now();
      const vadTuning = getDesktopVadTuning(voiceSettings?.settings);
      const smoothedRms = smoothRms(
        desktopSmoothedRmsRef.current,
        rms,
        vadTuning.smoothingFactor
      );
      desktopSmoothedRmsRef.current = smoothedRms;
      const ambient = desktopAmbientRmsRef.current;
      if (!desktopMediaHasSpeechRef.current || smoothedRms < vadTuning.sustainThreshold) {
        desktopAmbientRmsRef.current =
          ambient === 0 ? smoothedRms : ambient + (smoothedRms - ambient) * 0.08;
      }
      const adaptiveStartThreshold = Math.max(
        vadTuning.startThreshold,
        desktopAmbientRmsRef.current * vadTuning.ambientMultiplier + vadTuning.ambientPadding
      );
      const adaptiveSustainThreshold = Math.max(
        vadTuning.sustainThreshold,
        desktopAmbientRmsRef.current * (vadTuning.ambientMultiplier - 0.45) + vadTuning.ambientPadding * 0.7
      );

      if (smoothedRms >= adaptiveStartThreshold) {
        desktopSpeechAboveThresholdMsRef.current += 140;
      } else {
        desktopSpeechAboveThresholdMsRef.current = 0;
      }

      if (
        !desktopMediaHasSpeechRef.current &&
        desktopSpeechAboveThresholdMsRef.current >= vadTuning.minSpeechMs
      ) {
        desktopMediaHasSpeechRef.current = true;
        desktopMediaLastSpeechAtRef.current = now;
      }

      if (desktopMediaHasSpeechRef.current && smoothedRms >= adaptiveSustainThreshold) {
        desktopMediaLastSpeechAtRef.current = now;
      }

      const silenceWindowMs = voiceSettings?.settings.silenceWindowMs ?? defaultSilenceWindowMs;
      const effectiveSilenceWindowMs = getEffectiveEndpointDelayMs(silenceWindowMs);
      if (
        desktopMediaHasSpeechRef.current &&
        now - desktopMediaLastSpeechAtRef.current >= effectiveSilenceWindowMs
      ) {
        console.info('[voice][desktop-media] silence_detected', {
          silenceWindowMs,
          effectiveSilenceWindowMs,
          transport: 'desktop-media'
        });
        void finalizeDesktopPcmCapture();
      }
    }, 140);
  }

  function releaseDesktopMediaResources() {
    if (desktopMonitorIntervalRef.current !== null) {
      window.clearInterval(desktopMonitorIntervalRef.current);
      desktopMonitorIntervalRef.current = null;
    }

    const processor = desktopPcmProcessorRef.current;
    if (processor) {
      processor.disconnect();
      processor.onaudioprocess = null;
    }
    desktopPcmProcessorRef.current = null;

    desktopMuteGainRef.current?.disconnect();
    desktopMuteGainRef.current = null;

    desktopMediaStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    desktopMediaStreamRef.current = null;

    desktopSourceNodeRef.current?.disconnect();
    desktopSourceNodeRef.current = null;
    desktopAnalyserRef.current = null;

    if (desktopAudioContextRef.current) {
      void desktopAudioContextRef.current.close().catch(() => undefined);
      desktopAudioContextRef.current = null;
    }

    desktopPcmChunksRef.current = [];
    desktopCaptureActiveRef.current = false;
    desktopMediaHasSpeechRef.current = false;
    desktopSmoothedRmsRef.current = 0;
    desktopSpeechAboveThresholdMsRef.current = 0;
    desktopAmbientRmsRef.current = 0;
  }

  function trimDesktopPreSpeechBuffer(sampleRate: number) {
    if (desktopMediaHasSpeechRef.current) {
      return;
    }

    const maxFrames = Math.max(1, Math.round((sampleRate * DESKTOP_CAPTURE_PREROLL_MS) / 1000));
    let totalFrames = 0;

    for (let index = desktopPcmChunksRef.current.length - 1; index >= 0; index -= 1) {
      totalFrames += desktopPcmChunksRef.current[index]?.length ?? 0;
      if (totalFrames > maxFrames) {
        desktopPcmChunksRef.current.splice(0, index);
        return;
      }
    }
  }

  async function transcribeDesktopVoiceAudio(audioBlob: Blob, mimeType: string) {
    const trace = voiceLatencyTraceRef.current;
    patchVoiceSession({
      active: true,
      phase: 'thinking',
      liveTranscript: '',
      error: null,
      transport: 'desktop-media'
    });
    setBusyLabel('Transcribing...');

    try {
      trace?.mark('stt_request_started', {
        audioBytes: audioBlob.size,
        mimeType
      });
      const transcription = await service.transcribeVoiceAudio(audioBlob, mimeType, trace?.id);
      trace?.mark('stt_request_completed', {
        provider: transcription.provider,
        fallbackUsed: transcription.fallbackUsed,
        transcriptLength: transcription.transcript.length
      });
      if (transcription.fallbackUsed) {
        const warningDetail = transcription.warnings.join(' ') || 'Primary STT failed and fallback provider took over.';
        console.warn('[voice][stt] fallback_used', {
          provider: transcription.provider,
          warnings: transcription.warnings
        });
        pushToast('info', `STT fallback active: ${transcription.provider}`, warningDetail);
      }

      const transcript = transcription.transcript.trim();
      if (!transcript) {
        awaitingVoiceReplyRef.current = false;
        patchVoiceSession({
          active: true,
          phase: 'listening',
          liveTranscript: '',
          error: 'No transcript was produced for that voice turn.',
          transport: 'desktop-media'
        });
        if (activeVoiceSessionRef.current) {
          await startDesktopVoiceCapture();
        }
        return;
      }

      transcriptDraftRef.current = transcript;
      await finalizeDesktopVoiceTurn();
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Unable to transcribe desktop audio.';
      console.error('[voice][stt] transcription_failed', message);
      pushToast('error', 'Voice transcription failed', message);
      activeVoiceSessionRef.current = false;
      awaitingVoiceReplyRef.current = false;
      await stopBackendVoiceSession();
      trace?.finish('error', {
        stage: 'stt',
        error: message
      });
      voiceLatencyTraceRef.current = null;
      patchVoiceSession({
        active: false,
        phase: 'error',
        liveTranscript: '',
        error: message,
        transport: 'desktop-media'
      });
      setError(message);
    } finally {
      setBusyLabel('');
    }
  }

  async function handleBrowserDeviceChange() {
    const previousLabel = status?.audio.inputDeviceLabel ?? null;
    const nextAudio = await refreshBrowserAudioState(true);

    if (!nextAudio.available) {
      if (activeVoiceSessionRef.current) {
        await stopBrowserVoiceSession(false);
        patchVoiceSession({
          active: false,
          phase: 'error',
          liveTranscript: '',
          error: nextAudio.error ?? 'No microphone detected.',
          transport: 'browser-webspeech'
        });
      }
      return;
    }

    if (nextAudio.inputDeviceLabel && nextAudio.inputDeviceLabel !== previousLabel) {
      pushToast('info', 'Input device updated', `Switched to ${nextAudio.inputDeviceLabel}.`);
    }

    if (activeVoiceSessionRef.current && !awaitingVoiceReplyRef.current) {
      restartBrowserRecognition();
    }
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  async function stopBrowserVoiceSession(showIdle = true, notifyBackend = true) {
    abortActiveChatStream();
    activeVoiceSessionRef.current = false;
    awaitingVoiceReplyRef.current = false;
    restartingRecognitionRef.current = false;
    stoppingVoiceSessionRef.current = true;
    transcriptDraftRef.current = '';
    clearCurrentlySpokenText();
    clearSilenceTimer();
    cancelAssistantPlayback();
    cancelNarrationPlayback();
    clearVoiceActivity();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (recognition) {
      recognition.abort();
    }

    if (showIdle) {
      patchVoiceSession({
        active: false,
        phase: 'idle',
        liveTranscript: '',
        error: null,
        transport: 'browser-webspeech'
      });
    }

    voiceLatencyTraceRef.current?.finish('cancelled', {
      reason: 'session_stopped'
    });
    voiceLatencyTraceRef.current = null;

    if (notifyBackend) {
      await stopBackendVoiceSession();
    }
  }

  async function handleRateLimitVoiceExit(
    transport: 'browser-webspeech' | 'desktop-media',
    message: string
  ) {
    patchVoiceSession({
      active: false,
      phase: 'error',
      liveTranscript: '',
      error: message,
      transport
    });
    setError(message);

    if (shouldSpeakReplies()) {
      try {
        await playAssistantReply(message, {
          allowBargeIn: false
        });
      } catch {
        // Preserve the terminal error state even if TTS fails.
      }
    }

    if (transport === 'desktop-media') {
      await stopDesktopVoiceSession(false, false);
      return;
    }

    await stopBrowserVoiceSession(false, false);
  }

  function cancelAssistantPlayback() {
    clearCurrentlySpokenText();
    stopBargeInMonitor();
    cancelNarrationPlayback();
    playbackRunIdRef.current += 1;
    const abortPlayback = playbackAbortRef.current;
    playbackAbortRef.current = null;
    abortPlayback?.();

    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current.src = '';
      playbackAudioRef.current = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  async function startBargeInMonitor() {
    stopBargeInMonitor();

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof AudioContext === 'undefined'
    ) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getDesktopAudioConstraints(voiceSettings?.settings),
        video: false
      });
      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      sourceNode.connect(analyser);

      bargeInStreamRef.current = stream;
      bargeInAudioContextRef.current = audioContext;
      bargeInSourceNodeRef.current = sourceNode;
      bargeInAnalyserRef.current = analyser;
      bargeInTriggeredRef.current = false;
      bargeInAboveThresholdMsRef.current = 0;
      bargeInAmbientRmsRef.current = 0;

      bargeInArmTimeoutRef.current = window.setTimeout(() => {
        bargeInArmTimeoutRef.current = null;
        bargeInIntervalRef.current = window.setInterval(() => {
          const activeAnalyser = bargeInAnalyserRef.current;
          if (!activeAnalyser || bargeInTriggeredRef.current) {
            return;
          }

          const samples = new Uint8Array(activeAnalyser.fftSize);
          activeAnalyser.getByteTimeDomainData(samples);

          let sumSquares = 0;
          for (const sample of samples) {
            const normalized = (sample - 128) / 128;
            sumSquares += normalized * normalized;
          }

          const rms = Math.sqrt(sumSquares / samples.length);
          const vadTuning = getDesktopVadTuning(voiceSettings?.settings);

          const ambient = bargeInAmbientRmsRef.current;
          if (ambient === 0) {
            bargeInAmbientRmsRef.current = rms;
          } else {
            bargeInAmbientRmsRef.current = ambient + (rms - ambient) * 0.08;
          }

          const adaptiveThreshold = Math.max(
            vadTuning.startThreshold * 1.75,
            bargeInAmbientRmsRef.current * (vadTuning.ambientMultiplier + 1) + vadTuning.ambientPadding + 0.006,
            0.042
          );
          const isSpeechSpike = rms > adaptiveThreshold;

          if (isSpeechSpike) {
            bargeInAboveThresholdMsRef.current += 80;
          } else {
            bargeInAboveThresholdMsRef.current = Math.max(0, bargeInAboveThresholdMsRef.current - 40);
          }

          if (bargeInAboveThresholdMsRef.current >= vadTuning.minSpeechMs + 260) {
            void handleAssistantBargeIn();
          }
        }, 80);
      }, BARGE_IN_ARM_DELAY_MS);
    } catch (error) {
      console.warn('[voice][barge-in] monitor_unavailable', error);
      stopBargeInMonitor();
    }
  }

  function stopBargeInMonitor() {
    if (bargeInArmTimeoutRef.current !== null) {
      window.clearTimeout(bargeInArmTimeoutRef.current);
      bargeInArmTimeoutRef.current = null;
    }

    if (bargeInIntervalRef.current !== null) {
      window.clearInterval(bargeInIntervalRef.current);
      bargeInIntervalRef.current = null;
    }

    bargeInSourceNodeRef.current?.disconnect();
    bargeInSourceNodeRef.current = null;
    bargeInAnalyserRef.current = null;

    bargeInStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    bargeInStreamRef.current = null;

    if (bargeInAudioContextRef.current) {
      void bargeInAudioContextRef.current.close().catch(() => undefined);
      bargeInAudioContextRef.current = null;
    }

    bargeInAboveThresholdMsRef.current = 0;
    bargeInAmbientRmsRef.current = 0;
    bargeInTriggeredRef.current = false;
  }

  async function handleAssistantBargeIn() {
    if (bargeInTriggeredRef.current || !activeVoiceSessionRef.current) {
      return;
    }

    bargeInTriggeredRef.current = true;
    console.info('[voice][barge-in] detected', {
      transport: isDesktopShell ? 'desktop-media' : 'browser-webspeech'
    });
    pushToast('info', 'Reply interrupted', 'Listening again.');
    cancelAssistantPlayback();
    clearVoiceActivity();
    voiceLatencyTraceRef.current?.finish('cancelled', { reason: 'barge_in' });
    voiceLatencyTraceRef.current = null;
    awaitingVoiceReplyRef.current = false;

    try {
      await service.interruptVoiceSession();
    } catch (requestError) {
      console.warn('[voice][barge-in] backend_interrupt_failed', requestError);
    }

    if (!activeVoiceSessionRef.current) {
      return;
    }

    patchVoiceSession({
      active: true,
      phase: isDesktopShell ? 'starting' : 'listening',
      liveTranscript: '',
      error: null,
      transport: isDesktopShell ? 'desktop-media' : 'browser-webspeech'
    });

    if (isDesktopShell) {
      await startDesktopVoiceCapture();
      return;
    }

    await startBrowserRecognition();
  }

  function restartBrowserRecognition() {
    clearSilenceTimer();
    transcriptDraftRef.current = '';
    restartingRecognitionRef.current = true;

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      return;
    }

    void startBrowserRecognition();
  }

  async function startBrowserRecognition() {
    if (!activeVoiceSessionRef.current || awaitingVoiceReplyRef.current) {
      return;
    }

    const recognition = createBrowserSpeechRecognition();
    if (!voiceLatencyTraceRef.current) {
      voiceLatencyTraceRef.current = createVoiceLatencyTrace('browser-webspeech');
      voiceLatencyTraceRef.current.mark('capture_started');
    }
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = voiceSettings?.settings.voiceLocale ?? 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      patchVoiceSession({
        active: true,
        phase: 'listening',
        liveTranscript: '',
        error: null,
        silenceWindowMs: voiceSettings?.settings.silenceWindowMs ?? defaultSilenceWindowMs,
        transport: 'browser-webspeech'
      });
    };

    recognition.onresult = (event) => {
      let transcript = '';

      for (const result of Array.from(event.results)) {
        const candidate = result[0]?.transcript?.trim() ?? '';
        if (candidate) {
          transcript += `${candidate} `;
        }
      }

      transcript = transcript.trim();
      transcriptDraftRef.current = transcript;

      patchVoiceSession({
        active: true,
        phase: 'listening',
        liveTranscript: transcript,
        error: null,
        transport: 'browser-webspeech'
      });

      clearSilenceTimer();
      if (transcript) {
        const effectiveSilenceWindowMs = getEffectiveEndpointDelayMs(
          voiceSettings?.settings.silenceWindowMs ?? defaultSilenceWindowMs
        );
        silenceTimerRef.current = window.setTimeout(() => {
          void finalizeBrowserVoiceTurn();
        }, effectiveSilenceWindowMs);
      }
    };

    recognition.onerror = (event) => {
      if (stoppingVoiceSessionRef.current) {
        return;
      }

      if (event.error === 'aborted' && restartingRecognitionRef.current) {
        return;
      }

      if (event.error === 'no-speech') {
        return;
      }

      activeVoiceSessionRef.current = false;
      awaitingVoiceReplyRef.current = false;
      clearSilenceTimer();
      voiceLatencyTraceRef.current?.finish('error', {
        stage: 'capture',
        error: normalizeSpeechRecognitionError(event.error)
      });
      voiceLatencyTraceRef.current = null;
      void stopBackendVoiceSession();
      patchVoiceSession({
        active: false,
        phase: 'error',
        liveTranscript: '',
        error: normalizeSpeechRecognitionError(event.error),
        transport: 'browser-webspeech'
      });
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (stoppingVoiceSessionRef.current) {
        stoppingVoiceSessionRef.current = false;
        return;
      }

      if (restartingRecognitionRef.current) {
        restartingRecognitionRef.current = false;
        if (activeVoiceSessionRef.current) {
          void startBrowserRecognition();
        }
        return;
      }

      if (awaitingVoiceReplyRef.current) {
        return;
      }

      if (activeVoiceSessionRef.current) {
        void startBrowserRecognition();
      }
    };

    recognition.start();
  }

  async function finalizeBrowserVoiceTurn() {
    clearSilenceTimer();

    const transcript = transcriptDraftRef.current.trim();
    if (!transcript || awaitingVoiceReplyRef.current) {
      return;
    }

    if (Date.now() < rateLimitCooldownUntilRef.current) {
      const remaining = Math.ceil((rateLimitCooldownUntilRef.current - Date.now()) / 1000);
      pushToast('info', 'Rate limit cooldown', `Try again in ${remaining} seconds.`);
      return;
    }

    let trace = voiceLatencyTraceRef.current;
    if (!trace) {
      trace = createVoiceLatencyTrace('browser-webspeech');
      trace.mark('capture_started');
      voiceLatencyTraceRef.current = trace;
    }
    trace.mark('capture_stopped', {
      transcriptLength: transcript.length
    });
    awaitingVoiceReplyRef.current = true;
    transcriptDraftRef.current = '';
    clearVoiceActivity();

    patchVoiceSession({
      active: true,
      phase: 'thinking',
      liveTranscript: transcript,
      lastTranscript: transcript,
      error: null,
      transport: 'browser-webspeech'
    });

    recognitionRef.current?.stop();

    setBusyLabel('Transcribing...');
    playUiCue('turn_end');
    patchVoiceSession({
      active: true,
      phase: 'thinking',
      liveTranscript: '',
      error: null,
      transport: 'browser-webspeech'
    });

    try {
      if (looksLikeVoiceCommand(transcript)) {
        trace.mark('command_route_started', {
          transcriptLength: transcript.length,
          localCommandCheck: true
        });
        const commandResult = await service.resolveVoiceCommand(transcript);
        if (commandResult.status !== 'no_match') {
          const speakCommandReply = shouldSpeakReplies();
          trace.mark('command_route_completed', {
            resultType: commandResult.status,
            assistantLength: commandResult.assistantMessage.text.length,
            localCommand: true
          });
          applyVoiceCommandUi(commandResult);
          await Promise.all([refreshStatus(), loadApprovals(), loadCodexSettings(), loadClaudeSettings()]);

          patchVoiceSession({
            active: true,
            phase: speakCommandReply ? 'speaking' : 'thinking',
            liveTranscript: '',
            error: null,
            transport: 'browser-webspeech'
          });
          if (speakCommandReply) {
            await playAssistantReply(commandResult.assistantMessage.text, {
              allowBargeIn: false
            });
          }
          awaitingVoiceReplyRef.current = false;

          const shouldResume =
            commandResult.status === 'handled' &&
            voiceSettings?.settings.autoResumeAfterReply &&
            commandResult.suggestedScreen !== 'workspace' &&
            commandResult.suggestedScreen !== 'review';
          if (!shouldResume) {
            await stopBrowserVoiceSession();
            return;
          }

          patchVoiceSession({
            active: true,
            phase: 'listening',
            liveTranscript: '',
            error: null,
            transport: 'browser-webspeech'
          });
          await startBrowserRecognition();
          return;
        }
      }

      setBusyLabel('Generating reply...');
      trace.mark('chat_request_started', {
        transcriptLength: transcript.length
      });
      const speakReplies = shouldSpeakReplies();
      const streamedPlayback = speakReplies
        ? createStreamedAssistantReplyPlayer('browser-webspeech', {
            allowBargeIn: true
          })
        : null;
      const result = await streamChatMessage(transcript, 'voice', {
        voiceTurnId: trace.id,
        onStarted: (event) => {
          activeVoiceAssistantMessageIdRef.current = event.assistantMessage.id;
        },
        onDelta: (event) => {
          patchVoiceSession({
            active: true,
            phase: 'thinking',
            liveTranscript: event.assistantMessage.text,
            error: null,
            transport: 'browser-webspeech'
          });
          streamedPlayback?.append(event.assistantMessage.text);
        },
        onActivity: (event) => {
          applyVoiceActivity(event.activity);
        }
      });
      trace.mark('chat_request_completed', {
        resultType: result.type,
        assistantLength: result.assistantMessage.text.length
      });
      await Promise.all([refreshStatus(), loadApprovals()]);

      setBusyLabel(speakReplies ? 'Speaking...' : 'Wrapping up...');
      if (result.type === 'approval_required') {
        streamedPlayback?.cancel();
        patchVoiceSession({
          active: true,
          phase: speakReplies ? 'speaking' : 'thinking',
          liveTranscript: '',
          error: null,
          transport: 'browser-webspeech'
        });
        if (speakReplies) {
          await playAssistantReply(result.assistantMessage.text);
        }
        startTransition(() => {
          setActiveScreen('review');
        });
        await stopBrowserVoiceSession();
        return;
      }

      startTransition(() => {
        setActiveScreen('voice');
      });

      const playback = streamedPlayback
        ? await streamedPlayback.complete(result.assistantMessage.text)
        : await completeMutedStreamedReply('browser-webspeech', result.assistantMessage.text);
      activeVoiceAssistantMessageIdRef.current = null;

      if (playback.interrupted) {
        return;
      }

      if (!activeVoiceSessionRef.current) {
        awaitingVoiceReplyRef.current = false;
        return;
      }

      awaitingVoiceReplyRef.current = false;
      if (!voiceSettings?.settings.autoResumeAfterReply) {
        await stopBrowserVoiceSession();
        return;
      }

      patchVoiceSession({
        active: true,
        phase: 'listening',
        liveTranscript: '',
        error: null,
        transport: 'browser-webspeech'
      });
      await startBrowserRecognition();
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === 'AbortError') {
        return;
      }
      cancelAssistantPlayback();
      const errorKind = extractErrorKind(requestError);
      const friendlyMessage = getFriendlyErrorMessage(requestError);
      if (errorKind === 'rate_limit') {
        rateLimitCooldownUntilRef.current = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      }
      activeVoiceSessionRef.current = false;
      awaitingVoiceReplyRef.current = false;
      await stopBackendVoiceSession();
      trace.finish('error', {
        stage: 'chat',
        errorKind,
        error: requestError instanceof Error ? requestError.message : 'Unable to send voice turn.'
      });
      voiceLatencyTraceRef.current = null;
      activeVoiceAssistantMessageIdRef.current = null;
      if (errorKind === 'rate_limit') {
        await handleRateLimitVoiceExit('browser-webspeech', friendlyMessage);
        return;
      }
      patchVoiceSession({
        active: false,
        phase: 'error',
        liveTranscript: '',
        error: friendlyMessage,
        transport: 'browser-webspeech'
      });
      setError(friendlyMessage);
      if (shouldSpeakReplies()) {
        void playAssistantReply(friendlyMessage);
      }
    } finally {
      setBusyLabel('');
    }
  }

  async function finalizeDesktopVoiceTurn() {
    const transcript = transcriptDraftRef.current.trim();
    if (!transcript || awaitingVoiceReplyRef.current) {
      return;
    }

    if (Date.now() < rateLimitCooldownUntilRef.current) {
      const remaining = Math.ceil((rateLimitCooldownUntilRef.current - Date.now()) / 1000);
      pushToast('info', 'Rate limit cooldown', `Try again in ${remaining} seconds.`);
      return;
    }

    let trace = voiceLatencyTraceRef.current;
    if (!trace) {
      trace = createVoiceLatencyTrace('desktop-media');
      trace.mark('capture_started');
      trace.mark('capture_stopped');
      voiceLatencyTraceRef.current = trace;
    }
    awaitingVoiceReplyRef.current = true;
    transcriptDraftRef.current = '';
    clearVoiceActivity();

    patchVoiceSession({
      active: true,
      phase: 'thinking',
      liveTranscript: transcript,
      lastTranscript: transcript,
      error: null,
      transport: 'desktop-media'
    });

    setBusyLabel('Transcribing...');
    playUiCue('turn_end');

    try {
      if (looksLikeVoiceCommand(transcript)) {
        trace.mark('command_route_started', {
          transcriptLength: transcript.length,
          localCommandCheck: true
        });
        const commandResult = await service.resolveVoiceCommand(transcript);
        if (commandResult.status !== 'no_match') {
          const speakCommandReply = shouldSpeakReplies();
          trace.mark('command_route_completed', {
            resultType: commandResult.status,
            assistantLength: commandResult.assistantMessage.text.length,
            localCommand: true
          });
          applyVoiceCommandUi(commandResult);
          await Promise.all([refreshStatus(), loadApprovals(), loadCodexSettings(), loadClaudeSettings()]);

          patchVoiceSession({
            active: true,
            phase: speakCommandReply ? 'speaking' : 'thinking',
            liveTranscript: '',
            error: null,
            transport: 'desktop-media'
          });
          if (speakCommandReply) {
            await playAssistantReply(commandResult.assistantMessage.text);
          }
          awaitingVoiceReplyRef.current = false;

          const shouldResume =
            commandResult.status === 'handled' &&
            voiceSettings?.settings.autoResumeAfterReply &&
            commandResult.suggestedScreen !== 'workspace' &&
            commandResult.suggestedScreen !== 'review';
          if (!shouldResume) {
            await stopDesktopVoiceSession();
            return;
          }

          patchVoiceSession({
            active: true,
            phase: 'starting',
            liveTranscript: '',
            error: null,
            transport: 'desktop-media'
          });
          await startDesktopVoiceCapture();
          return;
        }
      }

      setBusyLabel('Generating reply...');
      trace.mark('chat_request_started', {
        transcriptLength: transcript.length
      });
      const speakReplies = shouldSpeakReplies();
      const streamedPlayback = speakReplies
        ? createStreamedAssistantReplyPlayer('desktop-media', {
            allowBargeIn: true,
            startDelayMs: STREAMED_TTS_START_DELAY_MS
          })
        : null;
      const result = await streamChatMessage(transcript, 'voice', {
        voiceTurnId: trace.id,
        onStarted: (event) => {
          activeVoiceAssistantMessageIdRef.current = event.assistantMessage.id;
        },
        onDelta: (event) => {
          patchVoiceSession({
            active: true,
            phase: 'thinking',
            liveTranscript: event.assistantMessage.text,
            error: null,
            transport: 'desktop-media'
          });
          streamedPlayback?.append(event.assistantMessage.text);
        },
        onActivity: (event) => {
          applyVoiceActivity(event.activity);
        }
      });
      trace.mark('chat_request_completed', {
        resultType: result.type,
        assistantLength: result.assistantMessage.text.length
      });
      await Promise.all([refreshStatus(), loadApprovals()]);

      setBusyLabel(speakReplies ? 'Speaking...' : 'Wrapping up...');
      if (result.type === 'approval_required') {
        streamedPlayback?.cancel();
        patchVoiceSession({
          active: true,
          phase: speakReplies ? 'speaking' : 'thinking',
          liveTranscript: '',
          error: null,
          transport: 'desktop-media'
        });
        if (speakReplies) {
          await playAssistantReply(result.assistantMessage.text, {
            allowBargeIn: false
          });
        }
        startTransition(() => {
          setActiveScreen('review');
        });
        await stopDesktopVoiceSession();
        return;
      }

      startTransition(() => {
        setActiveScreen('voice');
      });

      const playback = streamedPlayback
        ? await streamedPlayback.complete(result.assistantMessage.text)
        : await completeMutedStreamedReply('desktop-media', result.assistantMessage.text);
      activeVoiceAssistantMessageIdRef.current = null;

      if (playback.interrupted) {
        return;
      }

      if (!activeVoiceSessionRef.current) {
        awaitingVoiceReplyRef.current = false;
        return;
      }

      awaitingVoiceReplyRef.current = false;
      if (!voiceSettings?.settings.autoResumeAfterReply) {
        await stopDesktopVoiceSession();
        return;
      }

      patchVoiceSession({
        active: true,
        phase: 'starting',
        liveTranscript: '',
        error: null,
        transport: 'desktop-media'
      });
      await startDesktopVoiceCapture();
    } catch (requestError) {
      const errorKind = extractErrorKind(requestError);
      const friendlyMessage = getFriendlyErrorMessage(requestError);
      if (errorKind === 'rate_limit') {
        rateLimitCooldownUntilRef.current = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      }
      activeVoiceSessionRef.current = false;
      awaitingVoiceReplyRef.current = false;
      await stopBackendVoiceSession();
      trace.finish('error', {
        stage: 'chat',
        errorKind,
        error: requestError instanceof Error ? requestError.message : 'Unable to send voice turn.'
      });
      voiceLatencyTraceRef.current = null;
      activeVoiceAssistantMessageIdRef.current = null;
      if (errorKind === 'rate_limit') {
        await handleRateLimitVoiceExit('desktop-media', friendlyMessage);
        return;
      }
      patchVoiceSession({
        active: false,
        phase: 'error',
        liveTranscript: '',
        error: friendlyMessage,
        transport: 'desktop-media'
      });
      setError(friendlyMessage);
      if (shouldSpeakReplies()) {
        void playAssistantReply(friendlyMessage, {
          allowBargeIn: false
        });
      }
    } finally {
      setBusyLabel('');
    }
  }

  async function playAssistantReply(
    text: string,
    options: {
      allowBargeIn?: boolean;
    } = {}
  ) {
    if (!shouldSpeakReplies()) {
      voiceLatencyTraceRef.current?.finish('completed', {
        playback: 'muted'
      });
      voiceLatencyTraceRef.current = null;
      return {
        interrupted: false
      };
    }

    const trace = voiceLatencyTraceRef.current;
    const spokenText = createSpeechSafeReply(text);
    const chunks = splitSpeechIntoChunks(spokenText);
    const playbackRunId = beginAssistantPlaybackRun();
    bargeInTriggeredRef.current = false;

    if (chunks.length === 0) {
      trace?.finish('completed', {
        playback: 'empty-reply'
      });
      voiceLatencyTraceRef.current = null;
      return {
        interrupted: false
      };
    }

    try {
      trace?.mark('tts_request_started', {
        textLength: spokenText.length,
        chunkCount: chunks.length
      });
      await playGeneratedSpeechChunks(
        chunks,
        trace ?? undefined,
        playbackRunId,
        Boolean(options.allowBargeIn)
      );
      return {
        interrupted: !isPlaybackRunActive(playbackRunId) || bargeInTriggeredRef.current
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Backend TTS failed before audio playback.';
      console.error('[voice][tts] backend_failed_fallback_to_browser', message);
      pushToast('info', 'Browser voice fallback active', message);
    }

    if (!isPlaybackRunActive(playbackRunId)) {
      trace?.finish('cancelled', { reason: 'playback_run_invalidated' });
      voiceLatencyTraceRef.current = null;
      return {
        interrupted: true
      };
    }

    await playBrowserSpeechSynthesis(
      spokenText,
      trace ?? undefined,
      playbackRunId,
      Boolean(options.allowBargeIn)
    );
    return {
      interrupted: !isPlaybackRunActive(playbackRunId) || bargeInTriggeredRef.current
    };
  }

  function createStreamedAssistantReplyPlayer(
    transport: 'browser-webspeech' | 'desktop-media',
    options: {
      allowBargeIn?: boolean;
      startDelayMs?: number;
    } = {}
  ) {
    const trace = voiceLatencyTraceRef.current ?? undefined;
    const allowBargeIn = Boolean(options.allowBargeIn);
    const startDelayMs = Math.max(0, options.startDelayMs ?? 0);
    const speakAfterAt = Date.now() + startDelayMs;
    const playbackRunId = beginAssistantPlaybackRun();
    const scheduler = createGeneratedAudioScheduler({
      trace,
      playbackRunId,
      allowBargeIn
    });
    const pendingChunks: string[] = [];
    const safeSnapshots = {
      latest: '',
      final: ''
    };
    let enqueuedChunkCount = 0;
    let playedChunkCount = 0;
    let finished = false;
    let playbackPrimed = false;
    let failureMessage: string | null = null;
    let processingPromise: Promise<void> | null = null;
    let wakeProcessor: (() => void) | null = null;

    bargeInTriggeredRef.current = false;

    const notifyProcessor = () => {
      if (wakeProcessor) {
        wakeProcessor();
        wakeProcessor = null;
      }
    };

    const updateQueueFromSnapshot = (snapshotText: string, isFinal: boolean) => {
      const safeText = createSpeechSafeReply(snapshotText);
      safeSnapshots.latest = safeText;
      if (isFinal) {
        safeSnapshots.final = safeText;
      }

      const allChunks = getSpeakableStreamChunks(safeText, isFinal);
      if (
        !playbackPrimed &&
        !isFinal &&
        allChunks.length > 0 &&
        allChunks.length < STREAMED_TTS_MIN_CHUNKS &&
        safeText.length < STREAMED_TTS_MIN_CHARS
      ) {
        return;
      }

      if (allChunks.length > 0 || isFinal) {
        playbackPrimed = true;
      }

      const nextChunks = allChunks.slice(enqueuedChunkCount);
      if (nextChunks.length > 0) {
        pendingChunks.push(...nextChunks);
        enqueuedChunkCount = allChunks.length;
        notifyProcessor();
      }

      if (isFinal) {
        finished = true;
        notifyProcessor();
      }
    };

    const processQueue = async () => {
      if (processingPromise) {
        return processingPromise;
      }

      processingPromise = (async () => {
        while (true) {
          if (!isPlaybackRunActive(playbackRunId)) {
            return;
          }

          if (pendingChunks.length === 0) {
            if (finished || failureMessage) {
              return;
            }

            await new Promise<void>((resolve) => {
              wakeProcessor = resolve;
            });
            continue;
          }

          const chunk = pendingChunks.shift()!;
          try {
            if (playedChunkCount === 0 && Date.now() < speakAfterAt) {
              await new Promise((resolve) => {
                window.setTimeout(resolve, speakAfterAt - Date.now());
              });
              if (!isPlaybackRunActive(playbackRunId)) {
                return;
              }
            }

            if (!trace?.hasMark('tts_request_started')) {
              trace?.mark('tts_request_started', {
                textLength: safeSnapshots.latest.length,
                chunkCount: Math.max(enqueuedChunkCount, 1)
              });
            }

            const preparedChunk = await prepareGeneratedSpeechChunk(
              chunk,
              scheduler,
              trace,
              playedChunkCount === 0 ? 0 : undefined
            );

            setBusyLabel('Speaking...');
            patchVoiceSession({
              active: true,
              phase: 'speaking',
              liveTranscript: safeSnapshots.latest,
              error: null,
              transport
            });

            scheduler.enqueue(preparedChunk.audioBuffer, {
              trace,
              playbackRunId,
              allowBargeIn,
              markPlaybackStart: playedChunkCount === 0,
              chunkIndex: playedChunkCount,
              chunkCount: Math.max(enqueuedChunkCount, playedChunkCount + 1),
              spokenText: chunk
            });
            playedChunkCount += 1;
          } catch (error) {
            failureMessage =
              error instanceof Error
                ? error.message
                : 'Backend TTS failed during streamed assistant playback.';
            return;
          }
        }
      })().finally(() => {
        processingPromise = null;
      });

      return processingPromise;
    };

    return {
      append(snapshotText: string) {
        updateQueueFromSnapshot(snapshotText, false);
        void processQueue();
      },
      cancel() {
        finished = true;
        scheduler.cancel();
        notifyProcessor();
      },
      async complete(finalText: string) {
        updateQueueFromSnapshot(finalText, true);
        await processQueue();
        await scheduler.waitUntilDrained();

        if (!isPlaybackRunActive(playbackRunId) || bargeInTriggeredRef.current) {
          return {
            interrupted: true
          };
        }

        if (failureMessage) {
          console.error('[voice][tts] streamed_backend_failed_fallback_to_browser', failureMessage);
          pushToast('info', 'Browser voice fallback active', failureMessage);

          const remainingText = splitSpeechIntoChunks(safeSnapshots.final)
            .slice(playedChunkCount)
            .join(' ');

          if (remainingText) {
            await playBrowserSpeechSynthesis(remainingText, trace, playbackRunId, allowBargeIn);
          } else {
            trace?.finish('completed', {
              playback: 'generated-audio-stream',
              chunkCount: playedChunkCount
            });
            voiceLatencyTraceRef.current = null;
          }
        } else {
          trace?.finish('completed', {
            playback: 'generated-audio-stream',
            chunkCount: playedChunkCount
          });
          voiceLatencyTraceRef.current = null;
        }

        return {
          interrupted: !isPlaybackRunActive(playbackRunId) || bargeInTriggeredRef.current
        };
      }
    };
  }

  async function playGeneratedSpeechChunks(
    chunks: string[],
    trace: VoiceLatencyTrace | undefined,
    playbackRunId: number,
    allowBargeIn: boolean
  ) {
    const scheduler = createGeneratedAudioScheduler({
      trace,
      playbackRunId,
      allowBargeIn
    });
    let currentChunkIndex = 0;
    let playedChunkCount = 0;
    let nextSynthesisPromise:
      | Promise<Awaited<ReturnType<typeof prepareGeneratedSpeechChunk>>>
      | null = prepareGeneratedSpeechChunk(chunks[currentChunkIndex]!, scheduler, trace, currentChunkIndex);

    while (nextSynthesisPromise) {
      let preparedChunk;
      try {
        preparedChunk = await nextSynthesisPromise;
      } catch (error) {
        if (playedChunkCount > 0 && isPlaybackRunActive(playbackRunId)) {
          await scheduler.waitUntilDrained();
          const remainingText = chunks.slice(currentChunkIndex).join(' ');
          if (remainingText) {
            await playBrowserSpeechSynthesis(remainingText, trace, playbackRunId, allowBargeIn);
            return;
          }
        }
        throw error;
      }
      if (!isPlaybackRunActive(playbackRunId)) {
        scheduler.cancel();
        return;
      }

      currentChunkIndex += 1;
      const hasMoreChunks = currentChunkIndex < chunks.length;

      const nextChunkPromise = hasMoreChunks
        ? prepareGeneratedSpeechChunk(chunks[currentChunkIndex]!, scheduler, trace, currentChunkIndex)
        : null;

      nextSynthesisPromise = nextChunkPromise;

      scheduler.enqueue(preparedChunk.audioBuffer, {
        trace,
        playbackRunId,
        allowBargeIn,
        markPlaybackStart: currentChunkIndex === 1,
        chunkIndex: currentChunkIndex - 1,
        chunkCount: chunks.length,
        spokenText: chunks[currentChunkIndex - 1]!
      });
      playedChunkCount += 1;
    }

    await scheduler.waitUntilDrained();
    if (isPlaybackRunActive(playbackRunId) && !bargeInTriggeredRef.current) {
      trace?.finish('completed', {
        playback: 'generated-audio-sentences',
        chunkCount: playedChunkCount
      });
      voiceLatencyTraceRef.current = null;
    }
  }

  async function synthesizeSpeechChunk(
    text: string,
    trace?: VoiceLatencyTrace,
    chunkIndex?: number
  ) {
    const synthesis = await service.synthesizeSpeech(text, trace?.id);
    if (trace && chunkIndex === 0) {
      trace?.mark('tts_request_completed', {
        provider: synthesis.provider,
        available: synthesis.available,
        mimeType: synthesis.mimeType,
        chunkLength: text.length
      });
    }
    return synthesis;
  }

  async function prepareGeneratedSpeechChunk(
    text: string,
    scheduler: ReturnType<typeof createGeneratedAudioScheduler>,
    trace?: VoiceLatencyTrace,
    chunkIndex?: number
  ) {
    const synthesis = await synthesizeSpeechChunk(text, trace, chunkIndex);
    if (!synthesis.audioBase64) {
      const backendTtsError =
        synthesis.error ?? `Backend TTS provider ${synthesis.provider} was unavailable.`;
      console.warn('[voice][tts] backend_fallback_to_browser', {
        provider: synthesis.provider,
        error: backendTtsError
      });
      pushToast('info', 'Browser voice fallback active', backendTtsError);
      throw new Error(backendTtsError);
    }

    return {
      audioBuffer: await scheduler.decode(synthesis.audioBase64),
      provider: synthesis.provider
    };
  }

  function createGeneratedAudioScheduler(options: {
      trace?: VoiceLatencyTrace;
      playbackRunId: number;
      allowBargeIn: boolean;
    }) {
    if (typeof AudioContext === 'undefined') {
      throw new Error('Web Audio playback is unavailable in this runtime.');
    }

    const audioContext = new AudioContext();
    let scheduledUntil = audioContext.currentTime;
    let startedPlayback = false;
    let startTimer: number | null = null;
    const chunkStartTimers = new Set<number>();
    let lastChunkEnd = Promise.resolve();
    let resolveDrain: (() => void) | null = null;
    const activeSources = new Set<AudioBufferSourceNode>();
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      if (startTimer !== null) {
        window.clearTimeout(startTimer);
        startTimer = null;
      }
      for (const timerId of chunkStartTimers) {
        window.clearTimeout(timerId);
      }
      chunkStartTimers.clear();
      if (playbackAbortRef.current === cancel) {
        playbackAbortRef.current = null;
      }
      clearCurrentlySpokenText();
      if (resolveDrain) {
        resolveDrain();
        resolveDrain = null;
      }
      for (const source of activeSources) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // Ignore stop errors during teardown.
        }
      }
      activeSources.clear();
      void audioContext.close().catch(() => undefined);
    };

    const cancel = () => {
      cleanup();
    };

    playbackAbortRef.current = cancel;

    return {
      async decode(audioBase64: string) {
        if (cleanedUp) {
          throw new Error('scheduler_cancelled');
        }
        const audioBytes = Uint8Array.from(atob(audioBase64), (character) => character.charCodeAt(0));
        const arrayBuffer = audioBytes.buffer.slice(
          audioBytes.byteOffset,
          audioBytes.byteOffset + audioBytes.byteLength
        ) as ArrayBuffer;
        if (audioContext.state === 'suspended') {
          await audioContext.resume().catch(() => undefined);
        }
        if (cleanedUp) {
          throw new Error('scheduler_cancelled');
        }
        const decoded = await audioContext.decodeAudioData(arrayBuffer);
        return trimGeneratedAudioBuffer(audioContext, decoded);
      },
      enqueue(
        audioBuffer: AudioBuffer,
        meta: {
          trace?: VoiceLatencyTrace;
          playbackRunId: number;
          allowBargeIn: boolean;
          markPlaybackStart: boolean;
          chunkIndex: number;
          chunkCount: number;
          spokenText: string;
        }
      ) {
        if (cleanedUp || !isPlaybackRunActive(meta.playbackRunId)) {
          return;
        }

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        const startAt = Math.max(audioContext.currentTime + 0.02, scheduledUntil);
        scheduledUntil = startAt + audioBuffer.duration;

        lastChunkEnd = new Promise<void>((resolve) => {
          resolveDrain = resolve;
          source.onended = () => {
            activeSources.delete(source);
            if (resolveDrain === resolve) {
              resolveDrain = null;
            }
            resolve();
          };
        });

        activeSources.add(source);
        source.start(startAt);
        const chunkStartTimer = window.setTimeout(() => {
          chunkStartTimers.delete(chunkStartTimer);
          if (!cleanedUp && isPlaybackRunActive(meta.playbackRunId)) {
            setCurrentlySpokenText(meta.spokenText);
          }
        }, Math.max(0, (startAt - audioContext.currentTime) * 1000));
        chunkStartTimers.add(chunkStartTimer);

        if (!startedPlayback && meta.markPlaybackStart) {
          startedPlayback = true;
          startTimer = window.setTimeout(() => {
            if (!cleanedUp && isPlaybackRunActive(meta.playbackRunId)) {
              meta.trace?.mark('playback_started', {
                playback: 'generated-audio-sentences',
                chunkCount: meta.chunkCount
              });
              if (meta.allowBargeIn) {
                void startBargeInMonitor();
              }
            }
          }, Math.max(0, (startAt - audioContext.currentTime) * 1000));
        }
      },
      async waitUntilDrained() {
        await lastChunkEnd;
        cleanup();
      },
      cancel
    };
  }

  function trimGeneratedAudioBuffer(audioContext: AudioContext, input: AudioBuffer) {
    const sampleRate = input.sampleRate;
    const maxLeadingTrimFrames = Math.floor(sampleRate * 0.12);
    const maxTrailingTrimFrames = Math.floor(sampleRate * 0.18);
    const threshold = 0.0025;
    let firstFrame = 0;
    let lastFrame = input.length - 1;

    for (let frame = 0; frame < Math.min(input.length, maxLeadingTrimFrames); frame += 1) {
      let frameHasSignal = false;
      for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
        if (Math.abs(input.getChannelData(channel)[frame] ?? 0) > threshold) {
          frameHasSignal = true;
          break;
        }
      }
      if (frameHasSignal) {
        firstFrame = frame;
        break;
      }
    }

    for (let frame = input.length - 1; frame >= Math.max(0, input.length - maxTrailingTrimFrames); frame -= 1) {
      let frameHasSignal = false;
      for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
        if (Math.abs(input.getChannelData(channel)[frame] ?? 0) > threshold) {
          frameHasSignal = true;
          break;
        }
      }
      if (frameHasSignal) {
        lastFrame = frame;
        break;
      }
    }

    if (firstFrame === 0 && lastFrame === input.length - 1) {
      return input;
    }

    const trimmedLength = Math.max(1, lastFrame - firstFrame + 1);
    const trimmed = audioContext.createBuffer(input.numberOfChannels, trimmedLength, sampleRate);
    for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
      const source = input.getChannelData(channel).subarray(firstFrame, lastFrame + 1);
      trimmed.copyToChannel(source, channel, 0);
    }

    return trimmed;
  }

  function playBrowserSpeechSynthesis(
    text: string,
    trace: VoiceLatencyTrace | undefined,
    playbackRunId: number,
    allowBargeIn: boolean
  ) {
    if (!('speechSynthesis' in window)) {
      console.error('[voice][tts] browser_speech_unavailable');
      pushToast(
        'error',
        'Voice playback unavailable',
        'No browser speech fallback is available in this runtime.'
      );
      trace?.finish('error', {
        stage: 'playback',
        playback: 'browser-speech-unavailable'
      });
      voiceLatencyTraceRef.current = null;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      if (!isPlaybackRunActive(playbackRunId)) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      const abortPlayback = () => {
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
        if (playbackAbortRef.current === abortPlayback) {
          playbackAbortRef.current = null;
        }
        resolve();
      };
      playbackAbortRef.current = abortPlayback;
      utterance.onstart = () => {
        setCurrentlySpokenText(text);
        if (!trace || !trace.hasMark('playback_started')) {
          trace?.mark('playback_started', {
            playback: 'browser-speech'
          });
        }
        if (allowBargeIn) {
          void startBargeInMonitor();
        }
      };
      utterance.onend = () => {
        clearCurrentlySpokenText();
        if (playbackAbortRef.current === abortPlayback) {
          playbackAbortRef.current = null;
        }
        trace?.finish('completed', {
          playback: 'browser-speech'
        });
        voiceLatencyTraceRef.current = null;
        resolve();
      };
      utterance.onerror = () => {
        clearCurrentlySpokenText();
        if (playbackAbortRef.current === abortPlayback) {
          playbackAbortRef.current = null;
        }
        console.error('[voice][tts] browser_speech_playback_failed');
        pushToast(
          'error',
          'Browser voice playback failed',
          'The local browser speech fallback could not speak this reply.'
        );
        trace?.finish('error', {
          stage: 'playback',
          playback: 'browser-speech'
        });
        voiceLatencyTraceRef.current = null;
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  function beginAssistantPlaybackRun() {
    cancelAssistantPlayback();
    return playbackRunIdRef.current;
  }

  function isPlaybackRunActive(playbackRunId: number) {
    return playbackRunIdRef.current === playbackRunId;
  }

  function createSpeechSafeReply(text: string) {
    const normalized = text
      .replace(/```[\s\S]*?```/g, ' code block omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^>\s*/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\|/g, ', ')
      .replace(/---+/g, '')
      .replace(/\b\/(?:Users|home|var|tmp|opt|private)(?:\/[^\s,.;:()]+)+/g, 'a local path')
      .replace(/\b(?:[A-Za-z0-9_.-]+\/){2,}[A-Za-z0-9_.-]+\b/g, 'a file path')
      .replace(/[{}[\]<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized || 'The task is complete.';
  }

  function getSpeakableStreamChunks(text: string, isFinal: boolean) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return [];
    }

    if (isFinal) {
      return splitSpeechIntoChunks(normalized);
    }

    let lastBoundaryIndex = -1;
    const boundaryPattern = /[.!?](?=(?:\s|$))/g;
    for (const match of normalized.matchAll(boundaryPattern)) {
      lastBoundaryIndex = match.index ?? lastBoundaryIndex;
    }

    if (lastBoundaryIndex < 0) {
      return [];
    }

    return splitSpeechIntoChunks(normalized.slice(0, lastBoundaryIndex + 1));
  }

  function clearVoiceActivity() {
    setVoiceActivity(null);
    setRecentVoiceActivities([]);
  }

  function setCurrentlySpokenText(text: string) {
    setSpokenReplyPreview(text.trim());
  }

  function clearCurrentlySpokenText() {
    setSpokenReplyPreview('');
  }

  function applyVoiceActivity(activity: string) {
    const trimmed = activity.trim();
    if (!trimmed) {
      return;
    }

    setVoiceActivity(trimmed);
    setRecentVoiceActivities((current) =>
      [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, MAX_VOICE_ACTIVITY_ITEMS)
    );
    maybeNarrateActivity(trimmed);
  }

  function shouldSpeakReplies() {
    return (voiceSettings?.settings.narrationMode ?? 'narrated') !== 'muted';
  }

  function shouldNarrateActivity() {
    return narrationModeRef.current === 'narrated';
  }

  function cancelNarrationPlayback() {
    narrationUtteranceRef.current = null;
    if (narrationAudioRef.current) {
      narrationAudioRef.current.pause();
      narrationAudioRef.current.src = '';
      narrationAudioRef.current = null;
    }
  }

  function maybeNarrateActivity(activity: string) {
    if (
      !shouldNarrateActivity() ||
      playbackAbortRef.current ||
      narrationAudioRef.current ||
      status?.voiceSession.phase === 'speaking'
    ) {
      return;
    }

    const now = Date.now();
    if (now < narrationCooldownUntilRef.current) {
      return;
    }

    const phrase = toNarratedActivityPhrase(activity);
    if (!phrase) {
      return;
    }

    narrationCooldownUntilRef.current = now + NARRATION_COOLDOWN_MS;
    void narrateViaKokoro(phrase);
  }

  async function narrateViaKokoro(phrase: string) {
    try {
      const synthesis = await service.synthesizeSpeech(phrase);
      if (!synthesis.audioBase64 || !synthesis.mimeType || playbackAbortRef.current) {
        return;
      }

      const audioBytes = Uint8Array.from(atob(synthesis.audioBase64), (c) => c.charCodeAt(0));
      const audioBlob = new Blob([audioBytes], { type: synthesis.mimeType });
      const blobUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(blobUrl);
      narrationAudioRef.current = audio;

      audio.onended = () => {
        if (narrationAudioRef.current === audio) {
          narrationAudioRef.current = null;
        }
        URL.revokeObjectURL(blobUrl);
      };
      audio.onerror = () => {
        if (narrationAudioRef.current === audio) {
          narrationAudioRef.current = null;
        }
        URL.revokeObjectURL(blobUrl);
      };
      void audio.play().catch(() => {
        narrationAudioRef.current = null;
        URL.revokeObjectURL(blobUrl);
      });
    } catch {
      narrationAudioRef.current = null;
    }
  }

  function toNarratedActivityPhrase(activity: string) {
    const lower = activity.toLowerCase();
    if (lower.startsWith('reading ')) {
      return `Let me read ${activity.slice('Reading '.length)} first.`;
    }

    if (lower.startsWith('editing ')) {
      return `I found the right spot. Updating ${activity.slice('Editing '.length)} now.`;
    }

    if (lower.startsWith('searching ')) {
      return 'Searching around a bit more for context.';
    }

    if (lower.startsWith('scanning ')) {
      return 'Scanning the related files now.';
    }

    if (lower.startsWith('running ')) {
      return `Running a quick check: ${activity.slice('Running '.length)}.`;
    }

    if (lower.startsWith('planning ')) {
      return 'Let me map out the approach.';
    }

    if (lower.startsWith('thinking ')) {
      return 'Thinking this through out loud.';
    }

    if (lower.startsWith('using ')) {
      return `Using ${activity.slice('Using '.length)} for a quick check.`;
    }

    return activity;
  }

  async function toggleVoiceMute() {
    if (!voiceSettings) {
      return;
    }

    const currentMode = voiceSettings?.settings.narrationMode ?? 'narrated';
    const nextMode =
      currentMode === 'muted' ? previousAudibleNarrationModeRef.current : 'muted';
    await handleVoiceSettingChange('narrationMode', nextMode);
    pushToast(
      'info',
      nextMode === 'muted' ? 'Voice muted' : 'Voice restored',
      nextMode === 'muted'
        ? 'Activity updates and spoken replies are now text-only.'
        : nextMode === 'silent_progress'
          ? 'Progress stays on-screen and final replies will be spoken.'
          : `${getActiveProviderName(status)} will narrate progress again.`
    );
  }

  async function completeMutedStreamedReply(
    transport: 'browser-webspeech' | 'desktop-media',
    finalText: string
  ) {
    clearCurrentlySpokenText();
    patchVoiceSession({
      active: true,
      phase: 'thinking',
      liveTranscript: finalText,
      error: null,
      transport
    });
    voiceLatencyTraceRef.current?.finish('completed', {
      playback: 'muted'
    });
    voiceLatencyTraceRef.current = null;
    return {
      interrupted: false
    };
  }

  return (
    <div className={`app-shell motion-${preferences.motionMode} ${assistantReady ? '' : 'auth-shell'}`}>
      <div className="app-background app-background-one" />
      <div className="app-background app-background-two" />

      {assistantReady ? (
        <SidebarNav
          activeScreen={activeScreen}
          hints={navigationHints}
          onSelect={(screenId) => {
            startTransition(() => {
              setActiveScreen(screenId);
            });
          }}
        />
      ) : null}

      <div className="app-main">
        <TopBar
          status={status}
          system={system}
          desktopRuntime={desktopRuntime}
          displayName={appSettings?.displayName ?? null}
          onboardingStep={assistantReady ? undefined : onboardingStep}
          assistantReady={assistantReady}
          busyLabel={busyLabel}
          error={error}
          onSwitchProvider={(providerId) => {
            void handleProviderChange(providerId);
          }}
          onOpenSettings={() => {
            setSettingsOpen(true);
          }}
          onRefresh={() => {
            void initialize();
          }}
          onDisconnect={() => {
            void handleDisconnect();
          }}
        />
        <main className="screen-frame">
          {isInitializing ? (
            <ScreenSkeleton screenId={activeScreen} />
          ) : (
            <Suspense fallback={<ScreenSkeleton screenId={activeScreen} />}>{renderScreen()}</Suspense>
          )}
        </main>
      </div>

      {assistantReady ? (
        <MobileDock
          activeScreen={activeScreen}
          onSelect={(screenId) => {
            startTransition(() => {
              setActiveScreen(screenId);
            });
          }}
        />
      ) : null}

      <SettingsDrawer
        open={settingsOpen}
        appSettings={effectiveAppSettings}
        preferences={preferences}
        codexSettings={codexSettings}
        claudeSettings={claudeSettings}
        status={status}
        system={system}
        voiceSettings={voiceSettings}
        onAppSettingChange={(key, value) => {
          void handleAppSettingChange(key, value);
        }}
        onPreferenceChange={handlePreferenceChange}
        onVoiceSettingChange={(key, value) => {
          void handleVoiceSettingChange(key, value);
        }}
        onCodexSettingChange={(key, value) => {
          void handleCodexSettingChange(key, value);
        }}
        onClaudeSettingChange={(key, value) => {
          void handleClaudeSettingChange(key, value);
        }}
        onProviderChange={(providerId) => {
          void handleProviderChange(providerId);
        }}
        onProviderDisconnect={(providerId) => {
          void handleProviderDisconnect(providerId);
        }}
        onClose={() => {
          setSettingsOpen(false);
        }}
      />

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      <button
        aria-label={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
        className="floating-theme-toggle"
        onClick={() => {
          void handleAppSettingChange('theme', currentTheme === 'dark' ? 'light' : 'dark');
        }}
        type="button"
      >
        <span aria-hidden="true" className="theme-toggle-icon">
          {currentTheme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2.5V5.25M12 18.75V21.5M21.5 12H18.75M5.25 12H2.5M18.72 5.28L16.78 7.22M7.22 16.78L5.28 18.72M18.72 18.72L16.78 16.78M7.22 7.22L5.28 5.28" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />
            </svg>
          )}
        </span>
      </button>
    </div>
  );
}

function mergeStatusWithClientVoiceState(
  current: StatusResponse | null,
  next: StatusResponse
) {
  if (!current) {
    return next;
  }

  const usesClientVoice =
    current.audio.platform === 'browser' ||
    current.audio.platform === 'darwin' ||
    current.voiceSession.transport === 'browser-webspeech' ||
    current.voiceSession.transport === 'desktop-media';

  if (!usesClientVoice) {
    return next;
  }

  return {
    ...next,
    audio: current.audio,
    voiceSession: current.voiceSession
  };
}

function loadConsolePreferences(): ConsolePreferences {
  if (typeof window === 'undefined') {
    return defaultConsolePreferences;
  }

  const rawValue = window.localStorage.getItem(consolePreferencesStorageKey);
  if (!rawValue) {
    return defaultConsolePreferences;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ConsolePreferences>;
    return {
      defaultScreen:
        parsed.defaultScreen === 'workspace' ||
        parsed.defaultScreen === 'voice' ||
        parsed.defaultScreen === 'terminal'
          ? parsed.defaultScreen
          : defaultConsolePreferences.defaultScreen,
      transcriptDensity:
        parsed.transcriptDensity === 'compact' || parsed.transcriptDensity === 'comfortable'
          ? parsed.transcriptDensity
          : defaultConsolePreferences.transcriptDensity,
      motionMode:
        parsed.motionMode === 'reduced' || parsed.motionMode === 'full'
          ? parsed.motionMode
          : defaultConsolePreferences.motionMode
    };
  } catch {
    return defaultConsolePreferences;
  }
}

function loadStoredAppTheme(): AppSettings['theme'] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(appThemeStorageKey);
  return rawValue === 'light' || rawValue === 'dark' ? rawValue : null;
}

function storeAppTheme(theme: AppSettings['theme']) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(appThemeStorageKey, theme);
}
