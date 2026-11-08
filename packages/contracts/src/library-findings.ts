// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-5, BIZCITY-LIBRARY-v1 §6.1 / §7): bảy mã chuẩn LIB-* của bộ kiểm thư viện — danh mục nguồn thứ ba của bizcity_findings@1 (cổng L)
/**
 * Mã chung cho mọi thư viện bizcity_library@1. Bộ kiểm (`@bizcity/platform/core/libraries`) trả các mã này kèm `suggestions[]`.
 * Mã luật riêng của từng thư viện (`<codePrefix>-<NHÓM>-<NNN>`) nằm trong `libraries/<id>/library.json`, không ở đây.
 * Một dòng một mã (SC-FIND-1 đọc bằng regex): `'LIB-…': { level, step, title, why, fix },`.
 */
export type LibraryFindingLevel = 'block' | 'warn' | 'info';
export interface LibraryFindingSpec {
  level: LibraryFindingLevel;
  /** Kiểm chuẩn sinh ra mã. */
  step: 'code' | 'status' | 'effective' | 'schema' | 'value' | 'verified';
  title: string;
  why: string;
  fix: string;
}

// prettier-ignore
export const LIBRARY_FINDINGS = {
  'LIB-UNKNOWN-001': { level: 'block', step: 'code', title: 'Mã không có trong thư viện', why: 'Giá trị phải lấy từ thư viện để mọi đơn vị, mọi kênh hiểu cùng một nghĩa; mã lạ thường là gõ nhầm hoặc mã của phần mềm khác.', fix: 'Chọn một mã trong danh sách gợi ý (gần nhất theo mã / tên), hoặc chọn từ ô chọn của thư viện.' },
  'LIB-DEPRECATED-001': { level: 'warn', step: 'status', title: 'Mã đã ngừng dùng', why: 'Mã vẫn đọc được cho chứng từ cũ nhưng không nên dùng cho dữ liệu mới; thư viện đã có mã thay thế.', fix: 'Đổi sang mã thay thế (replacedBy) trong gợi ý.' },
  'LIB-REMOVED-001': { level: 'block', step: 'status', title: 'Mã đã bỏ', why: 'Mã chỉ còn để tra nghĩa của dữ liệu cũ; không nhận cho dữ liệu mới.', fix: 'Dùng mã thay thế trong gợi ý, hoặc chọn lại từ ô chọn.' },
  'LIB-EFFECTIVE-001': { level: 'block', step: 'effective', title: 'Không có giá trị tại ngày này', why: 'Tham số chỉ có hiệu lực trong các khoảng ngày theo văn bản; ngày chứng từ nằm ngoài mọi khoảng.', fix: 'Kiểm lại ngày chứng từ, hoặc dùng khoảng hiệu lực gần nhất trong gợi ý nếu văn bản mới chưa được cập nhật vào thư viện.' },
  'LIB-SCHEMA-001': { level: 'block', step: 'schema', title: 'Dữ liệu sai khuôn của thư viện', why: 'Mỗi thư viện khai khuôn dữ liệu (itemSchema); dữ liệu sai khuôn thì máy không đọc đúng được.', fix: 'Sửa trường được chỉ ra theo khuôn đúng trong gợi ý.' },
  'LIB-VALUE-001': { level: 'warn', step: 'value', title: 'Giá trị khác thư viện tại ngày', why: 'Giá trị nhập khác giá trị thư viện có hiệu lực ở ngày đó; thường là dùng số cũ hoặc gõ nhầm.', fix: 'Dùng giá trị thư viện trong gợi ý; nếu văn bản mới đã thay, ghi căn cứ và báo người giữ thư viện.' },
  'LIB-UNVERIFIED-001': { level: 'info', step: 'verified', title: 'Mục thư viện chưa được duyệt', why: 'Mục được nạp từ nguồn nhưng người giữ thư viện chưa đối chiếu văn bản gốc.', fix: 'Đối chiếu căn cứ trước khi dùng để tính tiền; người giữ thư viện xác nhận rồi đặt verified.' },
} as const satisfies Record<string, LibraryFindingSpec>;

export type LibraryFindingCode = keyof typeof LIBRARY_FINDINGS;
