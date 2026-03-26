type VoiceTransport = 'desktop-media' | 'browser-webspeech';

interface VoiceLatencySummary {
  turnId: string;
  transport: VoiceTransport;
  status: 'completed' | 'error' | 'cancelled';
  totalMs: number;
  captureToSttRequestMs: number | null;
  sttDurationMs: number | null;
  sttToChatRequestMs: number | null;
  chatDurationMs: number | null;
  replyReadyToTtsStartMs: number | null;
  ttsDurationMs: number | null;
  playbackStartDelayMs: number | null;
  details?: Record<string, unknown>;
}

export class VoiceLatencyTrace {
  readonly id = crypto.randomUUID();
  private readonly startedAt = performance.now();
  private readonly marks = new Map<string, number>();
  private finished = false;

  constructor(private readonly transport: VoiceTransport) {
    this.mark('turn_started');
  }

  mark(stage: string, details?: Record<string, unknown>) {
    const now = performance.now();
    if (this.marks.has(stage)) {
      console.warn('[voice][latency] duplicate mark ignored', { turnId: this.id, stage });
    }
    this.marks.set(stage, now);
    console.info('[voice][latency]', {
      turnId: this.id,
      transport: this.transport,
      stage,
      sinceTurnStartMs: round(now - this.startedAt),
      ...details
    });
  }

  hasMark(stage: string) {
    return this.marks.has(stage);
  }

  finish(status: VoiceLatencySummary['status'], details?: Record<string, unknown>) {
    if (this.finished) {
      console.warn('[voice][latency] finish() called more than once', { turnId: this.id, status });
      return;
    }
    this.finished = true;
    const now = performance.now();
    const summary: VoiceLatencySummary = {
      turnId: this.id,
      transport: this.transport,
      status,
      totalMs: round(now - this.startedAt),
      captureToSttRequestMs: this.durationBetween('capture_stopped', 'stt_request_started'),
      sttDurationMs: this.durationBetween('stt_request_started', 'stt_request_completed'),
      sttToChatRequestMs: this.durationBetween('stt_request_completed', 'chat_request_started'),
      chatDurationMs: this.durationBetween('chat_request_started', 'chat_request_completed'),
      replyReadyToTtsStartMs: this.durationBetween('chat_request_completed', 'tts_request_started'),
      ttsDurationMs: this.durationBetween('tts_request_started', 'tts_request_completed'),
      playbackStartDelayMs: this.durationBetween('tts_request_completed', 'playback_started'),
      details
    };

    console.info('[voice][latency][summary]', summary);
  }

  private durationBetween(start: string, end: string) {
    const startAt = this.marks.get(start);
    const endAt = this.marks.get(end);

    if (startAt === undefined || endAt === undefined) {
      return null;
    }

    return round(endAt - startAt);
  }
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

export function createVoiceLatencyTrace(transport: VoiceTransport) {
  return new VoiceLatencyTrace(transport);
}
