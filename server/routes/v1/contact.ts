import crypto from 'node:crypto';
import { Router } from 'express';
import { contactSchema } from '../../../src/shared/schemas.ts';
import { config } from '../../config.ts';
import { getDb } from '../../db.ts';
import { createRateLimiter } from '../../middleware/rateLimit.ts';
import { asyncHandler } from '../../utils/errors.ts';

const router = Router();

const contactLimiter = createRateLimiter({
  name: 'contact',
  windowMs: 60 * 1000,
  maxRequests: 5,
});

router.post(
  '/',
  contactLimiter,
  asyncHandler((req, res) => {
    const parsed = contactSchema.parse(req.body);
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO contact_messages (id, name, email, subject, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`,
    ).run(id, parsed.name, parsed.email, parsed.subject, parsed.message, now, now);

    const emailConfigured = Boolean(config.smtpHost && config.smtpUser && config.smtpPass);

    res.status(201).json({
      id,
      saved: true,
      emailDelivered: false,
      emailConfigured,
      message: emailConfigured
        ? 'Your message has been saved and queued for email notification.'
        : 'Your message has been saved to our database. Note: automated SMTP email notification is not configured on this environment.',
    });
  }),
);

export default router;
