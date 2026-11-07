// [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020 / R-GATE-11: căn cứ của từng mã trong thư viện phát hiện — trỏ văn bản trong danh mục căn cứ pháp lý của repo
/**
 * CĂN CỨ CỦA MÃ PHÁT HIỆN (R-GATE-11, ADR-0020). Mỗi mã của `bizcity_findings@1` khai một hoặc vài căn cứ:
 *   - văn bản trong danh mục căn cứ pháp lý của repo (docs/can-cu/01-danh-muc-van-ban.md — có ngày rà soát), ghi ở MỨC VĂN BẢN;
 *     điều khoản cụ thể chỉ thêm khi đã đối chiếu văn bản gốc (docs/can-cu/00-cach-dung.md);
 *   - `NOI-BO` = quy ước phần mềm (khuôn dữ liệu, phiên bản, chủ chứng từ…) — không gán bừa vào luật.
 * SC-FIND-1 kiểm: mọi mã có dòng ở FINDING_BASIS, khoá có trong LEGAL_BASES, tên văn bản (trừ NOI-BO) có trong trang danh mục.
 * Mỗi mã một dòng (bộ kiểm đọc bằng regex).
 */

export interface LegalBasis {
  /** Tên văn bản đúng như trang danh mục (in đậm ở docs/can-cu/01-danh-muc-van-ban.md). */
  title: string;
  /** Trang tóm tắt trong docs/can-cu/ — chỗ người đọc tra tiếp. */
  page: string;
}

// prettier-ignore
export const LEGAL_BASES = {
  'LKT': { title: 'Luật Kế toán số 88/2015/QH13', page: 'docs/can-cu/03-so-ke-toan.md' },
  'TT99': { title: 'Thông tư 99/2025/TT-BTC', page: 'docs/can-cu/06-tai-khoan-bao-cao-tai-chinh.md' },
  'VAS02': { title: 'Chuẩn mực kế toán số 02 — Hàng tồn kho', page: 'docs/can-cu/04-hang-ton-kho-gia-von.md' },
  'ND123': { title: 'Nghị định 123/2020/NĐ-CP', page: 'docs/can-cu/05-hoa-don-thue-gtgt.md' },
  'TT32': { title: 'Thông tư 32/2025/TT-BTC', page: 'docs/can-cu/05-hoa-don-thue-gtgt.md' },
  'LGTGT': { title: 'Luật Thuế GTGT số 48/2024/QH15', page: 'docs/can-cu/05-hoa-don-thue-gtgt.md' },
  'LQLT': { title: 'Luật Quản lý thuế số 108/2025/QH15', page: 'docs/can-cu/01-danh-muc-van-ban.md' },
  'NQ204': { title: 'Nghị quyết 204/2025/QH15', page: 'docs/can-cu/05-hoa-don-thue-gtgt.md' },
  'NOI-BO': { title: 'Quy ước phần mềm', page: 'docs/can-cu/02-chuc-nang-va-can-cu.md' },
} as const satisfies Record<string, LegalBasis>;

export type BasisKey = keyof typeof LEGAL_BASES;

// prettier-ignore
export const FINDING_BASIS: Record<string, readonly BasisKey[]> = {
  // ── Gate A — danh mục ──
  'ACC-HINT-001': ['TT99'],
  'ACC-HINT-002': ['TT99'],
  'ACC-HINT-003': ['TT99'],
  'ACC-HINT-004': ['TT99'],
  'ACC-HINT-005': ['TT99'],
  'ACC-HINT-006': ['TT99', 'LKT'],
  'ACC-HINT-007': ['TT99'],
  'ACC-BLOCK-001': ['TT99'],
  'ITEM-BLOCK-001': ['VAS02'],
  'ITEM-BLOCK-002': ['TT99', 'VAS02'],
  'ITEM-HINT-001': ['TT99', 'VAS02'],
  'ITEM-HINT-002': ['VAS02', 'TT99'],
  'ITEM-HINT-003': ['VAS02'],
  'PART-HINT-001': ['ND123', 'LGTGT'],
  'PART-HINT-002': ['ND123', 'LGTGT'],
  'PART-HINT-003': ['NOI-BO'],
  'PART-HINT-004': ['LQLT'],
  // ── Gate B — trạm tiền kiểm ──
  'IN-SHAPE-001': ['LKT'],
  'IN-SHAPE-002': ['NOI-BO'],
  'IN-SHAPE-003': ['LKT'],
  'IN-SHAPE-004': ['NOI-BO'],
  'IN-SHAPE-005': ['NOI-BO'],
  'IN-SHAPE-006': ['NOI-BO'],
  'IN-SUM-001': ['ND123'],
  'IN-SUM-002': ['LKT'],
  'IN-SUM-005': ['ND123'],
  'IN-SUM-006': ['ND123', 'LGTGT'],
  'IN-SUM-003': ['LGTGT'],
  'IN-SUM-004': ['ND123'],
  'IN-MD-001': ['NOI-BO'],
  'IN-MD-004': ['NOI-BO'],
  'IN-ITEM-001': ['VAS02', 'TT99'],
  'IN-ITEM-009': ['VAS02'],
  'IN-MD-005': ['LQLT'],
  'IN-GUARD-001': ['NOI-BO'],
  'IN-BIZ-003': ['NOI-BO'],
  'IN-BIZ-004': ['NOI-BO'],
  'IN-BIZ-005': ['NOI-BO'],
  'IN-BIZ-006': ['ND123', 'LGTGT'],
  'IN-BIZ-007': ['ND123'],
  // [2026-11-03 08:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — căn cứ cho 10 mã PHASE-021 W5 (gộp từ main), MỨC VĂN BẢN theo R-GATE-11, lấy từ docs/can-cu; chưa đối chiếu điều khoản ở văn bản gốc.
  // IN-VAT-001 khớp nguồn của rulepack vat-vn (NQ204). IN-CFG-001: hồ sơ còn cho chọn TT200 / TT133 / TT152 nhưng danh mục căn cứ chưa có các văn bản này — bổ sung vào docs/can-cu/01 rồi thêm khoá.
  'IN-BIZ-001': ['LKT'],
  'IN-POST-001': ['NOI-BO'],
  'IN-POST-002': ['NOI-BO'],
  'IN-POST-003': ['NOI-BO'],
  'IN-POST-004': ['TT99'],
  'IN-POST-005': ['NOI-BO'],
  'IN-VAT-001': ['NQ204'],
  'IN-INV-001': ['ND123', 'LGTGT'],
  'IN-INV-002': ['ND123'],
  'IN-CFG-001': ['TT99'],
  // ── Cổng L — thư viện dùng chung (ADR-0032) ── [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45: mã LIB-* là quy ước phần mềm
  'LIB-UNKNOWN-001': ['NOI-BO'],
  'LIB-DEPRECATED-001': ['NOI-BO'],
  'LIB-REMOVED-001': ['NOI-BO'],
  'LIB-EFFECTIVE-001': ['NOI-BO'],
  'LIB-SCHEMA-001': ['NOI-BO'],
  'LIB-VALUE-001': ['NOI-BO'],
  'LIB-UNVERIFIED-001': ['NOI-BO'],
};

/** Căn cứ của một mã (tên văn bản + trang tra). Mã chưa khai → rỗng (SC-FIND-1 báo). */
export function basisOf(code: string): { key: BasisKey; title: string; page: string }[] {
  return (FINDING_BASIS[code] ?? []).map((key) => ({ key, ...LEGAL_BASES[key] }));
}
