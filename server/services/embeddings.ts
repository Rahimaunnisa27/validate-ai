import type Database from 'better-sqlite3';

export const LOCAL_EMBEDDING_MODEL = 'local-hash-256';
const LOCAL_EMBEDDING_DIMS = 256;

export interface SimilarIdeaMatch {
  ideaId: string;
  title: string;
  status: 'draft' | 'submitted';
  similarityScore: number;
}

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic zero-dependency local semantic embedding using signed feature hashing
 * over normalized tokens, word bigrams, and character trigrams. Used automatically
 * when no free-tier Gemini embedding model is accessible to the active API key.
 */
export function computeLocalEmbedding(text: string, dims = LOCAL_EMBEDDING_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0);
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    vec[0] = 1;
    return vec;
  }

  const tokens = cleaned.split(' ').filter((t) => t.length >= 2);
  const addFeature = (feature: string, weight: number) => {
    const h1 = fnv1a32(feature);
    const h2 = fnv1a32(`sign:${feature}`);
    const idx = h1 % dims;
    const sign = (h2 & 1) === 0 ? 1 : -1;
    vec[idx] += sign * weight;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    addFeature(`w:${tok}`, 1.5);
    if (i + 1 < tokens.length) {
      addFeature(`bg:${tok}_${tokens[i + 1]}`, 1.2);
    }
    if (tok.length >= 4) {
      for (let j = 0; j <= tok.length - 3; j++) {
        addFeature(`c3:${tok.slice(j, j + 3)}`, 0.45);
      }
    }
  }

  let normSq = 0;
  for (let i = 0; i < dims; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm === 0) {
    vec[0] = 1;
    return vec;
  }

  for (let i = 0; i < dims; i++) {
    vec[i] = Math.round((vec[i] / norm) * 1_000_000) / 1_000_000;
  }
  return vec;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return 0;
    }
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0 || !Number.isFinite(denom)) {
    return 0;
  }

  const score = dot / denom;
  return Number.isFinite(score) ? score : 0;
}

export function findSimilarUserIdeas(
  db: Database.Database,
  userId: string,
  currentIdeaId: string,
  currentEmbedding: number[],
  topK = 3,
): SimilarIdeaMatch[] {
  const rows = db
    .prepare(
      `SELECT id, title, status, embedding_json
       FROM ideas
       WHERE user_id = ? AND id != ? AND embedding_json IS NOT NULL`,
    )
    .all(userId, currentIdeaId) as Array<{
    id: string;
    title: string;
    status: 'draft' | 'submitted';
    embedding_json: string;
  }>;

  const matches: SimilarIdeaMatch[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.embedding_json) as unknown;
      if (!Array.isArray(parsed)) continue;
      const vec = parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      if (vec.length !== currentEmbedding.length || vec.length === 0) continue;

      const score = cosineSimilarity(currentEmbedding, vec);
      matches.push({
        ideaId: row.id,
        title: row.title,
        status: row.status,
        similarityScore: Math.round(score * 10000) / 10000,
      });
    } catch {
      // Ignore malformed historical embeddings safely.
    }
  }

  matches.sort((a, b) => b.similarityScore - a.similarityScore);
  return matches.slice(0, topK);
}
