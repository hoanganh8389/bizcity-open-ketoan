// @bizcity-layer P observability
// [2026-11-19 Nguyễn Văn Thủy] nhật ký kiểm khai báo (JSONL, docs/nghiep-vu/25 §3.5): mỗi lần lưu danh mục / chứng từ ghi các quy tắc chưa đạt / đã qua, kèm mã tra cứu (đóng góp)
/**
 * NHẬT KÝ KIỂM KHAI BÁO — tệp JSONL (run-log, luồng `kiem-khai-bao`), không dùng bảng.
 * Một dòng = một lần lưu (thêm / sửa / xoá) một đối tượng: đạt hay không, mã quy tắc chưa đạt, mã tra cứu (requestId) để nối sang
 * log máy chủ (Loki / Tempo). Tester chép mã tra cứu từ màn hình, dev tìm lại đúng lượt ở đây hoặc ở Grafana.
 */
import { appendRunLog, readRunLog } from './run-log.js';

export const LUONG_KIEM = 'kiem-khai-bao';

export interface KiemRow {
  /** Đối tượng: item, partner, account, purchase_doc… (trùng `entity` của quy tắc). */
  entity: string;
  /** Khoá bản ghi: mã hàng, mã NCC, số phiếu… */
  key: string;
  action: 'create' | 'update' | 'delete' | 'validate' | 'form';
  /** [2026-11-19 Nguyễn Văn Thủy] nguồn: 'form' = form tự chặn trên trình duyệt (chưa gửi máy chủ); 'server' = máy chủ (mặc định) (đóng góp) */
  source?: 'form' | 'server';
  screen?: string;
  /** Đạt (đã lưu) hay bị chặn. */
  ok: boolean;
  /** Lưu thành nháp (còn quy tắc chặn nhưng vẫn giữ dữ liệu). */
  draft?: boolean;
  /** Mã quy tắc chưa đạt (block / warn / info). */
  failed: { code: string; level: string; title: string; field?: string }[];
  user: string;
  requestId?: string;
  /** [2026-11-19 Nguyễn Văn Thủy] chi tiết cho dev: phương thức, đường dẫn API, mã HTTP, câu lỗi gốc (đóng góp) */
  method?: string;
  path?: string;
  status?: number;
  message?: string;
}

/** Ghi một lượt kiểm; lỗi ghi tệp không làm hỏng thao tác của người dùng. */
export async function ghiKiem(tenantId: string, row: KiemRow): Promise<void> {
  try { await appendRunLog(LUONG_KIEM, tenantId, row); } catch { /* nhật ký phụ — bỏ qua lỗi ghi */ }
}

/** Đọc nhật ký kiểm (mới nhất trước), lọc theo đối tượng / mã quy tắc / khoá / người / chỉ lượt bị chặn. */
export async function docKiem(tenantId: string, f: { since?: Date; entity?: string; code?: string; key?: string; user?: string; onlyFailed?: boolean; limit?: number } = {}) {
  const rows = await readRunLog<KiemRow>(LUONG_KIEM, { tenantId, since: f.since });
  const out = rows.filter((r) => (!f.entity || f.entity.split(',').some((e) => r.data.entity === e || r.data.entity.startsWith(`${e}/`))) && (!f.key || r.data.key === f.key) && (!f.user || r.data.user === f.user)
    && (!f.code || r.data.failed.some((x) => x.code === f.code)) && (!f.onlyFailed || !r.data.ok || r.data.failed.length > 0));
  return out.reverse().slice(0, f.limit ?? 1000);
}
