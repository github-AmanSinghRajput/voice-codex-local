export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

interface TrieNode {
  segment: string;
  fullPath: string;
  children: Map<string, TrieNode>;
  isFile: boolean;
}

export function buildFileTree(paths: string[]): FileTreeNode[] {
  if (paths.length === 0) {
    return [];
  }

  const root: Map<string, TrieNode> = new Map();

  for (const filePath of paths) {
    const segments = filePath.split('/');
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      const partialPath = segments.slice(0, i + 1).join('/');

      if (!current.has(segment)) {
        current.set(segment, {
          segment,
          fullPath: partialPath,
          children: new Map(),
          isFile: isLast
        });
      }

      const node = current.get(segment)!;
      if (isLast) {
        node.isFile = true;
      }
      current = node.children;
    }
  }

  return sortNodes(collapseNodes(trieToTree(root)));
}

function trieToTree(nodes: Map<string, TrieNode>): FileTreeNode[] {
  const result: FileTreeNode[] = [];

  for (const node of nodes.values()) {
    const children = trieToTree(node.children);
    result.push({
      name: node.segment,
      path: node.fullPath,
      isDirectory: !node.isFile,
      children
    });
  }

  return result;
}

function collapseNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.map((node) => {
    if (!node.isDirectory) {
      return node;
    }

    let current = node;
    while (
      current.isDirectory &&
      current.children.length === 1 &&
      current.children[0].isDirectory
    ) {
      const child = current.children[0];
      current = {
        name: `${current.name}/${child.name}`,
        path: child.path,
        isDirectory: true,
        children: child.children
      };
    }

    return {
      ...current,
      children: collapseNodes(current.children)
    };
  });
}

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) =>
      node.isDirectory
        ? { ...node, children: sortNodes(node.children) }
        : node
    );
}
