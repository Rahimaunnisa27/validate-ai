import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Router } from 'express';
import {
  PERSONA_DISCLAIMER,
  personaGenerateInputSchema,
  personaUpdateSchema,
} from '../../../src/shared/phase3aSchemas.ts';
import { getDb } from '../../db.ts';
import { type AuthenticatedRequest, requireAuth } from '../../middleware/auth.ts';
import { createRateLimiter } from '../../middleware/rateLimit.ts';
import type { LlmDriver } from '../../services/llmClient.ts';
import { generateCustomerPersona } from '../../services/personasAi.ts';
import { writeAuditLog } from '../../utils/audit.ts';
import { AppError, asyncHandler } from '../../utils/errors.ts';

export interface PersonasRouterOptions {
  llmDriver?: LlmDriver;
}

interface PersonaRow {
  id: string;
  user_id: string;
  idea_id: string | null;
  name: string;
  idea_summary: string;
  industry: string;
  product: string;
  location: string;
  problem: string;
  segment: string;
  needs_json: string;
  pain_points_json: string;
  motivations_json: string;
  objections_json: string;
  preferred_channels_json: string;
  purchase_considerations_json: string;
  disclaimer: string;
  created_at: string;
  updated_at: string;
  idea_title: string | null;
}

function serializePersona(row: PersonaRow) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    ideaTitle: row.idea_title,
    name: row.name,
    idea: row.idea_summary,
    industry: row.industry,
    product: row.product,
    location: row.location,
    problem: row.problem,
    segment: row.segment,
    needs: JSON.parse(row.needs_json) as string[],
    painPoints: JSON.parse(row.pain_points_json) as string[],
    motivations: JSON.parse(row.motivations_json) as string[],
    objections: JSON.parse(row.objections_json) as string[],
    preferredChannels: JSON.parse(row.preferred_channels_json) as string[],
    purchaseConsiderations: JSON.parse(row.purchase_considerations_json) as string[],
    disclaimer: PERSONA_DISCLAIMER,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fetchPersonaById(
  db: Database.Database,
  id: string,
  userId: string,
): PersonaRow | undefined {
  return db
    .prepare(
      `SELECT p.*, i.title as idea_title
       FROM customer_personas p
       LEFT JOIN ideas i ON i.id = p.idea_id AND i.user_id = p.user_id
       WHERE p.id = ? AND p.user_id = ?`,
    )
    .get(id, userId) as PersonaRow | undefined;
}

const generateLimiter = createRateLimiter({
  name: 'personas-generate',
  windowMs: 60_000,
  maxRequests: 20,
});

export function createPersonasRouter(options?: PersonasRouterOptions): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT p.*, i.title as idea_title
           FROM customer_personas p
           LEFT JOIN ideas i ON i.id = p.idea_id AND i.user_id = p.user_id
           WHERE p.user_id = ?
           ORDER BY p.updated_at DESC`,
        )
        .all(req.user!.id) as PersonaRow[];

      res.json({ items: rows.map(serializePersona) });
    }),
  );

  router.post(
    '/generate',
    generateLimiter,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const parsed = personaGenerateInputSchema.parse(req.body);
      const cleanIdeaId = parsed.ideaId && parsed.ideaId.trim() ? parsed.ideaId.trim() : null;

      if (cleanIdeaId) {
        const ownedIdea = db
          .prepare('SELECT id FROM ideas WHERE id = ? AND user_id = ?')
          .get(cleanIdeaId, userId);
        if (!ownedIdea) {
          throw new AppError(404, 'IDEA_NOT_FOUND', 'Idea not found.');
        }
      }

      const { profile, disclaimer } = await generateCustomerPersona(
        { ...parsed, ideaId: cleanIdeaId },
        options?.llmDriver,
      );

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO customer_personas (
           id, user_id, idea_id, name, idea_summary, industry, product, location, problem,
           segment, needs_json, pain_points_json, motivations_json, objections_json,
           preferred_channels_json, purchase_considerations_json, disclaimer,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        cleanIdeaId,
        profile.name,
        parsed.idea,
        parsed.industry,
        parsed.product,
        parsed.location,
        parsed.problem,
        profile.segment,
        JSON.stringify(profile.needs),
        JSON.stringify(profile.painPoints),
        JSON.stringify(profile.motivations),
        JSON.stringify(profile.objections),
        JSON.stringify(profile.preferredChannels),
        JSON.stringify(profile.purchaseConsiderations),
        disclaimer,
        now,
        now,
      );

      writeAuditLog({
        userId,
        action: 'persona.generated',
        resourceType: 'customer_persona',
        resourceId: id,
        metadata: { ideaId: cleanIdeaId, industry: parsed.industry },
        req,
      });

      const savedRow = fetchPersonaById(db, id, userId)!;
      res.status(201).json({ persona: serializePersona(savedRow) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const row = fetchPersonaById(db, String(req.params.id), req.user!.id);
      if (!row) {
        throw new AppError(404, 'PERSONA_NOT_FOUND', 'Customer persona not found.');
      }
      res.json({ persona: serializePersona(row) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const personaId = String(req.params.id);

      const existing = fetchPersonaById(db, personaId, userId);
      if (!existing) {
        throw new AppError(404, 'PERSONA_NOT_FOUND', 'Customer persona not found.');
      }

      const parsed = personaUpdateSchema.parse(req.body);
      const now = new Date().toISOString();

      db.prepare(
        `UPDATE customer_personas
         SET name = ?,
             idea_summary = ?,
             industry = ?,
             product = ?,
             location = ?,
             problem = ?,
             segment = ?,
             needs_json = ?,
             pain_points_json = ?,
             motivations_json = ?,
             objections_json = ?,
             preferred_channels_json = ?,
             purchase_considerations_json = ?,
             disclaimer = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(
        parsed.name,
        parsed.idea,
        parsed.industry,
        parsed.product,
        parsed.location,
        parsed.problem,
        parsed.segment,
        JSON.stringify(parsed.needs),
        JSON.stringify(parsed.painPoints),
        JSON.stringify(parsed.motivations),
        JSON.stringify(parsed.objections),
        JSON.stringify(parsed.preferredChannels),
        JSON.stringify(parsed.purchaseConsiderations),
        PERSONA_DISCLAIMER,
        now,
        personaId,
        userId,
      );

      writeAuditLog({
        userId,
        action: 'persona.updated',
        resourceType: 'customer_persona',
        resourceId: personaId,
        req,
      });

      const updatedRow = fetchPersonaById(db, personaId, userId)!;
      res.json({ persona: serializePersona(updatedRow) });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler((req: AuthenticatedRequest, res) => {
      const db = getDb();
      const userId = req.user!.id;
      const personaId = String(req.params.id);

      const result = db
        .prepare('DELETE FROM customer_personas WHERE id = ? AND user_id = ?')
        .run(personaId, userId);
      if (result.changes === 0) {
        throw new AppError(404, 'PERSONA_NOT_FOUND', 'Customer persona not found.');
      }

      writeAuditLog({
        userId,
        action: 'persona.deleted',
        resourceType: 'customer_persona',
        resourceId: personaId,
        req,
      });

      res.json({ ok: true });
    }),
  );

  return router;
}
