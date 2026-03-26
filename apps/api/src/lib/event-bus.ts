import type { Response } from 'express';
import type { ChatMessage, RuntimeState } from '../types.js';

export type AppEvent =
  | {
      type: 'voice_state';
      payload: Pick<RuntimeState, 'audio' | 'voiceSession'>;
    }
  | {
      type: 'chat_append';
      payload: {
        messages: ChatMessage[];
      };
    }
  | {
      type: 'status_refresh';
      payload: Record<string, never>;
    };

export class EventBus {
  private readonly clients = new Set<Response>();

  addClient(response: Response) {
    this.clients.add(response);
  }

  removeClient(response: Response) {
    this.clients.delete(response);
  }

  emit(event: AppEvent) {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(line);
    }
  }
}
