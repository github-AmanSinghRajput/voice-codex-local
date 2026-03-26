import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(srcDir, '../../..');

export function getRootDir() {
  return appRoot;
}
