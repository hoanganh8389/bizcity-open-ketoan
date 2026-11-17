/**
 * Thiết lập nhanh (TI15) — logic thuần của hộp thoại bốn bước (PHASE-036 · 00 §12). Không React, không gọi API: test ở `test/`.
 * Khuôn dữ liệu theo API Core: core.setup.status / presets / plan / run (apps/api/src/modules/system/setup-run.ts).
 */

export const STEPS = ['Bắt đầu', 'Công ty', 'Nạp gì', 'Đang nạp'];

/** Khối "Danh mục mẫu" tick được ở đường "công ty của tôi" (Q036-5: mặc định tắt). Cấu hình luôn có; chứng từ mẫu không hiện. */
export const OPTIONAL_BLOCKS = ['branches', 'partners', 'products'] as const;
export type OptionalBlock = (typeof OPTIONAL_BLOCKS)[number];

/** Ngành chưa có gói mẫu — hiện mờ "sắp có". */
export const COMING_INDUSTRIES = ['Dịch vụ', 'Sản xuất', 'Xây dựng'];

export interface StepState { key: string; label: string; total: number; written: number; skipped: number; failed: number; status: string; firstError: { code: string; message: string; requestId: string } | null }
export interface SetupRun { id: string; presetId: string; presetVersion: string; status: 'running' | 'done' | 'failed'; firstRun: boolean; steps: StepState[]; error: string | null; startedAt: string; finishedAt: string | null }
export interface SetupStatus { empty: boolean; kinds: string[]; canSetup: boolean; runs: SetupRun[]; isSample?: boolean; sampleTenantCode?: string | null }

/** Thẻ "Xem công ty mẫu" (B5a): mở được khi bản cài có Công ty mẫu và người dùng không đang ở trong đó. */
export function sampleCard(st: SetupStatus | null | undefined): { open: boolean; code: string | null; note: string } {
  const code = st?.sampleTenantCode ?? null;
  if (st?.isSample) return { open: false, code, note: 'Bạn đang ở Công ty Mẫu' };
  if (!code) return { open: false, code: null, note: 'Bản cài này chưa có Công ty Mẫu (bật BIZCITY_SAMPLE khi cài mới)' };
  return { open: true, code, note: `Đăng nhập mã đơn vị ${code}, cùng email và mật khẩu` };
}
export interface PresetInfo { id: string; version: string; title: string; description: string; blocks: { key: string; label: string; total: number }[] }
export interface PlanBlock { key: string; label: string; total: number; existing: number; toAdd: number }
export interface SetupPlan { presetId: string; presetVersion: string; title: string; allowed: boolean; reason: string | null; empty: boolean; previousRun: SetupRun | null; missingCapabilities: string[]; blocks: PlanBlock[] }
export interface TenantInfo { code: string; name: string; taxCode: string; address: string; phone: string; logo: string | null }

/** Chuỗi `blocks` gửi máy chủ: khối tick, theo thứ tự cố định. Không tick gì → chỉ cấu hình (máy chủ tự thêm settings). */
export function blocksParam(picked: readonly string[]): string {
  return ['settings', ...OPTIONAL_BLOCKS.filter((b) => picked.includes(b))].join(',');
}

/** Hàng hiện ở bước "Nạp gì" của đường "công ty của tôi": cấu hình (khoá) + danh mục mẫu; bỏ chứng từ mẫu. */
export function ownCompanyRows(blocks: PlanBlock[]): (PlanBlock & { locked: boolean })[] {
  return blocks.filter((b) => b.key === 'settings' || (OPTIONAL_BLOCKS as readonly string[]).includes(b.key))
    .map((b) => ({ ...b, locked: b.key === 'settings' }));
}

/** Một khối đang nạp nói bằng lời + nhãn màu. */
export function stepLine(s: StepState): { badge: string; text: string } {
  if (s.failed > 0) return { badge: 'badge-bad', text: `lỗi ${s.failed}${s.written ? ` · đã ghi ${s.written}` : ''}${s.skipped ? ` · đã có ${s.skipped}` : ''}` };
  if (s.status === 'waiting') return { badge: 'badge-gray', text: 'chờ' };
  if (s.status === 'running') return { badge: 'badge-info', text: `đang nạp ${s.written + s.skipped}/${s.total}` };
  return { badge: 'badge-ok', text: `xong · ghi ${s.written}${s.skipped ? ` · đã có ${s.skipped}` : ''}` };
}

/** Kết quả cả lần chạy: xong hết / còn lỗi (cho bấm Thử lại) / đang chạy. */
export function runOutcome(r: SetupRun | null | undefined): 'running' | 'ok' | 'retry' | null {
  if (!r) return null;
  if (r.status === 'running') return 'running';
  if (r.status === 'failed' || r.steps.some((s) => s.failed > 0)) return 'retry';
  return 'ok';
}

/** Lần chạy còn đang chạy (mở lại TI15 giữa chừng → vào thẳng bước 4). */
export function activeRun(st: SetupStatus | null | undefined): SetupRun | null {
  return st?.runs.find((r) => r.status === 'running') ?? null;
}

/** Kiểm sớm MST như máy chủ (core.tenant.update): 10 chữ số, chi nhánh thêm -xxx; trống được. */
export function taxCodeError(v: string): string | null {
  const t = v.trim();
  return !t || /^\d{10}(-\d{3})?$/.test(t) ? null : 'Mã số thuế gồm 10 chữ số (chi nhánh thêm -xxx)';
}

/** Ô Công ty đã đổi so với bản đang lưu chưa (chỉ gọi core.tenant.update khi đổi). */
export function tenantChanged(a: Pick<TenantInfo, 'name' | 'taxCode' | 'address' | 'phone'>, b: Pick<TenantInfo, 'name' | 'taxCode' | 'address' | 'phone'>): boolean {
  return (['name', 'taxCode', 'address', 'phone'] as const).some((k) => (a[k] ?? '').trim() !== (b[k] ?? '').trim());
}
