import { type FormEvent, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { formatClock, formatTimestamp, groupMessages } from '../lib/helpers';
import type { MessageEntry } from '../lib/types';

interface TerminalScreenProps {
  assistantLabel: string;
  messages: MessageEntry[];
  density: 'comfortable' | 'compact';
  active?: boolean;
  voiceActive?: boolean;
  disabled?: boolean;
  textInput: string;
  onTextInputChange: (value: string) => void;
  onStartVoice: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function CodeBlock({ children, className, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const isInline = !className;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = String(children).replace(/\n$/, '');
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [children]);

  if (isInline) {
    return <code className="chat-inline-code" {...props}>{children}</code>;
  }

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">{(className ?? '').replace('language-', '')}</span>
        <button className="chat-code-copy" onClick={handleCopy} type="button">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code className={className} {...props}>{children}</code></pre>
    </div>
  );
}

function ChatMessage({ text, role }: { text: string; role: 'user' | 'assistant' }) {
  if (role === 'user') {
    return <p className="chat-text chat-text-user">{text}</p>;
  }

  return (
    <div className="chat-text chat-text-assistant">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

export function TerminalScreen({
  assistantLabel,
  messages,
  density,
  active = false,
  voiceActive = false,
  disabled = false,
  textInput,
  onTextInputChange,
  onStartVoice,
  onSubmit
}: TerminalScreenProps) {
  const logRef = useRef<HTMLDivElement | null>(null);
  const justMountedRef = useRef(true);
  const groupedMessages = useMemo(() => groupMessages(messages), [messages]);
  const scrollToBottom = useCallback(() => {
    const nextNode = logRef.current;
    if (!nextNode) {
      return;
    }

    nextNode.scrollTop = nextNode.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const nextNode = logRef.current;
    if (!nextNode || groupedMessages.length === 0) {
      return;
    }

    const distanceFromBottom = nextNode.scrollHeight - nextNode.scrollTop - nextNode.clientHeight;
    const shouldAutoScroll = justMountedRef.current || distanceFromBottom < 160;
    if (!shouldAutoScroll) {
      return;
    }

    if (justMountedRef.current) {
      justMountedRef.current = false;
      scrollToBottom();
      const animationFrameId = window.requestAnimationFrame(scrollToBottom);
      return () => window.cancelAnimationFrame(animationFrameId);
    }

    scrollToBottom();
  }, [groupedMessages, scrollToBottom]);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    justMountedRef.current = false;
    scrollToBottom();
    const animationFrameId = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [active, scrollToBottom, groupedMessages.length]);

  return (
    <section className="screen terminal-screen">
      <div className="section-head">
        <div>
          <p className="section-kicker">Text Chat</p>
          <h2>Chat with your coding assistant.</h2>
        </div>
        <span className="section-chip">{messages.length} messages</span>
      </div>

      <section className="terminal-card terminal-card-chat">
        <div className="terminal-chrome">
          <div className="traffic-lights">
            <span className="traffic red" />
            <span className="traffic yellow" />
            <span className="traffic green" />
          </div>
          <p>voice-codex://text-chat</p>
        </div>

        <div className="terminal-meta-bar">
          <span>Conversation</span>
          <span>{groupedMessages.length} turns</span>
          <span>{density} density</span>
        </div>

        <div className={`terminal-log ${density}`} ref={logRef}>
          {groupedMessages.length === 0 ? (
            <div className="empty-state">
              <p>No chat history yet.</p>
              <span>Start a voice session or type a coding request below.</span>
            </div>
          ) : (
            groupedMessages.map((group) => (
              <article key={group.id} className={`log-entry ${group.role}`}>
                <div className="log-body">
                  <div className="log-meta">
                    <strong>{group.role === 'assistant' ? assistantLabel : 'You'}</strong>
                    <small>{group.source}</small>
                    <span className="log-meta-time">{formatClock(group.createdAt)}</span>
                  </div>
                  <div className="log-cluster">
                    {group.messages.map((message) => (
                      <ChatMessage key={message.id} text={message.text} role={group.role} />
                    ))}
                  </div>
                  <span className="log-time">{formatTimestamp(group.createdAt)}</span>
                </div>
              </article>
            ))
          )}
        </div>

        <form className="terminal-composer" onSubmit={onSubmit}>
          <button
            aria-label={voiceActive ? 'Voice chat already active' : 'Start voice chat from chat composer'}
            className="composer-mic-button"
            disabled={voiceActive}
            onClick={onStartVoice}
            type="button"
          >
            <span aria-hidden="true" className="composer-mic-icon">
              <svg fill="none" viewBox="0 0 24 24">
                <path
                  d="M12 15.5a3.75 3.75 0 0 0 3.75-3.75V7.75a3.75 3.75 0 1 0-7.5 0v4A3.75 3.75 0 0 0 12 15.5Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
                <path
                  d="M6.75 11.75a5.25 5.25 0 1 0 10.5 0M12 17v3.25M9 20.25h6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </span>
          </button>
          <input
            disabled={disabled}
            placeholder="Ask a coding question or describe what you want to build..."
            value={textInput}
            onChange={(event) => onTextInputChange(event.target.value)}
          />
          <button className="button-primary" disabled={disabled} type="submit">
            {disabled ? 'Thinking...' : 'Send'}
          </button>
        </form>
      </section>
    </section>
  );
}
