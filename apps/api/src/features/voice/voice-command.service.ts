import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getWorkspaceState } from '../../runtime.js';
import type { AssistantProviderId, ChatMessage, CodexReasoningEffort } from '../../types.js';
import { ChatRepository } from '../chat/chat.repository.js';
import { getAssistantState } from '../../assistant-client.js';
import {
  CodexSettingsService,
  type CodexSettingsPayload
} from '../codex/codex-settings.service.js';
import {
  ClaudeSettingsService,
  type ClaudeSettingsPayload
} from '../claude/claude-settings.service.js';

export type VoiceCommandScreen = 'voice' | 'workspace' | 'review' | 'terminal';

export type VoiceCommandAction =
  | {
      type: 'set_codex_model';
      model: string;
      reasoningEffort: CodexReasoningEffort | null;
    }
  | {
      type: 'set_claude_model';
      model: string;
    };

export interface VoiceCommandOption {
  id: string;
  label: string;
  description: string;
  action: VoiceCommandAction;
}

interface CommandHandledResult {
  status: 'handled';
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  suggestedScreen?: VoiceCommandScreen;
}

interface CommandOptionsRequiredResult {
  status: 'options_required';
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  commandTitle: string;
  commandPrompt: string;
  options: VoiceCommandOption[];
  suggestedScreen?: VoiceCommandScreen;
}

interface CommandNoMatchResult {
  status: 'no_match';
}

export type VoiceCommandResolutionResult =
  | CommandHandledResult
  | CommandOptionsRequiredResult
  | CommandNoMatchResult;

interface VoiceCommandApplyResult {
  assistantMessage: ChatMessage;
  suggestedScreen?: VoiceCommandScreen;
}

export class VoiceCommandService {
  constructor(
    private readonly codexSettingsService: CodexSettingsService = new CodexSettingsService(),
    private readonly claudeSettingsService: ClaudeSettingsService = new ClaudeSettingsService(),
    private readonly repository: ChatRepository = new ChatRepository()
  ) {}

  async resolve(transcript: string): Promise<VoiceCommandResolutionResult> {
    const normalized = normalizeTranscript(transcript);
    const providerContext = await this.getProviderCommandContext();
    const command = await this.matchCommand(normalized, transcript, providerContext);

    if (!command) {
      return {
        status: 'no_match'
      };
    }

    const userMessage = createChatMessage('user', transcript, 'voice');
    await this.repository.appendMessages([userMessage]);

    if (command.kind === 'current_model') {
      const payload = providerContext.payload;
      return this.persistHandled(
        userMessage,
        describeCurrentModel(providerContext.providerId, payload),
        'voice'
      );
    }

    if (command.kind === 'status') {
      const payload = providerContext.payload;
      const workspace = getWorkspaceState();
      return this.persistHandled(
        userMessage,
        [
          workspace.projectRoot
            ? `Workspace is set to ${workspace.projectName ?? path.basename(workspace.projectRoot)}.`
            : 'No project folder is selected yet.',
          workspace.writeAccessEnabled ? 'Edits are enabled.' : 'Edits are still locked.',
          describeCurrentModel(providerContext.providerId, payload)
        ].join(' '),
        'voice',
        workspace.projectRoot ? 'voice' : 'workspace'
      );
    }

    if (command.kind === 'limits') {
      return this.persistHandled(
        userMessage,
        describeLimitVisibility(providerContext.providerId),
        'voice'
      );
    }

    if (command.kind === 'list_models') {
      const payload = providerContext.payload;
      if (payload.options.models.length === 0) {
        return this.persistHandled(
          userMessage,
          providerContext.providerId === 'claude'
            ? 'I could not find any Claude Code models to show right now.'
            : 'I could not find any locally cached Codex models yet. Open Codex once from the CLI, then ask again.',
          'voice'
        );
      }
      const assistantMessage = createChatMessage(
        'assistant',
        `I pulled the available ${providerContext.providerId === 'claude' ? 'Claude Code' : 'Codex'} models. Pick one from the list on screen and I will switch to it.`,
        'voice'
      );
      await this.repository.appendMessages([assistantMessage]);

      return {
        status: 'options_required',
        userMessage,
        assistantMessage,
        commandTitle: `Choose ${providerContext.providerId === 'claude' ? 'Claude Code' : 'Codex'} model`,
        commandPrompt: 'Select a model to use for the next turns.',
        options: createModelOptions(providerContext.providerId, payload),
        suggestedScreen: 'voice'
      };
    }

    if (command.kind === 'set_model') {
      const payload = providerContext.payload;
      const targetModel = findModelOption(payload, command.model);

      if (!targetModel) {
        const assistantMessage = createChatMessage(
          'assistant',
          `I could not find a model matching ${command.model}. Pick one from the list on screen instead.`,
          'voice'
        );
        await this.repository.appendMessages([assistantMessage]);

        return {
          status: 'options_required',
          userMessage,
          assistantMessage,
          commandTitle: `Choose ${providerContext.providerId === 'claude' ? 'Claude Code' : 'Codex'} model`,
          commandPrompt: 'Select one of the detected models.',
          options: createModelOptions(providerContext.providerId, payload),
          suggestedScreen: 'voice'
        };
      }

      const next = await this.applyProviderModelChange(providerContext.providerId, payload, command);

      return this.persistHandled(
        userMessage,
        describeModelSwitch(providerContext.providerId, next.settings.model, 'reasoningEffort' in next.settings ? next.settings.reasoningEffort : null),
        'voice'
      );
    }

    if (command.kind === 'init') {
      return this.handleInit(userMessage);
    }

    return {
      status: 'no_match'
    };
  }

  async applyAction(action: VoiceCommandAction): Promise<VoiceCommandApplyResult> {
    if (action.type === 'set_codex_model') {
      const next = await this.codexSettingsService.updateSettings({
        model: action.model,
        reasoningEffort: action.reasoningEffort
      });
      const assistantMessage = createChatMessage(
        'assistant',
        `Switched Codex to ${next.settings.model}${next.settings.reasoningEffort ? ` with ${next.settings.reasoningEffort} reasoning.` : '.'}`,
        'voice'
      );
      await this.repository.appendMessages([assistantMessage]);

      return {
        assistantMessage,
        suggestedScreen: 'voice'
      };
    }

    if (action.type === 'set_claude_model') {
      const next = await this.claudeSettingsService.updateSettings({
        model: action.model
      });
      const assistantMessage = createChatMessage(
        'assistant',
        describeModelSwitch('claude', next.settings.model, null),
        'voice'
      );
      await this.repository.appendMessages([assistantMessage]);

      return {
        assistantMessage,
        suggestedScreen: 'voice'
      };
    }

    throw new Error('Unsupported voice command action.');
  }

  private async getProviderCommandContext() {
    const assistantState = await getAssistantState();
    const providerId: AssistantProviderId = assistantState.activeProviderId === 'claude' ? 'claude' : 'codex';
    const payload =
      providerId === 'claude'
        ? await this.claudeSettingsService.getSettings()
        : await this.codexSettingsService.getSettings();

    return {
      providerId,
      payload
    };
  }

  private async applyProviderModelChange(
    providerId: AssistantProviderId,
    payload: CodexSettingsPayload | ClaudeSettingsPayload,
    command: { model: string; reasoningEffort: CodexReasoningEffort | null }
  ) {
    const targetModel = findModelOption(payload, command.model);
    if (!targetModel) {
      throw new Error(`Unknown ${providerId} model: ${command.model}`);
    }

    if (providerId === 'claude') {
      return this.claudeSettingsService.updateSettings({
        model: targetModel.slug
      });
    }

    const codexPayload = payload as CodexSettingsPayload;
    const reasoningEffort =
      command.reasoningEffort ??
      ('defaultReasoningEffort' in targetModel ? targetModel.defaultReasoningEffort ?? null : null) ??
      codexPayload.settings.reasoningEffort ??
      null;
    return this.codexSettingsService.updateSettings({
      model: targetModel.slug,
      reasoningEffort
    });
  }

  private async persistHandled(
    userMessage: ChatMessage,
    text: string,
    source: ChatMessage['source'],
    suggestedScreen?: VoiceCommandScreen
  ): Promise<CommandHandledResult> {
    const assistantMessage = createChatMessage('assistant', text, source);
    await this.repository.appendMessages([assistantMessage]);

    return {
      status: 'handled',
      userMessage,
      assistantMessage,
      suggestedScreen
    };
  }

  private async handleInit(userMessage: ChatMessage): Promise<CommandHandledResult> {
    const workspace = getWorkspaceState();

    if (!workspace.projectRoot) {
      return this.persistHandled(
        userMessage,
        'Pick a project folder first, then ask me to run init again.',
        'voice',
        'workspace'
      );
    }

    if (!workspace.writeAccessEnabled) {
      return this.persistHandled(
        userMessage,
        'Enable edits for this workspace before I create AGENTS.md.',
        'voice',
        'workspace'
      );
    }

    const agentsPath = path.join(workspace.projectRoot, 'AGENTS.md');
    const projectLabel = workspace.projectName ?? path.basename(workspace.projectRoot);
    try {
      await fs.writeFile(
        agentsPath,
        buildAgentsTemplate(projectLabel),
        { encoding: 'utf8', flag: 'wx' }
      );
      return this.persistHandled(
        userMessage,
        `Created AGENTS.md in ${projectLabel}. Review it before the next coding turn.`,
        'voice'
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
        return this.persistHandled(
          userMessage,
          `AGENTS.md already exists in ${projectLabel}.`,
          'voice'
        );
      }
      throw error;
    }
  }

  private async matchCommand(
    normalizedTranscript: string,
    rawTranscript: string,
    providerContext: {
      providerId: AssistantProviderId;
      payload: CodexSettingsPayload | ClaudeSettingsPayload;
    }
  ) {
    const payload = providerContext.payload;
    const reasoningEffort = findReasoningEffort(normalizedTranscript);

    if (
      /\binit(ialize)?\s+(codex|agents|this\s+(project|repo|workspace))\b/.test(normalizedTranscript) ||
      /\b(run|generate|create|write)\b.*\bagents\.md\b/.test(normalizedTranscript) ||
      /\brun\s+init\b/.test(normalizedTranscript)
    ) {
      return {
        kind: 'init'
      } as const;
    }

    if (
      /\b(current model|which model|what model|model currently|what's the model|what is the model)\b/.test(normalizedTranscript)
    ) {
      return {
        kind: 'current_model'
      } as const;
    }

    if (
      /\b(available models|list models|show models|choose model|switch model|change model)\b/.test(normalizedTranscript)
    ) {
      return {
        kind: 'list_models'
      } as const;
    }

    if (
      /\b(limit|limits|usage limit|rate limit|quota|session limit|remaining limit|remaining quota)\b/.test(normalizedTranscript)
    ) {
      return {
        kind: 'limits'
      } as const;
    }

    const explicitModel = findMentionedModel(payload, normalizedTranscript);
    if (
      explicitModel &&
      /\b(switch|change|use|set)\b/.test(normalizedTranscript) &&
      /\bmodel\b/.test(normalizedTranscript)
    ) {
      return {
        kind: 'set_model',
        model: explicitModel.slug,
        reasoningEffort
      } as const;
    }

    if (
      explicitModel &&
      /\b(use|switch to|set to)\b/.test(normalizedTranscript)
    ) {
      return {
        kind: 'set_model',
        model: explicitModel.slug,
        reasoningEffort
      } as const;
    }

    if (
      /\b(status|session config|what is set|what('?s| is) (configured|active))\b/.test(normalizedTranscript) &&
      !/\bmodel\b/.test(normalizedTranscript)
    ) {
      return {
        kind: 'status'
      } as const;
    }

    const rawModel = extractModelSlug(rawTranscript);
    if (rawModel && /\b(switch|change|use|set)\b/.test(normalizedTranscript)) {
      return {
        kind: 'set_model',
        model: rawModel,
        reasoningEffort
      } as const;
    }

    return null;
  }
}

function createModelOptions(
  providerId: AssistantProviderId,
  payload: CodexSettingsPayload | ClaudeSettingsPayload
): VoiceCommandOption[] {
  return payload.options.models.map((entry) => ({
    id: entry.slug,
    label:
      'suggestedForDiscussion' in entry && entry.suggestedForDiscussion
        ? `${entry.displayName} · suggested for discussion`
        : entry.displayName,
    description: entry.description,
    action:
      providerId === 'claude'
        ? {
            type: 'set_claude_model',
            model: entry.slug
          }
        : {
            type: 'set_codex_model',
            model: entry.slug,
            reasoningEffort:
              (payload as CodexSettingsPayload).settings.reasoningEffort ??
              ('defaultReasoningEffort' in entry ? entry.defaultReasoningEffort ?? null : null)
          }
  }));
}

function describeCurrentModel(
  providerId: AssistantProviderId,
  payload: CodexSettingsPayload | ClaudeSettingsPayload
) {
  if (!payload.settings.model) {
    return providerId === 'claude'
      ? 'Claude Code is using its default model selection for this app session.'
      : 'No Codex model is pinned for this app session yet.';
  }

  if (providerId === 'claude') {
    return `Current Claude Code model is ${payload.settings.model}. Source: ${payload.source}.`;
  }

  const codexPayload = payload as CodexSettingsPayload;
  return `Current Codex model is ${payload.settings.model}${codexPayload.settings.reasoningEffort ? ` with ${codexPayload.settings.reasoningEffort} reasoning` : ''}. Source: ${payload.source}.`;
}

function findMentionedModel(
  payload: CodexSettingsPayload | ClaudeSettingsPayload,
  normalizedTranscript: string
) {
  return payload.options.models.find((entry) => {
    const slug = entry.slug.toLowerCase();
    const displayName = entry.displayName.toLowerCase();
    return normalizedTranscript.includes(slug) || normalizedTranscript.includes(displayName);
  }) ?? null;
}

function findModelOption(payload: CodexSettingsPayload | ClaudeSettingsPayload, input: string) {
  const normalizedInput = normalizeTranscript(input);
  return payload.options.models.find((entry) => {
    return normalizedInput === entry.slug.toLowerCase() || normalizedInput === entry.displayName.toLowerCase();
  }) ?? findMentionedModel(payload, normalizedInput);
}

function describeModelSwitch(
  providerId: AssistantProviderId,
  model: string | null,
  reasoningEffort: CodexReasoningEffort | null
) {
  if (providerId === 'claude') {
    return `Switched Claude Code to ${model ?? 'the default model'}.`;
  }

  return `Switched Codex to ${model}${reasoningEffort ? ` with ${reasoningEffort} reasoning.` : '.'}`;
}

function describeLimitVisibility(providerId: AssistantProviderId) {
  if (providerId === 'claude') {
    return 'Claude Code does not expose exact remaining session quota to VOCOD through the local CLI right now. If Claude reports a limit reset time, I will say it out loud when that happens.';
  }

  return 'Codex does not expose exact remaining session quota to VOCOD through the local CLI right now. If Codex reports a retry window or reset time, I will say it out loud when that happens.';
}

function extractModelSlug(transcript: string) {
  const match = transcript.match(/\b([a-z][a-z0-9]*(?:[-\.][a-z0-9]+)+)\b/i);
  return match?.[1] ?? null;
}

function findReasoningEffort(transcript: string): CodexReasoningEffort | null {
  if (/\bxhigh\b|\bextra high\b|\bx high\b/.test(transcript)) {
    return 'xhigh';
  }
  if (/\bhigh\b/.test(transcript)) {
    return 'high';
  }
  if (/\bmedium\b/.test(transcript)) {
    return 'medium';
  }
  if (/\blow\b|\bfast\b/.test(transcript)) {
    return 'low';
  }
  if (/\bminimal\b/.test(transcript)) {
    return 'minimal';
  }

  return null;
}

function normalizeTranscript(transcript: string) {
  return transcript.toLowerCase().replace(/[^\w.\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function createChatMessage(
  role: ChatMessage['role'],
  text: string,
  source: ChatMessage['source']
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    source,
    createdAt: new Date().toISOString()
  };
}

function buildAgentsTemplate(projectName: string) {
  return `# Repository Guidelines

## Project Focus
- Keep changes scoped to ${projectName}.
- Prefer small, reviewable patches with clear intent.
- Run the narrowest relevant build or test command before finishing work.

## Working Style
- Read the existing code before changing it.
- Preserve established patterns unless there is a concrete reason to improve them.
- Call out risks, follow-up work, and verification in final summaries.

## Safety
- Do not edit secrets, credentials, or deployment config unless explicitly requested.
- Ask before destructive commands or large refactors.
- Keep generated output out of git unless the repository already tracks it.
`;
}
