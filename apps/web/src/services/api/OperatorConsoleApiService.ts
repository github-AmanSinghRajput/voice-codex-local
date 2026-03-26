import { BaseApiService } from './BaseApiService';
import type {
  ApprovalHistoryResponse,
  ApprovalRequiredResponse,
  ApprovalResponse,
  AuthSessionsResponse,
  ChatStreamEvent,
  CodexSettingsResponse,
  ClearResponse,
  CreateNoteInput,
  CreateNoteResponse,
  LogsResponse,
  NotesResponse,
  ReplyResponse,
  SetWorkspaceResponse,
  StatusResponse,
  SystemResponse,
  TtsSynthesisResponse,
  VoiceCommandAction,
  VoiceCommandApplyResponse,
  VoiceCommandResolveResponse,
  VoiceTranscriptionResponse,
  VoiceSettingsResponse,
  VoiceSessionResponse
} from '../../containers/voice-console/lib/types';

export class OperatorConsoleApiService extends BaseApiService {
  getStatus() {
    return this.request<StatusResponse>('/api/status', {
      cache: 'no-store'
    });
  }

  getSystem() {
    return this.request<SystemResponse>('/api/system');
  }

  getLogs() {
    return this.request<LogsResponse>('/api/logs');
  }

  clearLogs() {
    return this.request<ClearResponse>('/api/logs', {
      method: 'DELETE'
    });
  }

  setProjectRoot(projectRoot: string) {
    return this.request<SetWorkspaceResponse>('/api/workspace/project', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ projectRoot })
    });
  }

  setWriteAccess(enabled: boolean) {
    return this.request<SetWorkspaceResponse>('/api/workspace/write-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled })
    });
  }

  logoutCodex() {
    return this.request<ClearResponse>('/api/codex/logout', {
      method: 'POST'
    });
  }

  getCodexSettings() {
    return this.request<CodexSettingsResponse>('/api/codex/settings');
  }

  updateCodexSettings(input: Partial<CodexSettingsResponse['settings']>) {
    return this.request<CodexSettingsResponse>('/api/codex/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  sendMessage(message: string, source: 'voice' | 'text', voiceTurnId?: string) {
    return this.request<ReplyResponse | ApprovalRequiredResponse>('/api/chat/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(voiceTurnId ? { 'X-Voice-Turn-Id': voiceTurnId } : {})
      },
      body: JSON.stringify({ message, source })
    });
  }

  async streamMessage(
    message: string,
    source: 'voice' | 'text',
    onEvent: (event: ChatStreamEvent) => void,
    options?: { voiceTurnId?: string; signal?: AbortSignal }
  ) {
    const response = await fetch(`${this.baseUrl}/api/chat/text/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.voiceTurnId ? { 'X-Voice-Turn-Id': options.voiceTurnId } : {})
      },
      body: JSON.stringify({ message, source }),
      signal: options?.signal
    });

    if (!response.ok) {
      const body = (await response.json()) as {
        error?: string;
        details?: unknown;
      };
      throw new Error(body.error ?? 'Unable to stream chat response.');
    }

    if (!response.body) {
      throw new Error('Streaming chat response body was unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            onEvent(JSON.parse(line) as ChatStreamEvent);
          } catch {
            console.warn('[stream] skipping malformed NDJSON line', line.slice(0, 120));
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }

      if (done) {
        const tail = buffer.trim();
        if (tail) {
          try {
            onEvent(JSON.parse(tail) as ChatStreamEvent);
          } catch {
            console.warn('[stream] skipping malformed NDJSON tail', tail.slice(0, 120));
          }
        }
        break;
      }
    }
  }

  transcribeVoiceAudio(audioBlob: Blob, mimeType: string, voiceTurnId?: string) {
    return this.request<VoiceTranscriptionResponse>('/api/voice/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-Audio-Mime-Type': mimeType,
        ...(voiceTurnId ? { 'X-Voice-Turn-Id': voiceTurnId } : {})
      },
      body: audioBlob
    });
  }

  startVoiceSession() {
    return this.request<VoiceSessionResponse>('/api/voice/session/start', {
      method: 'POST'
    });
  }

  stopVoiceSession() {
    return this.request<VoiceSessionResponse>('/api/voice/session/stop', {
      method: 'POST'
    });
  }

  interruptVoiceSession() {
    return this.request<VoiceSessionResponse>('/api/voice/session/interrupt', {
      method: 'POST'
    });
  }

  resolveVoiceCommand(transcript: string) {
    return this.request<VoiceCommandResolveResponse>('/api/voice/commands/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ transcript })
    });
  }

  applyVoiceCommandAction(action: VoiceCommandAction) {
    return this.request<VoiceCommandApplyResponse>('/api/voice/commands/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action })
    });
  }

  getVoiceSettings() {
    return this.request<VoiceSettingsResponse>('/api/voice/settings');
  }

  updateVoiceSettings(input: Partial<VoiceSettingsResponse['settings']>) {
    return this.request<VoiceSettingsResponse>('/api/voice/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  synthesizeSpeech(text: string, voiceTurnId?: string) {
    return this.request<TtsSynthesisResponse>('/api/tts/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(voiceTurnId ? { 'X-Voice-Turn-Id': voiceTurnId } : {})
      },
      body: JSON.stringify({ text })
    });
  }

  approveChange(approvalId: string) {
    return this.request<ApprovalResponse>(`/api/approvals/${approvalId}/approve`, {
      method: 'POST'
    });
  }

  rejectChange(approvalId: string) {
    return this.request<ApprovalResponse>(`/api/approvals/${approvalId}/reject`, {
      method: 'POST'
    });
  }

  getNotes(limit = 16) {
    return this.request<NotesResponse>(`/api/notes?limit=${limit}`);
  }

  createNote(input: CreateNoteInput) {
    return this.request<CreateNoteResponse>('/api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  updateNote(noteId: string, input: CreateNoteInput) {
    return this.request<CreateNoteResponse>(`/api/notes/${noteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  deleteNote(noteId: string) {
    return this.request<ClearResponse>(`/api/notes/${noteId}`, {
      method: 'DELETE'
    });
  }

  getApprovals(limit = 16) {
    return this.request<ApprovalHistoryResponse>(`/api/approvals/history?limit=${limit}`);
  }

  getAuthSessions(limit = 10) {
    return this.request<AuthSessionsResponse>(`/api/auth/sessions?limit=${limit}`);
  }
}
