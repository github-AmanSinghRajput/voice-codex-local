import { jobRunner } from '../../lib/jobs.js';
import { NotesRepository } from './notes.repository.js';

interface CreateNoteInput {
  title: string;
  body: string;
  source?: string;
  chunks?: string[];
}

interface UpdateNoteInput {
  title: string;
  body: string;
  source?: string;
  chunks?: string[];
}

export class NotesService {
  constructor(private readonly repository: NotesRepository = new NotesRepository()) {}

  async createNote(input: CreateNoteInput) {
    return jobRunner.run('notes.create', async () => this.repository.createNote(input));
  }

  async listRecentNotes(limit = 20) {
    return this.repository.listRecentNotes(limit);
  }

  async updateNote(noteId: string, input: UpdateNoteInput) {
    return jobRunner.run('notes.update', async () => this.repository.updateNote(noteId, input));
  }

  async deleteNote(noteId: string) {
    return jobRunner.run('notes.delete', async () => this.repository.deleteNote(noteId));
  }
}
