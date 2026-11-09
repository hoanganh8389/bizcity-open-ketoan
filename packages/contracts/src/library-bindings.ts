// [2026-11-09 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51b (B5b, PHASE-030 · 26 §4.2): bảng gắn trường chứng từ ↔ thư viện dùng chung và khuôn kết quả `libraryFindings[]` của tiền kiểm — chỉ cảnh báo, kênh riêng, không vào IN-* / điểm
/**
 * BẢNG GẮN TRƯỜNG ↔ THƯ VIỆN (bizcity_library@1, 26 §4.2). Nằm ở hợp đồng, không ở module: thêm một gắn là thêm một dòng ở đây (K1).
 * Cửa nạp và tiền kiểm gọi cùng hàm `libraryFindings` (kernel/intake/library-check.ts, R-INTAKE-4); kết quả là cảnh báo / nhắc
 * (không bao giờ chặn), đi kênh `libraryFindings[]` cạnh `findings[]` — không đổi IntakeCode, điểm hay bút toán.
 */

/** Một gắn: giá trị ở `path` của chứng từ phải là mã của `library` tại ngày chứng từ. */
export interface LibraryBinding {
  /** Định danh ổn định (đơn vị hạ / tắt theo id này, 26 §7.1). */
  id: string;
  /** Đường trường: tên trường, `[]` cho mảng, dấu chấm cho lồng — vd `lines[].taxCode`, `reasonCode`. */
  path: string;
  library: string;
  label: string;
  /** Hôm nay chỉ có `docDate` (giá trị theo ngày chứng từ). */
  at: 'docDate';
}

export const LIBRARY_BINDINGS: readonly LibraryBinding[] = [
  { id: 'taxcode-line', path: 'lines[].taxCode', library: 'vn.loai-thue', label: 'Mã thuế trên dòng chứng từ', at: 'docDate' },
  { id: 'reason', path: 'reasonCode', library: 'core.ly-do-dinh-khoan', label: 'Lý do nghiệp vụ (chi / chính)', at: 'docDate' },
  { id: 'reason-to', path: 'toReasonCode', library: 'core.ly-do-dinh-khoan', label: 'Lý do nghiệp vụ phía nhận (chuyển tiền)', at: 'docDate' },
];

export const BINDING_PATH_RE = /^[A-Za-z][A-Za-z0-9]*(\[\])?(\.[A-Za-z][A-Za-z0-9]*(\[\])?)*$/;

export const bindingsOfLibrary = (library: string): LibraryBinding[] => LIBRARY_BINDINGS.filter((b) => b.library === library);

/** Gợi ý sửa — khuôn của thư viện (không phụ thuộc Platform). */
export interface LibraryFindingSuggestion { value: unknown; label: string; why: string; confidence: 'cao' | 'vua' | 'thap' }

/** Một cảnh báo / nhắc theo thư viện của chứng từ. `level` không bao giờ là `block` (hạ xuống `warn`, `blockedBy` = true). */
export interface LibraryFindingEntry {
  binding: string;
  library: string;
  /** Đường cụ thể của lần xuất hiện đầu tiên, vd `lines[1].taxCode`. */
  path: string;
  /** Số lần giá trị này xuất hiện ở đường gắn trong chứng từ. */
  occurrences: number;
  /** Giá trị gốc người / hệ thống gửi (mã — không phải số tiền hay tên). */
  value: string;
  code: string;
  level: 'warn' | 'info';
  message: string;
  /** Thư viện đặt mức chặn nhưng cửa nạp chỉ cảnh báo (26 §4.2). */
  blockedBy?: true;
  suggestions: LibraryFindingSuggestion[];
}

/**
 * Các giá trị chuỗi không rỗng ở `path` của chứng từ, kèm đường cụ thể. Khuôn đường: BINDING_PATH_RE.
 * Không phải chuỗi (số, đối tượng) thì bỏ qua — gắn chỉ áp cho mã.
 */
export function bindingValues(doc: unknown, path: string): { path: string; value: string }[] {
  if (!BINDING_PATH_RE.test(path)) return [];
  const out: { path: string; value: string }[] = [];
  const walk = (node: unknown, segs: string[], at: string): void => {
    if (segs.length === 0) {
      if (typeof node === 'string' && node.trim()) out.push({ path: at, value: node.trim() });
      return;
    }
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const seg = segs[0]!;
    const isArr = seg.endsWith('[]');
    const key = isArr ? seg.slice(0, -2) : seg;
    const child = (node as Record<string, unknown>)[key];
    const next = at ? `${at}.${key}` : key;
    if (isArr) {
      if (Array.isArray(child)) child.forEach((c, i) => walk(c, segs.slice(1), `${next}[${i}]`));
    } else walk(child, segs.slice(1), next);
  };
  walk(doc, path.split('.'), '');
  return out;
}
