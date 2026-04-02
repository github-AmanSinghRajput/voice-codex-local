import { useMemo } from 'react';
import { buildFileExplanation } from '../lib/file-explanation';

interface FileExplanationProps {
  filePath: string;
  tasks: string[];
  diff: string;
}

export function FileExplanation({ filePath, tasks, diff }: FileExplanationProps) {
  const explanation = useMemo(
    () => buildFileExplanation(filePath, tasks, diff),
    [filePath, tasks, diff]
  );

  return (
    <div className="review-ai-note">
      <span className="metric-label">AI note</span>
      <p>{explanation}</p>
    </div>
  );
}
