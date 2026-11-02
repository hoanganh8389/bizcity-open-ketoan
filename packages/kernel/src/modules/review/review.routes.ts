// @bizcity-layer K kernel/review
// [2026-11-02 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W4: gắn action Bàn đánh giá.
/** Bàn đánh giá (HT08): GET /api/v1/system/review-board · GET /api/v1/system/review-board/recheck. */
import type { FastifyInstance } from 'fastify';
import { mountActions } from '@bizcity/platform/core/actions';
import { reviewActions } from './review.actions.js';

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, reviewActions);
}
