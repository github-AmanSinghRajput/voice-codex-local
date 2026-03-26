import type { FormEvent } from 'react';
import { formatTimestamp } from '../lib/helpers';
import type { AuthSessionEntry, NoteEntry, SystemResponse } from '../lib/types';

interface MemoryScreenProps {
  editingNoteId: string | null;
  noteBody: string;
  noteSource: string;
  noteTitle: string;
  notes: NoteEntry[];
  trackedSessions: AuthSessionEntry[];
  system: SystemResponse | null;
  onCreateNote: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteNote: (noteId: string) => void;
  onEditNote: (note: NoteEntry) => void;
  onNoteBodyChange: (value: string) => void;
  onNoteSourceChange: (value: string) => void;
  onNoteTitleChange: (value: string) => void;
  onResetComposer: () => void;
}

export function MemoryScreen({
  editingNoteId,
  noteBody,
  noteSource,
  noteTitle,
  notes,
  trackedSessions,
  system,
  onCreateNote,
  onDeleteNote,
  onEditNote,
  onNoteBodyChange,
  onNoteSourceChange,
  onNoteTitleChange,
  onResetComposer
}: MemoryScreenProps) {
  return (
    <section className="screen memory-screen">
      <div className="section-head">
        <div>
          <p className="section-kicker">Memory</p>
          <h2>Capture notes, decisions, and operator context in one place.</h2>
        </div>
        <span className="section-chip">{notes.length} notes ready</span>
      </div>

      <div className="memory-layout">
        <section className="content-card primary-card">
          <div className="card-head">
            <div>
              <span className="metric-label">Quick capture</span>
              <strong>Write down the important part before context is lost</strong>
            </div>
            <span className="section-chip">live</span>
          </div>
          <form className="note-composer" onSubmit={onCreateNote}>
            <label className="field-block" htmlFor="note-title">
              <span>Note title</span>
              <div className="field-row">
                <input
                  id="note-title"
                  value={noteTitle}
                  onChange={(event) => onNoteTitleChange(event.target.value)}
                  placeholder="Deployment checklist, customer bug, design idea..."
                />
              </div>
            </label>

            <div className="note-composer-grid">
              <label className="field-block" htmlFor="note-source">
                <span>Source</span>
                <div className="field-row">
                  <input
                    id="note-source"
                    value={noteSource}
                    onChange={(event) => onNoteSourceChange(event.target.value)}
                    placeholder="meeting"
                  />
                </div>
              </label>
            </div>

            <label className="field-block" htmlFor="note-body">
              <span>Body</span>
              <textarea
                id="note-body"
                value={noteBody}
                onChange={(event) => onNoteBodyChange(event.target.value)}
                placeholder="Capture action items, decisions, repo context, follow-ups, and raw meeting notes..."
                rows={8}
              />
            </label>

            <div className="action-row">
              <button className="button-primary" type="submit">
                {editingNoteId ? 'Update note' : 'Save note'}
              </button>
              {editingNoteId ? (
                <button className="button-ghost" onClick={onResetComposer} type="button">
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="content-card">
          <div className="card-head">
            <div>
              <span className="metric-label">Recent notes</span>
              <strong>Granola-style note-taking foundation</strong>
            </div>
          </div>
          <div className="notes-list">
            {notes.length === 0 ? (
              <div className="empty-state compact">
                <p>No notes created yet.</p>
                <span>Start capturing meeting notes, code decisions, and operator context here.</span>
              </div>
            ) : (
              notes.map((note) => (
                <article key={note.id} className="note-card">
                  <div className="note-content">
                    <div className="note-meta">
                      <span>{note.source}</span>
                      <small>{formatTimestamp(note.updatedAt)}</small>
                    </div>
                    <strong>{note.title}</strong>
                    <p>{note.body}</p>
                  </div>
                  <div className="note-actions">
                    <button className="button-ghost" onClick={() => onEditNote(note)} type="button">
                      Edit
                    </button>
                    <button className="button-secondary danger" onClick={() => onDeleteNote(note.id)} type="button">
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="metrics-grid">
          <article className="metric-card">
            <span className="metric-label">Operator auth</span>
            <strong>{system?.auth.operator?.displayName ?? 'No operator linked'}</strong>
            <p>Local operator identity is tracked separately from the Codex CLI session.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Product auth plan</span>
            <strong>{system?.auth.productAuth ?? 'Google OAuth planned'}</strong>
            <p>Future deployed web/mobile login will use product auth instead of voice auth.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Infra guidance</span>
            <strong>{system?.providers.queue ?? 'inline'} queue / {system?.providers.vector ?? 'none'} vector</strong>
            <p>{system?.recommendations.queue ?? 'Keep infrastructure simple until usage justifies more.'}</p>
          </article>
        </section>
      </div>

      <section className="content-card">
        <div className="card-head">
          <div>
            <span className="metric-label">Tracked sessions</span>
            <strong>Local and future product session audit</strong>
          </div>
        </div>
        <div className="history-list">
          {trackedSessions.length === 0 ? (
            <div className="empty-state compact">
              <p>No tracked sessions yet.</p>
              <span>Codex CLI and future Google product sessions will appear here.</span>
            </div>
          ) : (
            trackedSessions.map((session) => (
              <article key={session.id} className="history-item">
                <div>
                  <strong>{session.provider}</strong>
                  <p>{session.providerSubject ?? 'Local CLI session'}</p>
                </div>
                <div className="history-meta">
                  <span className="section-chip">{session.accessScope.join(', ') || 'no scope'}</span>
                  <small>{formatTimestamp(session.createdAt)}</small>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
