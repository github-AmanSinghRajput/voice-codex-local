import { useMemo, useState } from 'react';
import { buildFileTree, type FileTreeNode } from '../lib/file-tree';

interface FileStats {
  filePath: string;
  additions: number;
  deletions: number;
}

interface FileTreeProps {
  files: FileStats[];
  viewedFiles: Set<string>;
  activeFilePath: string | null;
  onFileClick: (filePath: string) => void;
}

export function FileTree({ files, viewedFiles, activeFilePath, onFileClick }: FileTreeProps) {
  const tree = useMemo(() => buildFileTree(files.map((f) => f.filePath)), [files]);
  const statsMap = useMemo(() => {
    const map = new Map<string, FileStats>();
    for (const file of files) {
      map.set(file.filePath, file);
    }
    return map;
  }, [files]);

  const viewedCount = files.filter((f) => viewedFiles.has(f.filePath)).length;

  return (
    <nav className="file-tree">
      <div className="file-tree-header">
        <span className="metric-label">Files changed</span>
        <span className="file-tree-progress">
          {viewedCount} / {files.length} reviewed
        </span>
      </div>
      <div className="file-tree-nodes">
        {tree.map((node) => (
          <FileTreeNodeView
            key={node.path}
            node={node}
            statsMap={statsMap}
            viewedFiles={viewedFiles}
            activeFilePath={activeFilePath}
            onFileClick={onFileClick}
            depth={0}
          />
        ))}
      </div>
    </nav>
  );
}

interface FileTreeNodeViewProps {
  node: FileTreeNode;
  statsMap: Map<string, FileStats>;
  viewedFiles: Set<string>;
  activeFilePath: string | null;
  onFileClick: (filePath: string) => void;
  depth: number;
}

function FileTreeNodeView({
  node,
  statsMap,
  viewedFiles,
  activeFilePath,
  onFileClick,
  depth
}: FileTreeNodeViewProps) {
  const [expanded, setExpanded] = useState(true);

  if (!node.isDirectory) {
    const stats = statsMap.get(node.path);
    const isActive = activeFilePath === node.path;
    const isViewed = viewedFiles.has(node.path);

    return (
      <button
        className={`file-tree-file${isActive ? ' file-tree-active' : ''}${isViewed ? ' file-tree-viewed' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onFileClick(node.path)}
        type="button"
      >
        <span className="file-tree-file-name">{node.name}</span>
        {stats ? (
          <span className="file-tree-file-stats">
            {stats.additions > 0 ? <span className="diff-stat-add">+{stats.additions}</span> : null}
            {stats.deletions > 0 ? <span className="diff-stat-del">-{stats.deletions}</span> : null}
          </span>
        ) : null}
        {isViewed ? <span className="file-tree-viewed-dot" title="Reviewed" /> : null}
      </button>
    );
  }

  return (
    <div className="file-tree-dir">
      <button
        className="file-tree-dir-toggle"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <span className={`file-tree-chevron${expanded ? ' expanded' : ''}`}>&#x25B6;</span>
        <span className="file-tree-dir-name">{node.name}</span>
      </button>
      {expanded ? (
        <div className="file-tree-dir-children">
          {node.children.map((child) => (
            <FileTreeNodeView
              key={child.path}
              node={child}
              statsMap={statsMap}
              viewedFiles={viewedFiles}
              activeFilePath={activeFilePath}
              onFileClick={onFileClick}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
