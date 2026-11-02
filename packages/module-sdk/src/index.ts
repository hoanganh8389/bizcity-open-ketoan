// @bizcity-layer P module-sdk
// [2026-11-02 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — @bizcity/module-sdk v0.1 (PHASES 3.1, ADR-0011 D6): mặt tiền chọn lọc của Platform + defineModule; không mở db / Kernel
/**
 * @bizcity/module-sdk — thứ DUY NHẤT một module Bizcity import từ Bizcity (API.md §1, ADR-0011 D6).
 *
 * Xuất lại CÓ CHỌN LỌC từ @bizcity/platform (không `export *`): khai action / subscriber, kiểu ngữ cảnh, lỗi chuẩn, zod, tiền.
 * Cố ý KHÔNG có (API.md §4): `db` / Kysely gốc, kiểu bảng, `writeAudit`, `requirePermission`, `ok`, `@opentelemetry/*`,
 * `postDocumentIn`, `ledgerService`, `eventStore`, `voucherService`. Module ghi sổ qua `ctx.ledger.submit`, đọc sổ qua
 * `ctx.ledger.query`, bằng chứng do runtime ghi.
 *
 * v0.1 (2026-11-02): `defineModule` kiểm khai báo khớp manifest; registry nạp module theo manifest + hash là PHASES 3.13.
 * `ctx.data.tx` vẫn là giao dịch Kysely đầy đủ (giới hạn theo schema mod_<key> ở PHASES 3.10 / ADR-0011 D4).
 */
import { DOC_REF_RE } from '@ketoan/contracts';
import type { AnyActionDef } from '@bizcity/platform/core/actions';
import type { SubscriberDef } from '@bizcity/platform/core/events';
import type { ModuleManifestLike } from './manifest.js';

// ── Khai báo ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export { defineAction } from '@bizcity/platform/core/actions';
export type { ActionContext, ActionDef, AnyActionDef, ActionEffect, ActionIdempotency, ActionSideEffect } from '@bizcity/platform/core/actions';
export { defineSubscriber } from '@bizcity/platform/core/events';
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G3): điểm móc của Core (masterdata.referenceCheck)
export { defineHook, HOOKS } from '@bizcity/platform/core/hooks';
export type { HookDef, HookContext, ReferenceCheckInput } from '@bizcity/platform/core/hooks';
export type { NotifyInput } from '@bizcity/platform/core/notify';
import type { HookDef } from '@bizcity/platform/core/hooks';
export type { SubscriberDef, SubscriberContext, EventEnvelope } from '@bizcity/platform/core/events';

// ── Lỗi chuẩn (bizcity_errors@1): module ném Errors.*, không tự đặt mã HTTP ────────────────────────────────────────────────
export { Errors, AppError } from '@bizcity/platform/core/errors';
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G1): máy trạng thái khai báo (documents.workflow) cho chứng từ của module — tệp <loại>.workflow.yaml cạnh mã
/** Nạp `<loại>.workflow.yaml` (`loadWorkflow(new URL('./x.workflow.yaml', import.meta.url))`); `wf.plan(doc, transition, workflowActor(...))` quyết được chuyển không. */
export { loadWorkflow, parseWorkflow, Workflow, STATUS_GROUPS } from '@bizcity/platform/core/workflow';
export type { WorkflowDoc, WorkflowActor, WorkflowStep, StatusGroup } from '@bizcity/platform/core/workflow';
export type { ErrorCode } from '@ketoan/contracts';

// ── Tiện ích thuần ────────────────────────────────────────────────────────────────────────────────────────────────────────
export { z } from 'zod';
// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W1: sql — câu SQL có tham số cho bảng của chính module (mod_<key>.*) trong ctx.data.module(tx => …); kiểu Database của Core không biết bảng module.
/** Câu SQL có tham số (`${giá trị}` thành tham số, không ghép chuỗi — R-SEC). Dùng trong ctx.data.module cho bảng mod_<key>.*. */
export { sql } from 'kysely';
/** Tiền numeric(18,2): cộng trừ bằng xu, không cộng số thực. */
export { toCents, fromCents, sumMoney, roundDong, moneyEquals } from '@ketoan/contracts';
export type { DocRef, IngestResult, LedgerQuery, LedgerQueryRow } from '@ketoan/contracts';

/** docRef của chứng từ module: `<module>.<loại>:<id>` (bizcity_document@1 §3) — dùng cho ctx.documents.*, sự kiện, liên kết. */
export function docRef(type: string, id: string | number): string {
  const ref = `${type}:${id}`;
  if (!DOC_REF_RE.test(ref)) throw new Error(`docRef "${ref}" sai khuôn <module>.<loại>:<id>`);
  return ref;
}

// ── Module ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type { ModuleManifestLike } from './manifest.js';

export interface ModuleDef {
  manifest: ModuleManifestLike;
  actions: AnyActionDef[];
  subscribers: SubscriberDef[];
  hooks: HookDef[];
}

/**
 * Nối mã của module vào manifest `bizcity.module.json` (bizcity_module@1). Kiểm ngay khi nạp module, lỗi là dừng:
 *   - manifest đúng contract, kind module;
 *   - mỗi action có id `<key>.…` (STD-ACT-6; miễn bằng waiver STD-ACT-6 còn hạn) và nằm trong `manifest.actions`;
 *   - mỗi subscriber có module = key, id `<key>.…`.
 * Schema đầy đủ, năng lực, docType: bộ kiểm (SC-CON-2) — không lặp ở đây.
 */
export function defineModule(def: { manifest: ModuleManifestLike; actions?: AnyActionDef[]; subscribers?: SubscriberDef[]; hooks?: HookDef[] }): ModuleDef {
  const m = def.manifest;
  const bad: string[] = [];
  if (m.contract !== 'bizcity_module@1') bad.push(`contract "${m.contract}" (cần bizcity_module@1)`);
  if (m.kind !== 'module') bad.push(`kind "${m.kind}" (defineModule chỉ cho module)`);
  const today = new Date().toISOString().slice(0, 10);
  const waived = new Set((m.waivers ?? []).filter((w) => w.expires && w.expires >= today).map((w) => w.rule));
  const declared = new Set(m.actions ?? []);
  for (const a of def.actions ?? []) {
    if (!a.id.startsWith(`${m.key}.`) && !waived.has('STD-ACT-6')) bad.push(`action ${a.id} phải bắt đầu "${m.key}." (STD-ACT-6)`);
    if (!declared.has(a.id)) bad.push(`action ${a.id} chưa khai trong manifest.actions (STD-MOD-2)`);
  }
  for (const s of def.subscribers ?? []) {
    if (s.module !== m.key) bad.push(`subscriber ${s.id}: module "${s.module}" ≠ "${m.key}"`);
    if (!s.id.startsWith(`${m.key}.`)) bad.push(`subscriber ${s.id} phải bắt đầu "${m.key}."`);
  }
  for (const h of def.hooks ?? []) if (h.module !== m.key) bad.push(`hook ${h.id}: module "${h.module}" ≠ "${m.key}"`);
  if (bad.length) throw new Error(`Module ${m.id ?? m.key}: ${bad.join('; ')}`);
  return Object.freeze({ manifest: m, actions: def.actions ?? [], subscribers: def.subscribers ?? [], hooks: def.hooks ?? [] });
}
