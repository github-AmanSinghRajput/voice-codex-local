import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChatMessage, LogStore } from './types.js';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(srcDir, '../../..');
const dataDir = path.join(appRoot, 'data');
const logPath = path.join(dataDir, 'chat-log.json');

async function ensureDataFiles() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(logPath);
  } catch {
    const empty: LogStore = { messages: [] };
    await fs.writeFile(logPath, JSON.stringify(empty, null, 2), 'utf8');
  }
}

export async function getDataDir() {
  await ensureDataFiles();
  return dataDir;
}

export async function readLogs() {
  await ensureDataFiles();
  const raw = await fs.readFile(logPath, 'utf8');
  return JSON.parse(raw) as LogStore;
}

export async function appendMessages(messages: ChatMessage[]) {
  const store = await readLogs();
  store.messages.push(...messages);
  await fs.writeFile(logPath, JSON.stringify(store, null, 2), 'utf8');
  return store.messages;
}

export async function clearLogs() {
  await ensureDataFiles();
  const empty: LogStore = { messages: [] };
  await fs.writeFile(logPath, JSON.stringify(empty, null, 2), 'utf8');
  return empty;
}

export function getRootDir() {
  return appRoot;
}
