// @bizcity-layer K kernel/conformance
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — gắn action Kiểm chuẩn (ADR-0012, S020-18).
/** Kiểm chuẩn (Conformance Engine, ADR-0012): POST /api/v1/conformance/runs · GET /api/v1/conformance/runs/latest. */
import type { FastifyInstance } from 'fastify';
import { mountActions } from '@bizcity/platform/core/actions';
import { conformanceActions } from './conformance.actions.js';

export async function conformanceRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, conformanceActions);
}
