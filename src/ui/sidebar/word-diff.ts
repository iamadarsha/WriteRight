/**
 * Minimal word-level diff for the rewrite preview (§3.5). Longest-common-
 * subsequence over whitespace-delimited tokens — good enough to visualize a
 * handful of safe edits without pulling in a diff library.
 */

export type DiffOp =
  | { readonly type: 'equal'; readonly text: string }
  | { readonly type: 'insert'; readonly text: string }
  | { readonly type: 'delete'; readonly text: string };

function tokenize(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], token: string): void => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) {
      ops[ops.length - 1] = { type, text: last.text + token };
    } else {
      ops.push({ type, text: token });
    }
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('equal', a[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push('delete', a[i]!);
      i++;
    } else {
      push('insert', b[j]!);
      j++;
    }
  }
  while (i < n) push('delete', a[i++]!);
  while (j < m) push('insert', b[j++]!);

  return ops;
}
