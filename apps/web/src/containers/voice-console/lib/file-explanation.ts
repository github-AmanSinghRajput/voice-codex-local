export function buildFileExplanation(
  filePath: string,
  tasks: string[],
  diff: string
): string {
  const taskMatch = matchTask(filePath, tasks);
  if (taskMatch) {
    return taskMatch;
  }

  const heuristic = analyzeFromDiff(diff);
  if (heuristic) {
    return heuristic;
  }

  return buildStatsFallback(diff);
}

function matchTask(filePath: string, tasks: string[]): string | null {
  if (tasks.length === 0) {
    return null;
  }

  const basename = filePath.split('/').pop()?.toLowerCase() ?? '';
  const parentDir = filePath.split('/').slice(-2, -1)[0]?.toLowerCase() ?? '';
  const segments = filePath.toLowerCase().split('/');

  for (const task of tasks) {
    const lower = task.toLowerCase();
    if (basename && lower.includes(basename)) {
      return task;
    }
  }

  for (const task of tasks) {
    const lower = task.toLowerCase();
    if (parentDir && lower.includes(parentDir)) {
      return task;
    }
  }

  for (const task of tasks) {
    const lower = task.toLowerCase();
    for (const segment of segments) {
      if (segment.length > 3 && lower.includes(segment.replace(/\.[^.]+$/, ''))) {
        return task;
      }
    }
  }

  return null;
}

function analyzeFromDiff(diff: string): string | null {
  if (!diff.trim()) {
    return null;
  }

  const parts: string[] = [];

  const addedImports = extractAddedImports(diff);
  if (addedImports.length > 0) {
    const names = addedImports.slice(0, 3).join(', ');
    const suffix = addedImports.length > 3 ? ` and ${addedImports.length - 3} more` : '';
    parts.push(`Added import for ${names}${suffix}`);
  }

  const removedImports = extractRemovedImports(diff);
  if (removedImports.length > 0) {
    parts.push(`Removed ${removedImports.length} import${removedImports.length > 1 ? 's' : ''}`);
  }

  const addedFunctions = extractAddedFunctions(diff);
  if (addedFunctions.length > 0) {
    const names = addedFunctions.slice(0, 3).join(', ');
    parts.push(`Added ${names}`);
  }

  const removedFunctions = extractRemovedFunctions(diff);
  if (removedFunctions.length > 0) {
    const names = removedFunctions.slice(0, 3).join(', ');
    parts.push(`Removed ${names}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join('. ') + '.';
}

function extractAddedImports(diff: string): string[] {
  const names: string[] = [];
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }
    const importMatch = line.match(/import\s+(?:(?:type\s+)?(?:\{([^}]+)\}|(\w+)))\s+from/);
    if (importMatch) {
      const named = importMatch[1];
      const defaultName = importMatch[2];
      if (named) {
        const first = named.split(',')[0].trim().replace(/\s+as\s+\w+/, '');
        if (first) names.push(first);
      } else if (defaultName) {
        names.push(defaultName);
      }
    }
  }
  return names;
}

function extractRemovedImports(diff: string): string[] {
  const names: string[] = [];
  for (const line of diff.split('\n')) {
    if (!line.startsWith('-') || line.startsWith('---')) {
      continue;
    }
    if (/import\s+/.test(line)) {
      names.push(line.slice(1).trim());
    }
  }
  return names;
}

function extractAddedFunctions(diff: string): string[] {
  const names: string[] = [];
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }
    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch?.[1]) {
      names.push(funcMatch[1]);
    }
    const constFuncMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/);
    if (constFuncMatch?.[1]) {
      names.push(constFuncMatch[1]);
    }
    const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
    if (classMatch?.[1]) {
      names.push(classMatch[1]);
    }
  }
  return names;
}

function extractRemovedFunctions(diff: string): string[] {
  const names: string[] = [];
  for (const line of diff.split('\n')) {
    if (!line.startsWith('-') || line.startsWith('---')) {
      continue;
    }
    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch?.[1]) {
      names.push(funcMatch[1]);
    }
    const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
    if (classMatch?.[1]) {
      names.push(classMatch[1]);
    }
  }
  return names;
}

function buildStatsFallback(diff: string): string {
  if (!diff.trim()) {
    return 'File included in this changeset.';
  }

  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
    }
  }

  if (additions > 0 && deletions > 0) {
    return `+${additions} / -${deletions} lines changed.`;
  }

  if (additions > 0) {
    return `+${additions} lines added.`;
  }

  if (deletions > 0) {
    return `-${deletions} lines removed.`;
  }

  return 'File included in this changeset.';
}
