// @bizcity-layer K+D kernel/intake
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — phiếu kế toán nháp chờ duyệt (Q009-1 a): draftIn lưu sự việc pending không bút toán, approve ghi qua eventStore; accounting.journal.post.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/vouchers/voucher.routes.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
/**
 * Chứng từ kế toán nhập tay (phiếu thu, phiếu chi, phiếu kế toán).
 *   POST /api/v1/vouchers        lập phiếu và ghi sổ
 *   PUT  /api/v1/vouchers/:id    sửa phiếu (đảo bút toán cũ, ghi bút toán mới; phiếu nháp: sửa rồi ghi sổ)
 *   POST /api/v1/vouchers/:id/approve  duyệt phiếu nháp trợ lý AI đề xuất (accounting.journal.post) → ghi sổ
 *
 * Xem danh sách, chi tiết, huỷ phiếu dùng chung đường dẫn chứng từ:
 *   GET  /api/v1/documents?docType=receipt|payment|manual
 *   GET  /api/v1/documents/:id
 *   POST /api/v1/documents/cancel
 * Ghi: action core.voucher.{create,update}, core.opening-balance.{create,update} (W6, SC-ACT-1).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { openingInputSchema, voucherInputSchema } from '@ketoan/contracts';
import { idParamSchema } from '@bizcity/platform/core/http';
import { voucherService } from './voucher.service.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { voucherActions } from './voucher.actions.js';

const tags = ['Chứng từ nhập tay'];

export async function voucherRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, voucherActions);
  mountActions(app, manualWriteActions);
}

// [2026-11-03 02:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 2 (SC-ACT-1): lập / sửa phiếu nhập tay, số dư đầu kỳ qua defineAction — service *In chạy trong giao dịch của runtime
// (nhật ký nghiệp vụ <loại>.create / .update vẫn do service ghi; bằng chứng action do runtime). Lập mới bắt buộc khoá idempotency.
const docOut = z.custom<{ id: string; docKey: string; docNo: string; version: number; entryIds: string[] }>((v) => typeof v === 'object' && v !== null && 'docKey' in v);

export const manualWriteActions: AnyActionDef[] = [
  defineAction({
    id: 'core.voucher.create', title: 'Lập phiếu thu / phiếu chi / phiếu kế toán', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
    input: voucherInputSchema, output: docOut,
    expose: { http: { method: 'POST', path: '/api/v1/vouchers', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'source_document', objectId: (_i, o) => o.docKey },
    handler: (ctx, input) => voucherService.createIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.voucher.update', title: 'Sửa phiếu nhập tay', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'natural',
    input: voucherInputSchema.extend({ id: idParamSchema.shape.id }), output: docOut,
    expose: { http: { method: 'PUT', path: '/api/v1/vouchers/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'source_document', objectId: (_i, o) => o.docKey },
    handler: (ctx, { id, ...input }) => voucherService.updateIn(ctx.data.tx, ctx.legacyAuth, id, input),
  }),
  // Số dư tài khoản đầu kỳ: danh sách và huỷ dùng chung /api/v1/documents (docType=opening).
  defineAction({
    id: 'core.opening-balance.create', title: 'Nhập số dư tài khoản đầu kỳ', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
    input: openingInputSchema, output: docOut,
    expose: { http: { method: 'POST', path: '/api/v1/opening-balances', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'source_document', objectId: (_i, o) => o.docKey },
    handler: (ctx, input) => voucherService.createOpeningIn(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.opening-balance.update', title: 'Sửa số dư tài khoản đầu kỳ', tags,
    permission: 'documents:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'natural',
    input: openingInputSchema.extend({ id: idParamSchema.shape.id }), output: docOut,
    expose: { http: { method: 'PUT', path: '/api/v1/opening-balances/:id' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'source_document', objectId: (_i, o) => o.docKey },
    handler: (ctx, { id, ...input }) => voucherService.updateOpeningIn(ctx.data.tx, ctx.legacyAuth, id, input),
  }),
];
