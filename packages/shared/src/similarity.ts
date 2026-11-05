// Structural code similarity.
//
// Normalizes source, then compares token 4-grams (shingles) with Jaccard.
// Renamed copies still match because identifiers are replaced with a
// placeholder. Short problems can match by chance - that is stated in the
// UI and a person makes every decision. No tool can prove AI authorship.
//
// Reading buckets:
//   < 0.10  Distinct
//   < 0.35  Some overlap
//   >= 0.35 Review closely

export interface SimilarityResult {
  jaccard: number;
  sharedShingles: number;
  aShingles: number;
  bShingles: number;
  reading: 'Distinct' | 'Some overlap' | 'Review closely';
}

export const SIMILARITY_THRESHOLDS = {
  DISTINCT_MAX: 0.1,
  SOME_OVERLAP_MAX: 0.35,
} as const;

/**
 * Normalize source code for comparison:
 *   - strip comments (line and block)
 *   - collapse whitespace to single spaces
 *   - replace identifiers with a single placeholder
 *   - replace numeric literals with a placeholder
 *   - keep keywords, operators and punctuation
 */
export function normalizeCode(code: string): string {
  // Block comments first, then line comments.
  let s = code.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  // Strings - replace with a placeholder so string contents don't count.
  s = s.replace(/'(?:[^'\\]|\\.)*'/g, 'STR');
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, 'STR');
  // Template literals (rough).
  s = s.replace(/`(?:[^`\\]|\\.)*`/g, 'STR');

  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim();

  // Replace identifiers. A simple heuristic: sequences of letters/digits/underscore
  // that are not operators or known keywords become ID.
  const keywords = new Set([
    'if', 'else', 'for', 'while', 'do', 'return', 'function', 'const', 'let', 'var',
    'class', 'def', 'public', 'private', 'protected', 'static', 'new', 'this', 'super',
    'import', 'export', 'from', 'as', 'async', 'await', 'try', 'catch', 'finally',
    'throw', 'switch', 'case', 'default', 'break', 'continue', 'void', 'int', 'float',
    'double', 'char', 'boolean', 'long', 'short', 'byte', 'true', 'false', 'null',
    'none', 'None', 'True', 'False', 'print', 'include', 'using', 'namespace', 'struct',
    'enum', 'interface', 'impl', 'fn', 'let', 'mut', 'pub', 'crate', 'self', 'Self',
    'package', 'func', 'go', 'chan', 'map', 'range', 'select', 'type', 'struct',
    'in', 'is', 'and', 'or', 'not', 'lambda', 'with', 'pass', 'del', 'raise', 'except',
    'yield', 'global', 'nonlocal', 'assert', 'sizeof', 'template', 'typename',
  ]);

  // Replace numeric literals.
  s = s.replace(/\b0[xX][0-9a-fA-F]+\b/g, 'NUM');
  s = s.replace(/\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, 'NUM');

  // Replace remaining identifiers.
  s = s.replace(/[A-Za-z__$][A-Za-z0-9_$]*/g, (m) => {
    if (keywords.has(m) || m === 'STR' || m === 'NUM') return m;
    return 'ID';
  });

  return s;
}

/**
 * Extract token 4-grams (shingles) from a normalized string.
 */
export function shingles(text: string, n: number = 4): string[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < n) return [tokens.join(' ')];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

/**
 * Jaccard similarity over shingle sets.
 */
export function jaccardSimilarity(a: string, b: string): SimilarityResult {
  const sa = new Set(shingles(normalizeCode(a)));
  const sb = new Set(shingles(normalizeCode(b)));

  let shared = 0;
  for (const s of sa) {
    if (sb.has(s)) shared++;
  }

  const union = sa.size + sb.size - shared;
  const jaccard = union === 0 ? 0 : shared / union;

  let reading: SimilarityResult['reading'];
  if (jaccard < SIMILARITY_THRESHOLDS.DISTINCT_MAX) reading = 'Distinct';
  else if (jaccard < SIMILARITY_THRESHOLDS.SOME_OVERLAP_MAX) reading = 'Some overlap';
  else reading = 'Review closely';

  return {
    jaccard: Math.round(jaccard * 1000) / 1000,
    sharedShingles: shared,
    aShingles: sa.size,
    bShingles: sb.size,
    reading,
  };
}