// @bizcity-layer P actions
// [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5).
// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
// [2026-10-30 11:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — MCP cho trợ lý AI: POST /mcp, công cụ sinh từ action, xác nhận trước khi ghi (PHASES 2.11, 2.12).
// [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp.
// [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc.
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất.
// [2026-10-31 08:14 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7, S012-2): ctx.ledger.query trong giao dịch của action, Kernel đăng ký bằng registerLedgerReader ở app.ts
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/core/actions.ts sang packages/platform (@bizcity/platform, D010-7 chặng 2); import tương đối viết lại theo chỗ mới
/**
 * RUNTIME ACTION (bizcity_action@1, PHASES 2.5) — một khai báo `defineAction` sinh route HTTP + mô tả OpenAPI; registry dùng chung
 * cho MCP (2.12), CLI. Runtime làm thay handler các bước ACTION §4:
 *   quyền → kiểm input (zod) → idempotency (action_requests) → mở giao dịch → handler → bằng chứng (audit_logs) → lưu phản hồi
 *   → commit, hoặc rollback khi dry-run → { ok, data, meta: { requestId, dryRun?, idempotency?, receipt? } }.
 * Bằng chứng (bizcity_evidence@1): action ghi chạy thật → đúng một bản ghi audit_logs (kể cả khi lỗi nghiệp vụ, ở giao dịch riêng),
 * biên nhận meta.receipt = { evidenceId, hash, at }; gửi lặp trả lại biên nhận lần đầu.
 * Handler không gọi requirePermission, writeAudit, reply.status, không tự mở giao dịch (ACTION §4).
 *
 * Idempotency (§8): header `Idempotency-Key` (8–128 ký tự). Dòng action_requests ghi trong CÙNG giao dịch với handler: lỗi thì
 * không có dòng (gửi lại được); hai yêu cầu cùng khoá song song → yêu cầu sau chờ khoá duy nhất của yêu cầu trước rồi trả lại
 * phản hồi đó. Dry-run (`?dryRun=1`): chạy thật trong giao dịch rồi huỷ — mẫu tro-ly /simulate; không ghi idempotency, bằng chứng.
 *
 * Trước Phase 3 (tách @bizcity/module-sdk) ctx còn `legacyAuth` để handler đang chuyển gọi service cũ cần AuthContext
 * (voucherService…). Không đưa vào SDK — packages/module-sdk/API.md §5.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql, type Transaction } from 'kysely';
import { asModuleRole } from '../db/module-db.js';
import { sendNotification, type NotifyInput } from './notify.js';
import { z } from 'zod';
import { ERROR_CODES, docRefModule, type IngestResult, type AttachmentRef, type DocLinkRole, type DocRef, type DocumentLink, type DocumentSignature, type DocumentVersion, type ErrorCode, type FileInput, type LedgerQuery, type LedgerQueryRow } from '@ketoan/contracts';
import { db } from '../db/client.js';
import type { Database } from '../db/types.js';
import { env } from '../config/env.js';
import { writeEvidence, type EvidenceEntry, type EvidenceReceipt } from './audit.js';
import { emitEvent } from './events.js';
import { AppError, Errors } from './errors.js';
import { ok, queryBool } from './http.js';
import { metrics } from './metrics.js';
import { currentRequest } from './request-context.js';
import { withSpan } from './tracing.js';
import { documents } from './documents.js';
import { readSetting } from './settings.js';
import { isHighRiskPermission, isKnownPermission, type AuthContext, type Permission } from './auth.js';

export type ActionEffect = 'read' | 'write';
export type ActionIdempotency = 'required' | 'natural' | 'none';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/**
 * Capability Contract (CONG-BO-KIEN-TRUC §3): action ghi chạm vào đâu — ledger = có thể sinh bút toán (qua một cửa sổ cái).
 * analysis = chỉ lưu kết quả phân tích của Core (vd lượt Kiểm chuẩn); không đổi chứng từ, sổ, danh mục, cấu hình.
 */
// [2026-11-02 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — thêm sideEffect 'analysis' cho action chỉ lưu kết quả phân tích (core.conformance.run, ADR-0012)
export type ActionSideEffect = 'documents' | 'ledger' | 'masterdata' | 'settings' | 'external' | 'analysis';

export interface ActionContext {
  readonly actor: { id: string; name: string; kind: AuthContext['kind'] };
  readonly tenant: { id: string };
  readonly requestId: string;
  readonly dryRun: boolean;
  /** Người gọi có quyền này không (quyền phụ trong handler, vd duyệt cấp 2). */
  can(permission: Permission): boolean;
  // [2026-11-02 04:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.10 (ADR-0011 D4): ctx.data.module — đọc ghi bảng của module bằng vai trò mod_<key>_rw (không chạm bảng Kernel ở tầng CSDL)
  data: {
    tx: Transaction<Database>;
    /**
     * Chạy `fn` với vai trò mod_<key>_rw của module (schema mod_<key>, khung nhìn bizcity_read khai trong manifest): PostgreSQL
     * chặn mọi đọc / ghi bảng Kernel trong `fn`. Cùng giao dịch, cùng đơn vị (RLS). Xong (kể cả lỗi) trả về vai trò API.
     * Gọi ctx.ledger / ctx.documents NGOÀI `fn`. Module chưa có CSDL riêng (`module migrate`) → NOT_READY.
     */
    module<T>(fn: (tx: Transaction<Database>) => Promise<T>): Promise<T>;
    /**
     * Một mục của lô (action theo lô): chạy `fn` trong SAVEPOINT của giao dịch action. Mục lỗi chỉ huỷ phần của nó,
     * trả `{ ok: false, error }` để handler báo trong kết quả; các mục khác giữ nguyên, lưu cùng lúc khi cả lô xong.
     */
    item<T>(fn: (tx: Transaction<Database>) => Promise<T>): Promise<ItemResult<T>>;
  };
  evidence: { note(key: string, value: unknown): void };
  // [2026-11-03 05:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main: ctx.meta: phản hồi thêm khoá vào meta (cổng danh mục: gate, findings, held — PHASE-024). Khoá lõi (requestId, receipt, idempotency, dryRun) không bị đè.
  readonly meta: Record<string, unknown>;
  /**
   * Phát sự kiện miền trong giao dịch của action (bizcity_event@1 STD-EVT-1): huỷ / dry-run thì không có sự kiện.
   * Loại phải mang tiền tố module của action (`<module>.`, STD-EVT-3); `bizcity.*` chỉ Core phát.
   */
  events: { emit(type: string, data: Record<string, unknown>, opts: { subject: string; version?: number; dedupeKey?: string }): Promise<string | null> };
  // [2026-11-02 12:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — ctx.ledger.submit (ADR-0011 D5): nộp chứng từ trong giao dịch của action; ctx.settings.get theo registry
  /**
   * Sổ trong giao dịch của action. query: đọc theo mã (ledger.query, BIZCITY-DATA §7) — module không đọc bảng ledger_*.
   * submit: nộp chứng từ bizcity_ledger_intake@1 (ledger.submit, ADR-0011 D5) — chỉ action ghi; docKey phải mang tiền tố
   * `<module>:`, sourceSystem = mã module (module không ghi đè / huỷ chứng từ của nguồn khác). Không số tài khoản: luật định khoản
   * của Kernel + cấu hình đơn vị quyết. Lỗi định khoản ném ra → cả action huỷ (dữ liệu module và sổ cùng commit hoặc cùng huỷ).
   */
  ledger: {
    query(q: LedgerQuery): Promise<LedgerQueryRow[]>;
    submit(doc: Record<string, unknown> & { docKey: string; docType: string }): Promise<IngestResult>;
    // [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.1: ctx.ledger.cancel / get (API.md §3.2) — chỉ chứng từ của chính module
    /** Báo huỷ chứng từ của module (`<module>:…`): chế độ ghi ngay → đảo bút toán + huỷ; chế độ chờ → Chờ huỷ ở ACC14. Chỉ action ghi. */
    cancel(docKey: string, reason: string): Promise<{ requested: boolean; reversed: number; cancelled?: boolean }>;
    /** Trạng thái chứng từ của module theo docKey (không trả nội dung); không có → null. */
    get(docKey: string): Promise<LedgerDocStatus | null>;
    // [2026-11-02 05:55 PM Johnny Chu - Chu Hoàng Anh] ADR-0015 — Q2: chữ ký v1 ctx.ledger.allocateDebt; năng lực ledger.allocate-debt còn planned → CAPABILITY_MISSING (API.md nguyên tắc 2)
    /** Đối trừ hai khoản công nợ cùng đối tượng, cùng tài khoản của chính module (PHASES 3.16). Khác tài khoản: nộp chứng từ qua submit. */
    allocateDebt(input: { partnerCode: string; from: string; to: string; amount: number }): Promise<{ allocated: number }>;
  };
  /** Cấu hình đơn vị theo registry (settings.registry, core/settings.ts): chỉ khoá module sở hữu, khoá lạ là lỗi. */
  settings: { get<T = unknown>(key: string): Promise<T> };
  // [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 (G4)
  /** Thông báo trong ứng dụng (notify.inapp): nguồn = module của action; trả id hoặc null khi trùng dedupeKey. */
  notify: { send(n: NotifyInput): Promise<string | null> };
  // [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ctx.actions.call (module-sdk API.md §2, câu hỏi mở 3): gọi action đọc của module khác
  /** Gọi action đọc công khai của module khác theo mã, với quyền của người gọi (STD-MOD-3; xem callAction). */
  actions: { call<O = unknown>(id: string, input: unknown): Promise<O> };
  /**
   * Bước riêng của module trong trace (ADR-0010 §3): span `step <module>.<tên>` con của span action. Module KHÔNG import
   * @opentelemetry/* (R-OBS-7). Tên: chữ thường, số, gạch ngang, chấm. Thuộc tính đi qua danh sách cho phép — không gắn dữ liệu.
   */
  trace: { step<T>(name: string, fn: () => Promise<T>): Promise<T> };
  // [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — ctx.documents (bizcity_document@1 §7, PHASES 2.7): số, phiên bản, liên kết, đính kèm trong giao dịch của action
  /**
   * Chứng từ dùng chung trong giao dịch của action (core/documents.ts). Ghi (saveVersion, link, attach) chỉ trên docRef của
   * chính module (`<module>.…`, như ctx.events.emit); dãy số tự gắn tiền tố module. Đọc được mọi docRef của đơn vị.
   */
  documents: {
    nextNumber(series: string, opts?: { date?: string; width?: number }): Promise<string>;
    saveVersion(docRef: DocRef, snapshot: unknown): Promise<number>;
    versions(docRef: DocRef): Promise<DocumentVersion[]>;
    link(from: DocRef, to: DocRef, role: DocLinkRole): Promise<void>;
    links(docRef: DocRef): Promise<DocumentLink[]>;
    attach(docRef: DocRef, file: FileInput, meta?: { kind?: string; note?: string }): Promise<AttachmentRef>;
    attachments(docRef: DocRef): Promise<AttachmentRef[]>;
    // [2026-11-01 03:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.signatures: ký / huỷ ký theo vai ở phiên bản hiện tại (chỉ người dùng đăng nhập)
    sign(docRef: DocRef, role: string): Promise<DocumentSignature>;
    signatures(docRef: DocRef): Promise<DocumentSignature[]>;
    unsign(docRef: DocRef, role: string): Promise<void>;
  };
  /** @deprecated Cầu nối Phase 2→3 cho service cũ cần AuthContext. Không có trong @bizcity/module-sdk. */
  readonly legacyAuth: AuthContext;
}

export interface ActionDef<I extends z.AnyZodObject = z.AnyZodObject, O extends z.ZodTypeAny = z.ZodTypeAny> {
  /** `<module>.<thực thể>.<động từ>` (STD-ACT-6), không đổi sau khi phát hành. */
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  input: I;
  output: O;
  /** STD-ACT-2. 'public' chỉ cho action đọc, kèm lý do trong manifest `waivers`. */
  permission: Permission | 'public';
  effect: ActionEffect;
  /** STD-ACT-4: write ⇒ không 'none'. 'natural' = đặt trạng thái tuyệt đối / có kiểm trạng thái, gửi lại không tạo thêm gì. */
  idempotency: ActionIdempotency;
  /** Tác dụng phụ (bắt buộc với effect write, cấm với read). Bằng chứng: write → biên nhận (receipt), read → không. */
  sideEffects?: ActionSideEffect[];
  /** Cho phép ?dryRun=1 (STD-ACT-7: không hiệu ứng ngoài giao dịch). */
  dryRun?: boolean;
  expose: {
    // [2026-11-03 07:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5: query = trường lấy từ query string của POST/PUT/PATCH (gộp vào input); bodyLimit = cỡ thân tối đa (byte)
    http?: { method: HttpMethod; path: string; status?: 200 | 201; query?: z.AnyZodObject; bodyLimit?: number };
    mcp?: boolean;
    ai?: 'deny' | 'read' | 'propose' | 'execute';
    /** Công cụ MCP huỷ / đảo cái đã có (annotations.destructiveHint): client cảnh báo rõ hơn trước khi xác nhận. */
    destructive?: boolean;
  };
  errors?: ErrorCode[];
  /** Đối tượng ghi vào bằng chứng (mặc định: thực thể trong id, mã = output.id). */
  evidence?: { objectType?: string; objectId?: (input: z.infer<I>, output: z.infer<O>) => string | undefined };
  handler(ctx: ActionContext, input: z.infer<I>): Promise<z.infer<O>>;
}

/** Action bất kỳ (đã xoá kiểu input / output) — cho registry và danh sách action của một module. */
export type AnyActionDef = ActionDef<any, any>;

/**
 * Bộ đọc sổ cho ctx.ledger.query. Platform không import Kernel (SC-LAYER-2) nên Kernel đăng ký lúc lắp ráp (app.ts), như
 * tự chẩn đoán và số đo sổ. Chưa đăng ký mà action gọi → lỗi rõ, không trả rỗng (rỗng trông như "sổ không có số").
 */
export type LedgerReader = (tx: Transaction<Database>, tenantId: string, q: LedgerQuery) => Promise<LedgerQueryRow[]>;
let ledgerReader: LedgerReader | null = null;
export function registerLedgerReader(fn: LedgerReader): void {
  ledgerReader = fn;
}

// [2026-11-02 12:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — cửa nộp chứng từ cho ctx.ledger.submit; Kernel đăng ký ở app.ts (Platform không import Kernel)
/** Cửa nộp chứng từ cho ctx.ledger.submit (Kernel: submitDocumentIn). Đăng ký lúc lắp ráp như bộ đọc sổ. */
export type LedgerSubmitter = (tx: Transaction<Database>, auth: AuthContext, doc: unknown) => Promise<IngestResult>;
let ledgerSubmitter: LedgerSubmitter | null = null;
export function registerLedgerSubmitter(fn: LedgerSubmitter): void {
  ledgerSubmitter = fn;
}

// [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.1: cửa huỷ / đọc trạng thái chứng từ cho ctx.ledger.cancel / get; Kernel đăng ký ở app.ts
export interface LedgerDocStatus { docKey: string; version: number; status: string; postedVersion: number | null; cancelRequested: boolean; errorMessage: string | null }
export interface LedgerCancelGate {
  cancel(tx: Transaction<Database>, auth: AuthContext, docKey: string, reason: string): Promise<{ requested: boolean; reversed: number; cancelled?: boolean }>;
  get(tx: Transaction<Database>, tenantId: string, docKey: string): Promise<LedgerDocStatus | null>;
  // [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.16: đối trừ theo docKey (Kernel allocateByDocKeysIn)
  allocate(tx: Transaction<Database>, tenantId: string, input: { partnerCode: string; from: string; to: string; amount: number }, actor: string): Promise<{ allocated: number }>;
}
let ledgerCancelGate: LedgerCancelGate | null = null;
export function registerLedgerCancelGate(g: LedgerCancelGate): void {
  ledgerCancelGate = g;
}

/** Action khai quyền không có trong Core lẫn manifest module (gõ sai / module chưa khai) — app.ts dừng khởi động. */
export function unknownActionPermissions(): { action: string; permission: string }[] {
  return [...registry.values()].filter((d) => d.permission !== 'public' && !isKnownPermission(d.permission)).map((d) => ({ action: d.id, permission: d.permission }));
}
/** Mã chứng từ của module: `<module>:<phần còn lại>`. */
const SUBMIT_KEY_RE = /^([a-z][a-z0-9-]*):\S+$/;

// [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14: luật chủ chứng từ dùng chung cho module (ctx.ledger.submit) và app ngoài tiến trình (Kernel, khoá app)
/**
 * Chứng từ do một chủ nộp (module mức 1 qua ctx.ledger.submit, app mức 2 qua khoá app — ADR-0011 D5): docKey phải
 * `<chủ>:…`; sourceSystem = chủ (bỏ trống hoặc mặc định 'external' → đặt bằng chủ, khác → từ chối).
 */
export function ownDocument<T extends { docKey?: unknown; sourceSystem?: unknown }>(owner: string, doc: T, who: 'module' | 'app'): T & { sourceSystem: string } {
  const k = SUBMIT_KEY_RE.exec(String(doc?.docKey ?? ''));
  if (k?.[1] !== owner) throw Errors.validation(`docKey "${String(doc?.docKey)}" phải bắt đầu "${owner}:" — ${who} chỉ nộp chứng từ của mình (ADR-0011 D5)`);
  if (doc.sourceSystem !== undefined && doc.sourceSystem !== 'external' && doc.sourceSystem !== owner) throw Errors.validation(`sourceSystem của chứng từ ${who} ${owner} phải là "${owner}"`);
  return { ...doc, sourceSystem: owner };
}

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){2,}$/;
// [2026-11-03 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 (SC-ACT-1): giao dịch của action cho mã cũ viết dạng db.transaction().execute(fn)
// [2026-11-03 05:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3: không lưu bí mật vào bằng chứng / bản phản hồi gửi lặp
const SECRET_KEY = /(^key$|password$|secret$|token$|apikey$|api_key$|privatekey$)/i;
/**
 * Che trường bí mật (mật khẩu, khoá API, token, secret…) trước khi ghi bằng chứng (audit_logs) và trước khi lưu phản hồi để trả
 * lại khi gửi lặp (action_requests). Người gọi lần đầu vẫn nhận đủ; gửi lặp nhận bản đã che (khoá chỉ trả về một lần).
 */
export function redactSecrets<T>(v: T): T {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object' && !(x instanceof Date)) return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, SECRET_KEY.test(k) && val != null && val !== '' ? '***' : walk(val)]));
    return x;
  };
  return walk(v) as T;
}

// [2026-11-03 07:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5: thân lớn (nạp danh mục, bảng giá, ảnh hoá đơn…) không chép vào bằng chứng
export const EVIDENCE_INPUT_MAX = 64 * 1024;
/** input của bằng chứng quá EVIDENCE_INPUT_MAX byte: chỉ giữ cỡ (inputHash của bằng chứng vẫn đối chiếu được thân gốc). */
export function compactEvidence<T>(after: T): T {
  if (!after || typeof after !== 'object' || !('input' in after)) return after;
  const bytes = Buffer.byteLength(JSON.stringify((after as { input: unknown }).input) ?? '', 'utf8');
  return bytes > EVIDENCE_INPUT_MAX ? { ...after, input: { omitted: true, bytes } } as T : after;
}

// [2026-11-03 09:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6: action theo lô — mỗi mục một SAVEPOINT trong giao dịch của action
export type ItemResult<T> = { ok: true; value: T } | { ok: false; error: unknown };
let savepointSeq = 0;
/**
 * Chạy `fn` trong SAVEPOINT của `trx` (thay "mỗi mục một giao dịch" của route lô cũ). Lỗi → ROLLBACK TO SAVEPOINT, trả lỗi;
 * giao dịch ngoài vẫn dùng tiếp được. Dùng ở service bản *In; handler action gọi ctx.data.item.
 */
export async function inSavepoint<T>(trx: Transaction<Database>, fn: (tx: Transaction<Database>) => Promise<T>): Promise<ItemResult<T>> {
  const name = sql.id(`bz_item_${++savepointSeq}`);
  await sql`SAVEPOINT ${name}`.execute(trx);
  try {
    const value = await fn(trx);
    await sql`RELEASE SAVEPOINT ${name}`.execute(trx);
    return { ok: true, value };
  } catch (error) {
    await sql`ROLLBACK TO SAVEPOINT ${name}`.execute(trx);
    return { ok: false, error };
  }
}
/** Lời nhắn của lỗi một mục (như route lô cũ báo). */
export const itemMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Giao dịch runtime mở cho action (ctx.data.tx). */
export type ActionTx = Transaction<Database>;
/** Chạy fn trong giao dịch có sẵn — thay `db.transaction().execute(fn)` khi mã cũ đã nằm trong giao dịch của action (không mở giao dịch lồng). */
export function sameTx<T>(trx: ActionTx, fn: (trx: ActionTx) => Promise<T>): Promise<T> {
  return fn(trx);
}

const registry = new Map<string, AnyActionDef>();

/** Khai báo action; kiểm các luật đọc được từ khai báo (STD-ACT-2, -4, -6) ngay lúc nạp. */
export function defineAction<I extends z.AnyZodObject, O extends z.ZodTypeAny>(def: ActionDef<I, O>): ActionDef<I, O> {
  if (!ID_RE.test(def.id)) throw new Error(`Mã action không đúng dạng <module>.<thực thể>.<động từ>: ${def.id}`);
  if (!def.permission) throw new Error(`Action ${def.id} thiếu permission (STD-ACT-2)`);
  if (def.effect === 'write' && def.idempotency === 'none') throw new Error(`Action ghi ${def.id} phải có idempotency 'required' hoặc 'natural' (STD-ACT-4)`);
  if (def.effect === 'write' && def.permission === 'public') throw new Error(`Action ghi ${def.id} không được công khai (STD-ACT-2)`);
  if (def.effect === 'write' && def.expose.ai === 'execute') throw new Error(`Action ghi ${def.id} không được expose.ai = 'execute' trong v1 (ACTION §6)`);
  if (def.effect === 'write' && !def.sideEffects?.length) throw new Error(`Action ghi ${def.id} phải khai sideEffects (Capability Contract)`);
  if (def.effect === 'read' && def.sideEffects?.length) throw new Error(`Action đọc ${def.id} không được có sideEffects`);
  return def;
}

/** Mọi action đã gắn route (cho /system/capabilities, MCP 2.12). */
export function listActions(): AnyActionDef[] {
  return [...registry.values()];
}

/** Băm input đã chuẩn hoá (khoá sắp xếp) để so hai lần gửi cùng Idempotency-Key. */
export function requestHash(input: unknown): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' && !(v instanceof Date)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]))
      : v;
  return createHash('sha256').update(JSON.stringify(norm(input))).digest('hex');
}

/** Tên bước của ctx.trace.step (thành tên span — không chứa dữ liệu). */
const STEP_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

class DryRunRollback extends Error {
  constructor(readonly output: unknown) {
    super('dry-run');
  }
}

export interface ActionCall {
  auth: AuthContext | undefined;
  requestId: string;
  idempotencyKey?: string;
  dryRun?: boolean;
  /** Gọi qua AI (MCP / Cell): kênh, vd mcp:claude — bằng chứng ghi actor_kind = ai, on_behalf_of = người dùng (STD-MCP-9, STD-EVD-6). */
  via?: string;
}

export interface ActionResult<T = unknown> {
  data: T;
  status: number;
  /** receipt: biên nhận bằng chứng (bizcity_evidence@1 §3) — có với action ghi chạy thật, kể cả khi gửi lặp. */
  meta: { requestId: string; dryRun?: true; idempotency?: 'replayed'; receipt?: EvidenceReceipt; [extra: string]: unknown };
}

// [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
/**
 * Chạy một action theo ACTION §4. Dùng chung cho HTTP, MCP, CLI, callAction.
 * Span `action <id>` (S3, ADR-0010): bizcity.module = tiền tố của id (STD-ACT-6) — module không tự khai nên không khai sai; mọi
 * span con (cổng Kernel, CSDL, sự kiện, bước ctx.trace.step) nằm dưới nó → lỗi khoanh được tới module / bước.
 */
export function runAction<I extends z.AnyZodObject, O extends z.ZodTypeAny>(def: ActionDef<I, O>, rawInput: unknown, call: ActionCall): Promise<ActionResult<z.infer<O>>> {
  const dryRun = call.dryRun === true;
  return withSpan(`action ${def.id}`, {
    attributes: {
      'bizcity.action.id': def.id, 'bizcity.module': def.id.split('.')[0]!, 'bizcity.action.effect': def.effect, 'bizcity.dry_run': dryRun,
      ...(call.auth ? { 'bizcity.tenant': call.auth.tenantId } : {}),
      ...(call.via ? { 'bizcity.mcp.via': call.via } : {}),
    },
  }, async (span) => {
    const res = await runActionUntraced(def, rawInput, call);
    if (def.effect === 'write' && !dryRun && call.idempotencyKey) span.setAttribute('bizcity.idempotency', res.meta.idempotency === 'replayed' ? 'replayed' : 'new');
    return res;
  });
}

async function runActionUntraced<I extends z.AnyZodObject, O extends z.ZodTypeAny>(def: ActionDef<I, O>, rawInput: unknown, call: ActionCall): Promise<ActionResult<z.infer<O>>> {
  const auth = call.auth;
  if (def.permission !== 'public') {
    if (!auth) throw Errors.unauthorized();
    if (!auth.permissions.has(def.permission)) throw Errors.forbidden();
    // [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.3: quyền module risk high không cho trợ lý AI (BIZCITY-MODULE §3)
    if (call.via && isHighRiskPermission(def.permission)) throw Errors.forbidden(`Quyền ${def.permission} rủi ro cao: trợ lý AI không làm thay được, người dùng tự làm`);
  }
  const input = def.input.parse(rawInput) as z.infer<I>; // ZodError → VALIDATION_ERROR (core/http.ts)
  const dryRun = call.dryRun === true;
  if (dryRun && !def.dryRun) throw Errors.validation(`Action ${def.id} không hỗ trợ chạy thử (dryRun)`);
  const key = def.effect === 'write' && !dryRun ? call.idempotencyKey : undefined;
  if (key !== undefined && (key.length < 8 || key.length > 128)) throw Errors.validation('Idempotency-Key dài 8–128 ký tự');
  if (def.effect === 'write' && def.idempotency === 'required' && !dryRun && !key) {
    throw Errors.validation(`Action ${def.id} cần header Idempotency-Key (một khoá cho một ý định thao tác; gửi lại dùng đúng khoá cũ)`);
  }
  const status = def.expose.http?.status ?? 200;
  const meta: ActionResult['meta'] = { requestId: call.requestId };
  const tenantId = auth?.tenantId ?? '';
  const inputHash = def.effect === 'write' ? requestHash(input) : '';
  const notes: Record<string, unknown> = {};
  const responseMeta: Record<string, unknown> = {};
  // Bằng chứng (STD-EVD-1): action ghi chạy thật → đúng một bản ghi, thành công hay thất bại vì lỗi nghiệp vụ trong handler.
  const evidenceOn = def.effect === 'write' && !dryRun && !!auth;
  const objectType = def.evidence?.objectType ?? def.id.split('.')[1]!;
  const evidence = (objectId: unknown, result: EvidenceEntry['result'], after: unknown): EvidenceEntry => {
    const oid = objectId == null ? undefined : String(objectId);
    return {
      tenantId, actor: auth!.actor, actorKind: call.via ? 'ai' : auth!.kind, actorVia: call.via ?? (auth!.app ? `app:${auth!.app}` : undefined), onBehalfOf: call.via ? auth!.actor : undefined, action: def.id, moduleId: def.id.split('.')[0], objectType, objectId: oid,
      subject: oid ? `${objectType}:${oid}` : undefined, requestId: call.requestId, idempotencyKey: key, inputHash: `sha256:${inputHash}`, result, after: compactEvidence(redactSecrets(after)),
    };
  };
  let inHandler = false;

  try {
    const res = await db.transaction().execute(async (trx) => {
      if (key) {
        // Khoá quá hạn giữ (7 ngày) thì coi như khoá mới.
        await trx.deleteFrom('action_requests').where('tenant_id', '=', tenantId).where('action_id', '=', def.id).where('idem_key', '=', key)
          .where('created_at', '<', sql<Date>`now() - interval '7 days'`).execute();
        const inserted = await trx.insertInto('action_requests')
          .values({ tenant_id: tenantId, action_id: def.id, idem_key: key, request_hash: inputHash, actor: auth?.actor ?? 'public' })
          .onConflict((oc) => oc.columns(['tenant_id', 'action_id', 'idem_key']).doNothing())
          .returning('id').executeTakeFirst();
        if (!inserted) {
          const prev = await trx.selectFrom('action_requests').select(['request_hash', 'status_code', 'response'])
            .where('tenant_id', '=', tenantId).where('action_id', '=', def.id).where('idem_key', '=', key).executeTakeFirstOrThrow();
          if (prev.request_hash !== inputHash) throw Errors.idempotencyConflict();
          // Gửi lặp không ghi bằng chứng mới: trả lại biên nhận của lần đầu.
          const ev = await trx.selectFrom('audit_logs').select(['id', 'hash', 'created_at'])
            .where('tenant_id', '=', tenantId).where('action', '=', def.id).where('idempotency_key', '=', key).where('result_ok', '=', true)
            .orderBy('id', 'desc').executeTakeFirst();
          const receipt = ev ? { evidenceId: ev.id, hash: ev.hash ?? '', at: new Date(ev.created_at).toISOString() } : undefined;
          return { data: prev.response as z.infer<O>, status: prev.status_code, meta: { ...meta, idempotency: 'replayed' as const, ...(receipt ? { receipt } : {}) } };
        }
      }
      const ctx: ActionContext = {
        actor: { id: auth?.actor ?? 'public', name: auth?.actorName ?? '', kind: auth?.kind ?? 'user' },
        tenant: { id: tenantId },
        requestId: call.requestId,
        dryRun,
        can: (p) => !!auth?.permissions.has(p),
        data: {
          tx: trx,
          // [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4: tách ra asModuleRole (dùng chung với subscriber, hook)
          module: (fn) => asModuleRole(trx, def.id.split('.')[0]!, () => fn(trx)),
          item: (fn) => inSavepoint(trx, fn),
        },
        evidence: { note: (k, v) => { notes[k] = v; } },
        meta: responseMeta,
        events: {
          emit: (type, data, o) => {
            const mod = def.id.split('.')[0]!;
            if (!type.startsWith(`${mod}.`)) throw new Error(`Action ${def.id} chỉ phát sự kiện ${mod}.* (STD-EVT-3), không phát ${type}`);
            return emitEvent(trx, {
              tenantId, type, data, subject: o.subject, version: o.version, dedupeKey: o.dedupeKey, source: mod,
              actor: { kind: call.via ? 'ai' : auth?.kind ?? 'user', id: auth?.actor ?? 'public' },
            });
          },
        },
        ledger: {
          query: (q) => {
            if (!ledgerReader) throw new Error('Chưa đăng ký bộ đọc sổ (registerLedgerReader ở app.ts)');
            return ledgerReader(trx, tenantId, q);
          },
          submit: async (doc) => {
            const mod = def.id.split('.')[0]!;
            if (def.effect !== 'write') throw new Error(`Action đọc ${def.id} không được nộp chứng từ (ctx.ledger.submit chỉ trong action ghi)`);
            if (!ledgerSubmitter) throw new Error('Chưa đăng ký cửa nộp chứng từ (registerLedgerSubmitter ở app.ts)');
            if (!auth) throw Errors.unauthorized();
            return ledgerSubmitter(trx, auth, ownDocument(mod, doc, 'module'));
          },
          cancel: async (docKey, reason) => {
            const mod = def.id.split('.')[0]!;
            if (def.effect !== 'write') throw new Error(`Action đọc ${def.id} không được huỷ chứng từ (ctx.ledger.cancel chỉ trong action ghi)`);
            if (!ledgerCancelGate) throw new Error('Chưa đăng ký cửa huỷ chứng từ (registerLedgerCancelGate ở app.ts)');
            if (!auth) throw Errors.unauthorized();
            ownDocument(mod, { docKey }, 'module');
            return ledgerCancelGate.cancel(trx, auth, docKey, reason);
          },
          // [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.16: allocateDebt chạy thật (ledger.allocate-debt available)
          allocateDebt: async (input) => {
            const mod = def.id.split('.')[0]!;
            if (def.effect !== 'write') throw new Error(`Action đọc ${def.id} không được đối trừ công nợ (ctx.ledger.allocateDebt chỉ trong action ghi)`);
            if (!ledgerCancelGate) throw new Error('Chưa đăng ký cửa sổ của Kernel (registerLedgerCancelGate ở app.ts)');
            if (!auth) throw Errors.unauthorized();
            ownDocument(mod, { docKey: input.from }, 'module');
            ownDocument(mod, { docKey: input.to }, 'module');
            return ledgerCancelGate.allocate(trx, tenantId, input, auth.actor);
          },
          get: async (docKey) => {
            const mod = def.id.split('.')[0]!;
            if (!ledgerCancelGate) throw new Error('Chưa đăng ký cửa đọc chứng từ (registerLedgerCancelGate ở app.ts)');
            ownDocument(mod, { docKey }, 'module');
            return ledgerCancelGate.get(trx, tenantId, docKey);
          },
        },
        settings: { get: (key) => readSetting(trx, tenantId, def.id.split('.')[0]!, key) },
        notify: { send: (n) => sendNotification(trx, tenantId, def.id.split('.')[0]!, n) },
        actions: {
          call: (id, input) => {
            if (!auth) throw Errors.unauthorized();
            return callAction(id, input, auth);
          },
        },
        documents: (() => {
          const mod = def.id.split('.')[0]!;
          const actor = auth?.actor ?? 'public';
          const own = (ref: DocRef, what = 'docRef') => {
            if (docRefModule(ref) !== mod) throw Errors.validation(`Action ${def.id} chỉ ghi chứng từ của module ${mod} (${what} ${ref})`);
          };
          return {
            nextNumber: (series, o) => documents.nextNumber(trx, tenantId, mod, series, o),
            saveVersion: async (ref, snapshot) => { own(ref); return (await documents.saveVersion(trx, tenantId, ref, snapshot, actor)).version; },
            versions: (ref) => documents.versions(trx, tenantId, ref),
            link: (from, to, role) => { own(from, 'from'); return documents.link(trx, tenantId, from, to, role, actor); },
            links: (ref) => documents.links(trx, tenantId, ref),
            attach: async (ref, file, m) => { own(ref); const { created: _c, ...a } = await documents.attach(trx, tenantId, ref, file, m ?? {}, actor); return a; },
            attachments: (ref) => documents.attachments(trx, tenantId, ref),
            sign: (ref, role) => { own(ref); return documents.sign(trx, tenantId, ref, role, { actor, name: auth?.actorName ?? actor, kind: call.via ? 'ai' : auth?.kind ?? 'public' }); },
            signatures: (ref) => documents.signatures(trx, tenantId, ref),
            unsign: (ref, role) => { own(ref); return documents.unsign(trx, tenantId, ref, role, { actor, role: auth?.role ?? null }); },
          } satisfies ActionContext['documents'];
        })(),
        trace: {
          step: (name, fn) => {
            const mod = def.id.split('.')[0]!;
            if (!STEP_RE.test(name)) throw new Error(`ctx.trace.step: tên bước "${name}" phải dạng chữ thường, số, gạch ngang, chấm (vd tinh-thue)`);
            return withSpan(`step ${mod}.${name}`, { attributes: { 'bizcity.module': mod, 'bizcity.step': name } }, () => fn());
          },
        },
        get legacyAuth() {
          if (!auth) throw Errors.unauthorized();
          return auth;
        },
      };
      inHandler = true;
      const output = await def.handler(ctx, input);
      // STD-ACT-3: phản hồi đúng khuôn output — kiểm khi chạy test (CONF-RUN-3), không tốn ở bản chạy thật.
      if (env.NODE_ENV === 'test') {
        const checked = def.output.safeParse(output);
        if (!checked.success) throw new Error(`Action ${def.id} trả sai khuôn output: ${checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      if (dryRun) throw new DryRunRollback(output);
      const result = { data: output, status, meta: { ...responseMeta, ...meta } as ActionResult['meta'] };
      if (evidenceOn) {
        const objectId = def.evidence?.objectId?.(input, output) ?? (output as { id?: unknown } | null)?.id;
        result.meta = { ...responseMeta, ...meta, receipt: await writeEvidence(trx, evidence(objectId, { ok: true }, Object.keys(notes).length ? { input, notes } : { input })) };
      }
      if (key) {
        await trx.updateTable('action_requests').set({ response: JSON.stringify(redactSecrets(output ?? null)), status_code: status })
          .where('tenant_id', '=', tenantId).where('action_id', '=', def.id).where('idem_key', '=', key).execute();
      }
      return result;
    });
    metrics.actions.inc({ action: def.id, result: 'ok', code: '' });
    // [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — bizcity_idempotency_requests_total: đếm sau commit (new / replayed), xung đột khoá ở nhánh lỗi
    if (key) metrics.idempotency.inc({ result: res.meta.idempotency === 'replayed' ? 'replayed' : 'new' });
    return res;
  } catch (err) {
    if (err instanceof DryRunRollback) return { data: err.output as z.infer<O>, status: 200, meta: { ...meta, dryRun: true } };
    if (key && err instanceof AppError && err.code === ERROR_CODES.IDEMPOTENCY_CONFLICT) metrics.idempotency.inc({ result: 'conflict' });
    metrics.actions.inc({ action: def.id, result: 'error', code: err instanceof AppError ? err.code : err instanceof z.ZodError ? ERROR_CODES.VALIDATION : ERROR_CODES.INTERNAL });
    // Thất bại trong handler: giao dịch đã huỷ → ghi bằng chứng "result_ok = false" ở giao dịch riêng. Ghi lỗi thì vẫn ném lỗi gốc.
    if (inHandler && evidenceOn) {
      const code = err instanceof AppError ? err.code : err instanceof z.ZodError ? ERROR_CODES.VALIDATION : ERROR_CODES.INTERNAL;
      await db.transaction().execute((trx) => writeEvidence(trx, evidence((input as { id?: unknown }).id, { ok: false, code }, { input, message: (err as Error).message })))
        .catch(() => undefined);
    }
    throw err;
  }
}

// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — callAction: module gọi action đọc công khai của module khác theo mã (STD-MOD-3), thay import code chéo
/**
 * Gọi action công khai của module khác theo mã (BIZCITY-MODULE §2 `requires.modules`, STD-MOD-3: phụ thuộc module chỉ qua action /
 * sự kiện, không import code). Chạy đủ ACTION §4 với quyền của chính người gọi. Mã chưa đăng ký → NOT_FOUND, không trả rỗng ngầm.
 * v1 chỉ action đọc: action ghi cần khoá idempotency của lời gọi gốc, chưa có cách truyền.
 */
export async function callAction<T = unknown>(id: string, input: unknown, auth: AuthContext): Promise<T> {
  const def = registry.get(id);
  if (!def) throw Errors.notFound(`action ${id} (module cung cấp chưa bật)`);
  if (def.effect !== 'read') throw Errors.validation(`callAction chỉ gọi action đọc; ${id} là action ghi`);
  return (await runAction(def, input, { auth, requestId: currentRequest()?.requestId ?? `call:${id}` })).data as T;
}

const pathParams = (path: string) =>[...path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]!);

/**
 * Gắn route HTTP cho các action có `expose.http`. Tham số đường dẫn + (GET/DELETE: query; còn lại: body) gộp thành input.
 * OpenAPI: params / querystring / body tách từ cùng schema input.
 */
/** Đưa action vào registry (MCP, CLI) — kể cả action không có route HTTP. */
export function registerActions(defs: AnyActionDef[]): void {
  for (const def of defs) {
    if (registry.has(def.id) && registry.get(def.id) !== def) throw new Error(`Trùng mã action: ${def.id}`);
    registry.set(def.id, def);
  }
}

export function mountActions(app: FastifyInstance, defs: AnyActionDef[]): void {
  registerActions(defs);
  for (const def of defs) {
    const http = def.expose.http;
    if (!http) continue;
    const names = pathParams(http.path);
    const mask = Object.fromEntries(names.map((n) => [n, true])) as Record<string, true>;
    const inQuery = http.method === 'GET' || http.method === 'DELETE';
    // Trường query của POST/PUT/PATCH không nằm trong thân
    const qMask = Object.fromEntries(Object.keys(!inQuery && http.query ? http.query.shape : {}).map((n) => [n, true])) as Record<string, true>;
    const rest = def.input.omit({ ...mask, ...qMask });
    const dry = def.dryRun ? z.object({ dryRun: queryBool.describe('1 = chạy thử trong giao dịch rồi huỷ, không ghi gì') }) : null;
    const notes = [
      def.description,
      `Action \`${def.id}\` · quyền \`${def.permission}\` · ${def.effect === 'write' ? `ghi · idempotency ${def.idempotency}` : 'đọc'}`,
      def.effect === 'write' && def.idempotency === 'required' ? 'Header `Idempotency-Key` (8–128 ký tự) bắt buộc: gửi lại cùng khoá + cùng nội dung → trả đúng phản hồi lần đầu.' : '',
    ].filter(Boolean).join('\n\n');
    app.route({
      method: http.method,
      url: http.path,
      schema: {
        tags: def.tags,
        summary: def.title,
        description: notes,
        ...(names.length ? { params: def.input.pick(mask) } : {}),
        // [2026-11-03 07:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 4: thân mà {} đã hợp lệ (mọi trường tuỳ chọn / có mặc định) thì được gửi thiếu
        ...(inQuery ? { querystring: dry ? rest.merge(dry) : rest } : { ...(Object.keys(rest.shape).length ? { body: rest.safeParse({}).success ? rest.nullish() : rest } : {}), ...(dry || http.query ? { querystring: http.query && dry ? http.query.merge(dry) : (http.query ?? dry)! } : {}) }),
      },
      ...(http.bodyLimit ? { bodyLimit: http.bodyLimit } : {}),
      config: def.permission === 'public' ? { public: true } : {},
      handler: async (req: FastifyRequest, reply) => {
        const params = (req.params ?? {}) as Record<string, unknown>;
        const query = { ...((req.query ?? {}) as Record<string, unknown>) };
        // Action không khai dryRun thì query không qua schema (chuỗi "1"): vẫn phải nhận ra để từ chối, không chạy thật.
        const flag = query.dryRun;
        const dryRun = flag === true || (typeof flag === 'string' && ['1', 'true', 'on', 'yes'].includes(flag.toLowerCase()));
        delete query.dryRun;
        const fromQuery = Object.fromEntries(Object.keys(qMask).filter((k) => k in query).map((k) => [k, query[k]]));
        const raw = inQuery ? { ...query, ...params } : { ...((req.body ?? {}) as Record<string, unknown>), ...fromQuery, ...params };
        const header = req.headers['idempotency-key'];
        const res = await runAction(def, raw, { auth: req.auth, requestId: String(req.id), idempotencyKey: Array.isArray(header) ? header[0] : header, dryRun });
        return reply.status(res.status).send(ok(res.data, res.meta));
      },
    });
  }
}
