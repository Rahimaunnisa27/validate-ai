import { Router } from 'express';
import { getIntegrationStatuses } from '../../config.ts';
import { getDb } from '../../db.ts';
import { getGeminiStartupState } from '../../services/llmClient.ts';
import { asyncHandler } from '../../utils/errors.ts';

const router = Router();

router.get(
  '/status',
  asyncHandler((_req, res) => {
    let dbReachable = false;
    try {
      const db = getDb();
      const row = db.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;
      dbReachable = row?.ok === 1;
    } catch {
      dbReachable = false;
    }

    const gemini = getGeminiStartupState();
    const base = getIntegrationStatuses(dbReachable, gemini);
    res.json({
      ...base,
      gemini: {
        checked: gemini.checked,
        keyLast4: gemini.keyLast4,
        resolvedLlmModel: gemini.resolvedLlmModel,
        resolvedEmbeddingModel: gemini.resolvedEmbeddingModel,
        usedAutoFallback: gemini.usedAutoFallback,
        availableFlashModelsCount: gemini.availableFlashModels.length,
        error: gemini.error,
      },
    });
  }),
);

export default router;
