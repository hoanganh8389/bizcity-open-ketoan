// @bizcity-layer K kernel/intake
// [2026-11-09 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51b (B5b, PHASE-030 · 26 §4.2, K1): kiểm trường chứng từ theo thư viện dùng chung — chỉ cảnh báo, kênh riêng libraryFindings[]; một hàm cho tiền kiểm và cửa nạp (R-INTAKE-4)
/**
 * Với mỗi gắn trong LIBRARY_BINDINGS (@ketoan/contracts), lấy giá trị có thật ở đường gắn của chứng từ và hỏi CÙNG bộ kiểm với
 * POST /api/v1/libraries/:id/validate (validateInLibrary) tại ngày chứng từ, áp cấu hình của đơn vị (§7.1: tắt thư viện tuỳ chọn,
 * ghi đè giá trị, hạ / tắt từng gắn bằng `bindings`).
 *
 *   • Không bao giờ chặn: `block` của thư viện hạ xuống `warn` (blockedBy). Không đổi findings[] / score / bút toán.
 *   • Chỉ đọc. Cửa nạp gọi với `usageSource` để đếm lượt dùng (library_usage_daily) — không từ chối, không hold.
 *   • Lỗi của bộ kiểm không làm hỏng chứng từ: cửa nạp bọc try/catch (xem countLibraryUsage).
 */
import { LIBRARY_BINDINGS, bindingValues, type LibraryFindingEntry } from '@ketoan/contracts';
import type { Db } from '@bizcity/platform/db/client';
import { currentLibraryConfig, getLibrary, recordLibraryUsage, validateInLibrary, type LibraryConfig } from '@bizcity/platform/core/libraries/index';

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const today = (): string => new Date().toISOString().slice(0, 10);

export async function libraryFindings(trx: Db, tenantId: string, doc: unknown, opts: { usageSource?: string } = {}): Promise<LibraryFindingEntry[]> {
  const d = (doc && typeof doc === 'object' ? doc : {}) as { docDate?: unknown };
  const at = typeof d.docDate === 'string' && DATE_RE.test(d.docDate) ? d.docDate.slice(0, 10) : today();
  const configs = new Map<string, LibraryConfig | undefined>();
  const out: LibraryFindingEntry[] = [];
  for (const b of LIBRARY_BINDINGS) {
    const found = bindingValues(doc, b.path);
    if (!found.length || !getLibrary(b.library)) continue;
    if (!configs.has(b.library)) configs.set(b.library, (await currentLibraryConfig(trx, tenantId, b.library))?.config);
    const config = configs.get(b.library);
    if (config?.enabled === false) continue;
    const mode = config?.bindings?.[b.id];
    if (mode === 'off') continue;
    const byValue = new Map<string, { path: string; n: number }>();
    for (const f of found) {
      const cur = byValue.get(f.value);
      if (cur) cur.n += 1;
      else byValue.set(f.value, { path: f.path, n: 1 });
    }
    for (const [value, where] of byValue) {
      const r = validateInLibrary(b.library, value, { at, config });
      if (!r) continue;
      if (opts.usageSource) recordLibraryUsage(tenantId, r, value, opts.usageSource);
      for (const f of r.findings) {
        // LIB-UNVERIFIED-001 là trạng thái duyệt của thư viện (hiện ở bảng đánh giá HT14), không phải lỗi của chứng từ: không đẩy vào kênh cửa nạp.
        if (f.code === 'LIB-UNVERIFIED-001') continue;
        const blocked = f.level === 'block';
        const level: 'warn' | 'info' = mode === 'info' || f.level === 'info' ? 'info' : 'warn';
        out.push({
          binding: b.id, library: b.library, path: where.path, occurrences: where.n, value, code: f.code, level, message: f.message,
          ...(blocked ? { blockedBy: true as const } : {}), suggestions: f.suggestions,
        });
      }
    }
  }
  return out;
}

/**
 * Cửa nạp (không phải xem trước / định khoản thử): chạy cùng hàm để ĐẾM lượt dùng thư viện theo kênh `intake/<sourceSystem>`.
 * Không bao giờ ném lỗi và không đổi kết quả nạp — số đếm là quan sát (26 §8).
 */
export async function countLibraryUsage(trx: Db, tenantId: string, doc: { sourceSystem?: string }): Promise<void> {
  try {
    const src = typeof doc.sourceSystem === 'string' && /^[a-z0-9][a-z0-9._-]{0,60}$/i.test(doc.sourceSystem) ? doc.sourceSystem.toLowerCase() : 'khac';
    await libraryFindings(trx, tenantId, doc, { usageSource: `intake/${src}` });
    // Ghi bộ đếm xuống CSDL KHÔNG làm ở đây (cùng giao dịch với chứng từ): runAction ghi theo lượt sau commit (actions.ts).
  } catch { /* số đếm là quan sát: lỗi không làm hỏng chứng từ */ }
}
