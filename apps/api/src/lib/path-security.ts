import fs from 'node:fs/promises';
import path from 'node:path';

const exactSecretNames = new Set(['.env', '.env.local', 'id_rsa', 'id_ed25519', '.npmrc']);
const suffixSecretPatterns = ['.pem', '.key', '.p12', '.pfx'];
const directoryMarkers = ['.aws', 'secrets', 'credentials'];
const exactRelativePaths = ['.docker/config.json'];

function normalizePathSegment(input: string) {
  return input.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').trim();
}

export function isSecretRelativePath(relativePath: string) {
  const normalized = normalizePathSegment(relativePath).toLowerCase();
  if (!normalized) {
    return false;
  }

  const segments = normalized.split('/').filter(Boolean);
  const basename = segments[segments.length - 1] ?? '';

  if (exactSecretNames.has(basename)) {
    return true;
  }

  if (basename.startsWith('.env.')) {
    return true;
  }

  if (suffixSecretPatterns.some((suffix) => basename.endsWith(suffix))) {
    return true;
  }

  if (exactRelativePaths.some((candidate) => normalized === candidate || normalized.endsWith(`/${candidate}`))) {
    return true;
  }

  return segments.some((segment) => directoryMarkers.includes(segment));
}

export async function resolveWorkspacePath(projectRoot: string, relativePath: string) {
  const normalizedRelativePath = normalizePathSegment(relativePath);
  const absolutePath = path.resolve(projectRoot, normalizedRelativePath);
  const realProjectRoot = await fs.realpath(projectRoot);
  const relativeToRoot = path.relative(realProjectRoot, absolutePath);
  const escapesWorkspace =
    !relativeToRoot || relativeToRoot === ''
      ? false
      : relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`);

  if (escapesWorkspace) {
    return {
      normalizedRelativePath,
      absolutePath,
      realPath: null,
      escapesWorkspace: true,
      isSymlink: false
    };
  }

  try {
    const stats = await fs.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      const realPath = await fs.realpath(absolutePath);
      const realRelativeToRoot = path.relative(realProjectRoot, realPath);
      return {
        normalizedRelativePath,
        absolutePath,
        realPath,
        escapesWorkspace:
          realRelativeToRoot === '..' || realRelativeToRoot.startsWith(`..${path.sep}`),
        isSymlink: true
      };
    }
  } catch {
    return {
      normalizedRelativePath,
      absolutePath,
      realPath: null,
      escapesWorkspace: false,
      isSymlink: false
    };
  }

  return {
    normalizedRelativePath,
    absolutePath,
    realPath: absolutePath,
    escapesWorkspace: false,
    isSymlink: false
  };
}

export async function isProtectedWorkspacePath(projectRoot: string, relativePath: string) {
  if (isSecretRelativePath(relativePath)) {
    return true;
  }

  const resolved = await resolveWorkspacePath(projectRoot, relativePath);
  return resolved.escapesWorkspace;
}
