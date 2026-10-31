// @bizcity-layer P documents
// [2026-11-01 12:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — documents.* (PHASES 2.7): đánh số, phiên bản, liên kết, đính kèm chung cho mọi chứng từ (bizcity_document@1 §3, §7)
// [2026-11-01 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-010 — đính kèm: storage_root (tệp Mua hàng cũ ở dinh-kem, 0046), băm tệp cũ ở lần tải đầu, loại tệp nhận gạch dưới
/**
 * Chứng từ dùng chung (năng lực documents.numbering / versions / links / attachments; gói đích packages/documents).
 * Chứng từ gọi bằng docRef = <module>.<loại>:<id>; sự việc kế toán = ledger.event:<docKey>.
 *   nextNumber     số chứng từ <DÃY>-<năm>-<số> trên bộ đếm document_sequences của Kernel. Platform không import Kernel
 *                  (SC-LAYER-2): Kernel đăng ký bộ đếm lúc lắp ráp (registerDocumentNumberer ở app.ts), như bộ đọc sổ.
 *   saveVersion    ảnh chụp nội dung (STD-DOC-2), chỉ thêm; nội dung trùng phiên bản trước thì trả lại số cũ, không thêm.
 *   link           tham chiếu from --role--> to; gắn lặp giữ một dòng.
 *   attach         tệp lưu ở DATA_DIR/attachments/<đơn vị>/<năm-tháng>/, CSDL giữ siêu dữ liệu + sha256; gửi lại cùng tệp vào
 *                  cùng chứng từ trả lại tệp cũ; gỡ = archived_at (không xoá cứng, STD-DATA-9).
 * Hàm nhận giao dịch của người gọi: trong action là ctx.data.tx (ctx.documents.* gói sẵn), ngoài action là trx của service.
 * Tệp được ghi ra ổ trước khi giao dịch chốt: giao dịch huỷ thì còn tệp mồ côi trên ổ (không có dòng trỏ tới), không lộ dữ liệu.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DOC_LINK_ROLES, DOC_REF_RE, type AttachmentRef, type DocLinkRole, type DocRef, type DocumentLink, type DocumentVersion, type FileInput } from '@ketoan/contracts';
import type { Db } from '../db/client.js';
import { Errors } from './errors.js';
import { todayVN } from './date-rules.js';

/** Bộ đếm số chứng từ do Kernel cung cấp (modules/documents/numbering.ts). */
export type DocumentNumberer = (tx: Db, tenantId: string, key: string, year: number) => Promise<number>;
let numberer: DocumentNumberer | null = null;
export function registerDocumentNumberer(fn: DocumentNumberer): void {
  numberer = fn;
}

/** Tệp đính kèm tối đa 15 MB (như đính kèm Mua hàng trước đây). */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const SERIES_RE = /^[A-Z][A-Z0-9]{0,9}$/;
const KIND_RE = /^[a-z][a-z0-9_-]{0,39}$/;
/** Thư mục tệp của đơn vị: attachments (tệp gửi từ 0045) hoặc dinh-kem (tệp Mua hàng gửi trước 0046, giữ nguyên chỗ). */
const attachmentRoot = (tenantId: string, root: 'attachments' | 'dinh-kem' = 'attachments') => path.resolve(process.env.DATA_DIR ?? './data', root, tenantId);

function assertRef(ref: string, what = 'docRef'): asserts ref is DocRef {
  if (!DOC_REF_RE.test(ref)) throw Errors.validation(`${what} không đúng dạng <module>.<loại>:<id>: ${ref}`);
}

/** sha256 của JSON đã chuẩn hoá (khoá sắp xếp): cùng nội dung → cùng băm, không phụ thuộc thứ tự khoá. */
function contentHash(value: unknown): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' && !(v instanceof Date)
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]))
      : v;
  return createHash('sha256').update(JSON.stringify(norm(value)) ?? 'null').digest('hex');
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

type AttachmentRow = { id: string; doc_ref: string; kind: string; file_name: string; content_type: string; size_bytes: string; sha256: string | null; note: string; created_by: string; created_at: unknown };
const toAttachment = (r: AttachmentRow): AttachmentRef => ({
  id: String(r.id), docRef: r.doc_ref, kind: r.kind, fileName: r.file_name, contentType: r.content_type, sizeBytes: Number(r.size_bytes),
  sha256: r.sha256, note: r.note, createdBy: r.created_by, createdAt: iso(r.created_at),
});
const ATTACHMENT_COLS = ['id', 'doc_ref', 'kind', 'file_name', 'content_type', 'size_bytes', 'sha256', 'note', 'created_by', 'created_at'] as const;

export const documents = {
  /**
   * Số kế tiếp của dãy `series` (chữ hoa, vd HD) trong phạm vi `scope` (mã module): '<DÃY>-<năm>-<số>', vd HD-2026-0001.
   * Bộ đếm theo (đơn vị, <scope>:<dãy>, năm của `date` — mặc định hôm nay giờ Việt Nam).
   */
  async nextNumber(tx: Db, tenantId: string, scope: string, series: string, opts: { date?: string; width?: number } = {}): Promise<string> {
    if (!numberer) throw new Error('Chưa đăng ký bộ đếm số chứng từ (registerDocumentNumberer ở app.ts)');
    if (!SERIES_RE.test(series)) throw Errors.validation(`Dãy số "${series}" phải là chữ hoa / số, bắt đầu bằng chữ, tối đa 10 ký tự (vd HD)`);
    const date = opts.date ?? todayVN();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Errors.validation(`Ngày cấp số dạng YYYY-MM-DD: ${date}`);
    const width = opts.width ?? 4;
    if (!Number.isInteger(width) || width < 1 || width > 10) throw Errors.validation('Số chữ số của dãy từ 1 đến 10');
    const year = Number(date.slice(0, 4));
    const n = await numberer(tx, tenantId, `${scope}:${series.toLowerCase()}`, year);
    return `${series}-${year}-${String(n).padStart(width, '0')}`;
  },

  /** Lưu ảnh chụp phiên bản; nội dung trùng phiên bản mới nhất thì không thêm (`created: false`). */
  async saveVersion(tx: Db, tenantId: string, docRef: string, snapshot: unknown, actor: string): Promise<{ version: number; created: boolean }> {
    assertRef(docRef);
    if (snapshot === undefined) throw Errors.validation('Thiếu nội dung phiên bản');
    const hash = contentHash(snapshot);
    const last = await tx.selectFrom('document_versions').select(['version', 'content_hash']).where('tenant_id', '=', tenantId).where('doc_ref', '=', docRef)
      .orderBy('version', 'desc').limit(1).executeTakeFirst();
    if (last?.content_hash === hash) return { version: last.version, created: false };
    const version = (last?.version ?? 0) + 1;
    try {
      await tx.insertInto('document_versions').values({ tenant_id: tenantId, doc_ref: docRef, version, snapshot: JSON.stringify(snapshot), content_hash: hash, created_by: actor }).execute();
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw Errors.conflict(`${docRef} vừa có phiên bản ${version} do yêu cầu khác lưu — tải lại rồi lưu lại`);
      throw e;
    }
    return { version, created: true };
  },

  /** Các phiên bản, cũ → mới; `withSnapshot` kèm nội dung. */
  async versions(tx: Db, tenantId: string, docRef: string, opts: { withSnapshot?: boolean } = {}): Promise<DocumentVersion[]> {
    assertRef(docRef);
    const rows = await tx.selectFrom('document_versions').select(['version', 'content_hash', 'created_by', 'created_at', 'snapshot'])
      .where('tenant_id', '=', tenantId).where('doc_ref', '=', docRef).orderBy('version').execute();
    return rows.map((r) => ({ version: r.version, contentHash: r.content_hash, createdBy: r.created_by, createdAt: iso(r.created_at), ...(opts.withSnapshot ? { snapshot: r.snapshot } : {}) }));
  },

  /** Một phiên bản kèm nội dung; không có → NOT_FOUND. */
  async version(tx: Db, tenantId: string, docRef: string, version: number): Promise<DocumentVersion> {
    assertRef(docRef);
    const r = await tx.selectFrom('document_versions').select(['version', 'content_hash', 'created_by', 'created_at', 'snapshot'])
      .where('tenant_id', '=', tenantId).where('doc_ref', '=', docRef).where('version', '=', version).executeTakeFirst();
    if (!r) throw Errors.notFound(`phiên bản ${version} của ${docRef}`);
    return { version: r.version, contentHash: r.content_hash, createdBy: r.created_by, createdAt: iso(r.created_at), snapshot: r.snapshot };
  },

  /** Gắn liên kết from --role--> to; đã có thì giữ nguyên. */
  async link(tx: Db, tenantId: string, from: string, to: string, role: DocLinkRole, actor: string): Promise<void> {
    assertRef(from, 'from');
    assertRef(to, 'to');
    if (!(DOC_LINK_ROLES as readonly string[]).includes(role)) throw Errors.validation(`Vai trò liên kết phải là một trong: ${DOC_LINK_ROLES.join(', ')}`);
    if (from === to) throw Errors.validation('Chứng từ không liên kết với chính nó');
    await tx.insertInto('document_links').values({ tenant_id: tenantId, from_ref: from, to_ref: to, role, created_by: actor })
      .onConflict((oc) => oc.columns(['tenant_id', 'from_ref', 'to_ref', 'role']).doNothing()).execute();
  },

  /** Liên kết đi ra từ docRef và đi vào docRef. */
  async links(tx: Db, tenantId: string, docRef: string): Promise<DocumentLink[]> {
    assertRef(docRef);
    const rows = await tx.selectFrom('document_links').select(['from_ref', 'to_ref', 'role', 'created_by', 'created_at'])
      .where('tenant_id', '=', tenantId).where((eb) => eb.or([eb('from_ref', '=', docRef), eb('to_ref', '=', docRef)]))
      .orderBy('created_at').orderBy('id').execute();
    return rows.map((r) => ({ from: r.from_ref, to: r.to_ref, role: r.role as DocLinkRole, createdBy: r.created_by, createdAt: iso(r.created_at) }));
  },

  /** Đính tệp vào chứng từ. Cùng nội dung (sha256) đã đính vào chứng từ này và chưa gỡ → trả lại tệp cũ. */
  async attach(tx: Db, tenantId: string, docRef: string, file: FileInput, meta: { kind?: string; note?: string }, actor: string): Promise<AttachmentRef & { created: boolean }> {
    assertRef(docRef);
    const kind = meta.kind ?? 'other';
    if (!KIND_RE.test(kind)) throw Errors.validation(`Loại tệp "${kind}" chỉ gồm chữ thường, số, gạch ngang / gạch dưới (vd contract-scan)`);
    const fileName = file.fileName.trim();
    if (!fileName || fileName.length > 200) throw Errors.validation('Tên tệp 1–200 ký tự');
    const data = Buffer.from(file.data);
    if (!data.length) throw Errors.validation('Tệp rỗng');
    if (data.length > MAX_ATTACHMENT_BYTES) throw Errors.validation(`Tệp quá ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const same = await tx.selectFrom('document_attachments').select(ATTACHMENT_COLS).where('tenant_id', '=', tenantId).where('doc_ref', '=', docRef)
      .where('sha256', '=', sha256).where('archived_at', 'is', null).executeTakeFirst();
    if (same) return { ...toAttachment(same), created: false };
    const safe = fileName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(-120) || 'tep';
    const rel = path.posix.join(todayVN().slice(0, 7), `${sha256.slice(0, 16)}-${randomBytes(4).toString('hex')}-${safe}`);
    const full = path.join(attachmentRoot(tenantId), rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    const row = await tx.insertInto('document_attachments').values({
      tenant_id: tenantId, doc_ref: docRef, kind, file_name: fileName, content_type: file.contentType || 'application/octet-stream',
      size_bytes: String(data.length), sha256, storage_path: rel, note: meta.note ?? '', created_by: actor,
    }).returning(ATTACHMENT_COLS).executeTakeFirstOrThrow();
    return { ...toAttachment(row), created: true };
  },

  /** Tệp đang đính vào chứng từ (mặc định bỏ tệp đã gỡ). */
  async attachments(tx: Db, tenantId: string, docRef: string, opts: { includeArchived?: boolean } = {}): Promise<AttachmentRef[]> {
    assertRef(docRef);
    let q = tx.selectFrom('document_attachments').select(ATTACHMENT_COLS).where('tenant_id', '=', tenantId).where('doc_ref', '=', docRef);
    if (!opts.includeArchived) q = q.where('archived_at', 'is', null);
    return (await q.orderBy('created_at').orderBy('id').execute()).map(toAttachment);
  },

  /**
   * Nội dung tệp; băm không khớp (tệp trên ổ bị đổi / hỏng) → CONFLICT, không trả nội dung sai.
   * Tệp chuyển từ purchase_attachments (0046) chưa có băm: băm lần tải đầu và ghi lại, các lần sau kiểm như tệp mới.
   */
  async readAttachment(tx: Db, tenantId: string, id: string): Promise<AttachmentRef & { data: Buffer }> {
    const r = await tx.selectFrom('document_attachments').select([...ATTACHMENT_COLS, 'storage_path', 'storage_root']).where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('tệp đính kèm');
    const data = await readFile(path.join(attachmentRoot(tenantId, r.storage_root as 'attachments' | 'dinh-kem'), r.storage_path)).catch(() => null);
    if (!data) throw Errors.notFound(`nội dung tệp ${r.file_name} trên ổ dữ liệu`);
    const sha256 = createHash('sha256').update(data).digest('hex');
    if (r.sha256 === null) {
      await tx.updateTable('document_attachments').set({ sha256 }).where('tenant_id', '=', tenantId).where('id', '=', id).where('sha256', 'is', null).execute();
      return { ...toAttachment({ ...r, sha256 }), data };
    }
    if (sha256 !== r.sha256) throw Errors.conflict(`Tệp ${r.file_name} trên ổ không khớp băm lúc gửi — tệp đã bị đổi hoặc hỏng`);
    return { ...toAttachment(r), data };
  },

  /** Gỡ tệp khỏi chứng từ (archived_at); đã gỡ thì giữ nguyên. Tệp trên ổ giữ lại. */
  async archiveAttachment(tx: Db, tenantId: string, id: string, actor: string): Promise<AttachmentRef & { archivedAt: string }> {
    const r = await tx.selectFrom('document_attachments').select([...ATTACHMENT_COLS, 'archived_at']).where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('tệp đính kèm');
    if (r.archived_at) return { ...toAttachment(r), archivedAt: iso(r.archived_at) };
    const u = await tx.updateTable('document_attachments').set({ archived_at: new Date().toISOString(), archived_by: actor })
      .where('tenant_id', '=', tenantId).where('id', '=', id).returning('archived_at').executeTakeFirstOrThrow();
    return { ...toAttachment(r), archivedAt: iso(u.archived_at) };
  },
};
