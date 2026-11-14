import { Router } from 'express';
import { getDb } from '../../db.ts';
import { asyncHandler } from '../../utils/errors.ts';

const router = Router();

router.get(
  '/',
  asyncHandler((_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, slug, name, price_inr, currency, description, features_json, is_recommended, sort_order
         FROM report_plans
         WHERE is_active = 1
         ORDER BY sort_order ASC`,
      )
      .all() as Array<{
      id: string;
      slug: string;
      name: string;
      price_inr: number;
      currency: string;
      description: string;
      features_json: string;
      is_recommended: number;
      sort_order: number;
    }>;

    res.json({
      plans: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        priceInr: row.price_inr,
        currency: row.currency,
        description: row.description,
        features: JSON.parse(row.features_json) as string[],
        isRecommended: row.is_recommended === 1,
      })),
    });
  }),
);

export default router;
