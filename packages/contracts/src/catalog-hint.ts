// [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: căn cứ trong phát hiện (R-GATE-11); bỏ cờ "nháp chờ kế toán trưởng" (Core không mã hoá quy trình theo chức danh); ITEM-HINT-002 nhắc mặt hàng tự thêm (R-GATE-9 / 10)
// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09: duyệt luật nhắc theo đơn vị (D023-4 / D023-8) — ví dụ minh hoạ từng luật, áp bản duyệt (sửa câu chữ, hạ warn → info)
// [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: luật nhắc mặt hàng ITEM-* (thiếu ĐVT, thiếu nhóm hạch toán) — còn ✘ thì mặt hàng lưu NHÁP (ADR-0019)
// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27: thêm `fix` (cách sửa) cho mức warn / block — khuôn chung bizcity_findings@1
// [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-13 / 14: bizcity_catalog_hint@1 — danh mục luật nhắc · hướng dẫn · cảnh báo mềm · chặn cho form danh mục (D023-6..8)
import { QT_DOI_TUONG } from './quy-tac/doi-tuong.js';
import { QT_TO_CHUC_NGAN_HANG } from './quy-tac/to-chuc-ngan-hang.js';
import { QT_NHOM_HANG } from './quy-tac/nhom-hang.js';
import { basisOf } from './legal-basis.js';

/**
 * Khung "Vì sao" của form danh mục (PHASE-023 · 20-VALIDATOR-MEM): mỗi luật có mã, mức, câu "vì sao" nói bằng hậu quả nghiệp vụ,
 * cách sửa, mã luật gốc và thẻ "học thêm". Nguồn duy nhất cho máy chủ (`/api/v1/<danh mục>/validate`, `meta.findings` khi lưu)
 * và giao diện (khung Vì sao, hộp ghi lý do).
 *
 * Mức:
 *   info  — nhắc: ô vừa chọn có hệ quả không hiển nhiên; không phải làm gì
 *   guide — hướng dẫn: giải thích bản chất, có link học thêm
 *   warn  — cảnh báo mềm: hợp lệ về kỹ thuật nhưng thường sai về kế toán; lưu được nhưng PHẢI ghi lý do (≥ 5 ký tự, D023-6);
 *           người lưu tự chịu trách nhiệm vì đã được cảnh báo (D023-7)
 *   block — chặn: chỉ toàn vẹn dữ liệu / bất biến; không lưu được
 * Cảnh báo mềm không bao giờ thành chặn bằng cấu hình; chặn không hạ thành mềm. Hạ warn → info cho một đơn vị chỉ qua duyệt
 * tại đơn vị có bằng chứng (D023-8): màn HT09 "Quy định dữ liệu danh mục", bảng catalog_rule_reviews, áp bằng applyRuleReview.
 *
 * Luật chạy ngay theo nội dung ở đây (ADR-0020: Core không mã hoá quy trình "chờ kế toán trưởng" — ai làm gì là việc của phân quyền).
 * Người có quyền của từng đơn vị chỉnh ở HT09: sửa câu chữ (chỉ dùng biến của luật gốc), hạ mức (chỉ warn → info). Mỗi luật có căn
 * cứ (FINDING_BASIS, R-GATE-11); phát hiện mang tên văn bản căn cứ.
 */

export type CatalogHintLevel = 'info' | 'guide' | 'warn' | 'block';
// [2026-11-19 Nguyễn Văn Thủy] thêm unit (ĐVT), bank (TK ngân hàng), branch (chi nhánh); quy tắc từng danh mục ở src/quy-tac/*.ts (đóng góp)
export type CatalogEntity = 'account' | 'partner' | 'item' | 'unit' | 'bank' | 'branch' | 'group';

export interface CatalogHintDef {
  id: string;
  entity: CatalogEntity;
  level: CatalogHintLevel;
  /** Câu ngắn hiện ngay (≤ 1 câu). Có thể chứa {biến}. */
  title: string;
  /** Vì sao — hậu quả nghiệp vụ trước, cách sửa sau; ≤ 3 câu. Có thể chứa {biến}. */
  why: string;
  /** Cách sửa (≤ 2 câu). Bắt buộc với mức warn / block (SC-FIND-1, R-GATE-2). */
  fix?: string;
  /** Mã luật gốc (R-*, ADR-*) — SC-CON-5 kiểm mã R-* có thật. */
  rule?: string;
  /** Thẻ học thêm: số tài khoản (thẻ tài khoản, PHASE-023) hoặc mã màn. */
  learn?: string;
  status: 'draft' | 'approved';
  /** [2026-11-19 Nguyễn Văn Thủy] Câu khi ĐÃ QUA (danh sách ✓ / ✗ ở form, cột Tình trạng), vd "Có tên mặt hàng" (đóng góp) */
  okText?: string;
  /** Ô trên form (Field truong=…) để tô đỏ. */
  field?: string;
}

/** Một phát hiện cho một bản khai báo cụ thể (đã thay biến). */
export interface CatalogFinding {
  code: string;
  level: CatalogHintLevel;
  title: string;
  why: string;
  rule?: string;
  learn?: string;
  /** Cách sửa bằng lời (bizcity_findings@1 `fix`) — có với mức warn / block. */
  howTo?: string;
  /** Sửa một chạm: các trường và giá trị đề xuất (giao diện điền vào form). */
  fix?: { label: string; set: Record<string, unknown> };
  /** Ô liên quan — giao diện đặt khung Vì sao cạnh nhóm ô này. */
  field?: string;
  draft?: boolean;
  /** Biến đã thay vào câu chữ — để áp câu chữ đơn vị sửa lại (applyRuleReview). */
  vars?: Record<string, string | number>;
  /** Cảnh báo mềm đã được đơn vị hạ xuống nhắc (D023-8, người có quyền ở HT09). */
  lowered?: boolean;
  /** Căn cứ (tên văn bản) — R-GATE-11. */
  basis?: string[];
}

/** Ghi nhận khi lưu bản khai báo còn cảnh báo mềm (D023-6): bắt buộc lý do. */
export interface CatalogWarnAck {
  reason: string;
  /** Mã các cảnh báo người dùng đã thấy khi bấm Ghi. */
  codes: string[];
}
export const WARN_ACK_MIN_REASON = 5;

const BASE_HINTS: Record<string, CatalogHintDef> = {
  // ── Tài khoản (ACC1) ────────────────────────────────────────────────────────────────────────────────
  'ACC-HINT-001': {
    id: 'ACC-HINT-001', entity: 'account', level: 'info', status: 'draft', rule: 'R-MD-8', learn: '{parent}',
    title: 'Kế thừa từ {parent}: {inherited}.',
    why: 'Tài khoản con dùng cùng bản chất với tài khoản cha; khi thêm con, {parent} thành tài khoản tổng hợp và không ghi sổ trực tiếp được nữa.',
  },
  'ACC-HINT-002': {
    id: 'ACC-HINT-002', entity: 'account', level: 'guide', status: 'draft', rule: 'R-MD-8', learn: '131',
    title: 'Lưỡng tính nghĩa là gì?',
    why: 'Mỗi đối tượng có thể đang nợ mình (dư Nợ) hoặc đã trả trước (dư Có) — hai sự thật khác nhau, sổ giữ riêng từng đối tượng, không bù trừ. Báo cáo lên hai chỉ tiêu khác nhau (vd 131: dư Nợ → Phải thu khách hàng, dư Có → Người mua trả tiền trước).',
  },
  'ACC-HINT-003': {
    id: 'ACC-HINT-003', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-8', learn: '{root}',
    title: 'Tài khoản {code} sẽ không vào sổ phụ công nợ.',
    why: 'Nhóm {root} là phải thu / phải trả, nhưng tài khoản này không lưỡng tính, không theo dõi đối tượng, không "Là công nợ" — sổ phụ công nợ chỉ lấy tài khoản có một trong ba cờ đó. Không có tuổi nợ, không đối trừ hoá đơn, không đối chiếu công nợ; với nhóm này gần như luôn sai.',
    fix: 'Tích "Theo dõi đối tượng" (hoặc đặt lưỡng tính nếu là phải thu / phải trả hai chiều); nếu cố ý, ghi lý do khi lưu.',
  },
  'ACC-HINT-004': {
    id: 'ACC-HINT-004', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-8', learn: '{root}',
    title: 'Bên số dư "{side}" khác bản chất thường gặp của tài khoản nhóm {root} ({expected}).',
    why: 'Số dư sẽ lên sai bên trên Bảng cân đối và kiểm ACCOUNT_WRONG_SIDE báo mỗi đêm. Chỉ khác khi đây là tài khoản điều chỉnh giảm (vd hao mòn, dự phòng) — khi đó ghi rõ lý do.',
    fix: 'Đặt lại bên số dư theo tài khoản cha; nếu là tài khoản điều chỉnh giảm, ghi lý do khi lưu.',
  },
  'ACC-HINT-005': {
    id: 'ACC-HINT-005', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-8', learn: '{root}',
    title: 'Tài khoản {code} chưa tích "Theo dõi đối tượng".',
    why: 'Tài khoản nhóm {root} ghi nghĩa vụ với một người cụ thể (khách, nhà cung cấp, nhân viên, đơn vị nội bộ). Không theo dõi đối tượng thì không biết ai nợ ai, sổ chi tiết công nợ và đối chiếu không làm được.',
    fix: 'Tích "Theo dõi đối tượng"; nếu cố ý, ghi lý do khi lưu.',
  },
  'ACC-HINT-006': {
    id: 'ACC-HINT-006', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-4', learn: '{code}',
    title: 'Tài khoản {code} còn số dư {balance} — ngừng sử dụng sẽ để số dư treo.',
    why: 'Ngừng dùng không xoá số dư: số dư vẫn lên báo cáo nhưng không ghi tiếp để tất toán được. Thường nên chuyển số dư sang tài khoản thay thế bằng một phiếu kế toán trước, rồi mới ngừng.',
    fix: 'Lập phiếu kế toán chuyển số dư sang tài khoản thay thế, rồi ngừng dùng; nếu cố ý giữ số dư treo, ghi lý do khi lưu.',
  },
  'ACC-HINT-007': {
    id: 'ACC-HINT-007', entity: 'account', level: 'warn', status: 'draft', rule: 'R-MD-7',
    title: 'Tài khoản cấp 1 {code} không có trong hệ thống tài khoản chuẩn.',
    why: 'Tài khoản cấp 1 do chế độ kế toán quy định; tự thêm tài khoản cấp 1 làm báo cáo tài chính không có chỉ tiêu cho nó. Thường nên thêm làm tài khoản con của một tài khoản chuẩn.',
    fix: 'Thêm làm tài khoản con của một tài khoản chuẩn; nếu chế độ kế toán của đơn vị có tài khoản này, ghi lý do khi lưu.',
  },
  'ACC-BLOCK-001': {
    id: 'ACC-BLOCK-001', entity: 'account', level: 'block', status: 'approved', rule: 'R-MD-8',
    title: 'Số tài khoản con phải bắt đầu bằng số tài khoản cha ({parent}).',
    why: 'Cây hệ thống tài khoản dựa vào tiền tố số hiệu để cộng dồn lên tài khoản cha và lên báo cáo; sai tiền tố làm số liệu cộng sai chỗ.',
    fix: 'Đổi số tài khoản cho bắt đầu bằng số tài khoản cha, hoặc chọn đúng tài khoản cha.',
  },
  // ── Mặt hàng (DM, PHASE-024 S024-28): còn ✘ → lưu NHÁP, chưa dùng được trên chứng từ (Gate B giữ với IN-ITEM-009) ──
  'ITEM-BLOCK-001': {
    id: 'ITEM-BLOCK-001', entity: 'item', level: 'block', status: 'draft', rule: 'R-GATE-3', okText: 'Có đơn vị tính gốc (nhỏ nhất)', field: 'units',
    title: 'Mặt hàng {sku} chưa có đơn vị tính gốc.',
    why: 'Sổ kho đếm theo đơn vị tính gốc (đơn vị nhỏ nhất); không có thì không quy đổi được số lượng nhập / xuất, tồn kho và giá vốn sai.',
    fix: 'Nhập đơn vị tính gốc (vd hộp, cái, kg). Mặt hàng được lưu nháp tới khi có, rồi tự kích hoạt.',
  },
  'ITEM-BLOCK-002': {
    id: 'ITEM-BLOCK-002', entity: 'item', level: 'block', status: 'draft', rule: 'R-ITEM-4', okText: 'Có nhóm hạch toán (hoặc nhóm mặc định của đơn vị)',
    title: 'Mặt hàng {sku} chưa có nhóm hạch toán và đơn vị chưa có nhóm mặc định.',
    why: 'Nhóm hạch toán quyết định tài khoản kho, giá vốn, doanh thu; không có nhóm thì không định khoản được chứng từ có mặt hàng này.',
    fix: 'Chọn nhóm hạch toán cho mặt hàng, hoặc khai một nhóm mặc định ở Cấu hình hạch toán.',
  },
  'ITEM-HINT-001': {
    id: 'ITEM-HINT-001', entity: 'item', level: 'warn', status: 'draft', rule: 'R-ITEM-8',
    title: 'Mặt hàng {sku} chưa gán nhóm hạch toán — sẽ ghi theo nhóm mặc định {group}.',
    why: 'Nhóm mặc định thường là hàng hoá (kho 156, giá vốn 632, doanh thu 511). Nếu đây là dịch vụ, nguyên vật liệu hay công cụ dụng cụ thì tồn kho, giá vốn và lãi gộp sẽ sai.',
    fix: 'Chọn nhóm hạch toán đúng loại; nếu đúng là hàng hoá theo nhóm mặc định, ghi lý do khi lưu.',
  },
  // [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020 (R-GATE-9 / 10): nhắc mặt hàng tự thêm từ chứng từ — thông báo dựng từ mã này (notifyFinding), không câu chữ tự do
  'ITEM-HINT-002': {
    id: 'ITEM-HINT-002', entity: 'item', level: 'info', status: 'approved', rule: 'R-GATE-9',
    title: 'Chứng từ {docNo} đã tự thêm {count} mặt hàng — cần kiểm.',
    why: 'Mã hàng mới trên chứng từ được thêm vào danh mục và vào sổ ngay: {items}. Đơn vị tính và nhóm hạch toán đang theo khai báo tự động; sai thì kho, giá vốn và doanh thu ghi sai.',
    fix: 'Mở từng mặt hàng ở Danh mục mặt hàng, kiểm đơn vị tính và nhóm hạch toán rồi lưu. Muốn kiểm trước khi vào sổ: tắt tự thêm mặt hàng ở Quy định dữ liệu danh mục.',
  },
  // [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3 (R-ITEM-3, D026-2): biến thể kinh tế khác = định danh mới — nhắc khi đổi ĐVT gốc của mặt hàng đã có nhập xuất
  'ITEM-HINT-003': {
    id: 'ITEM-HINT-003', entity: 'item', level: 'warn', status: 'approved', rule: 'R-ITEM-3',
    title: 'Mặt hàng {sku} đã có nhập xuất theo đơn vị tính "{from}" — đổi sang "{to}".',
    why: 'Sổ kho và giá vốn đã đếm theo "{from}". Đổi đơn vị tính gốc của cùng một định danh làm số lượng tồn cũ và mới không cộng được với nhau, đơn giá bình quân lẫn hai quy cách. Nếu đây là quy cách khác (hộp ↔ thùng, 400g ↔ 900g) thì đó là một biến thể kinh tế khác, cần một mặt hàng riêng.',
    fix: 'Quy cách khác: giữ đơn vị cũ, tạo mặt hàng mới (mã mới, chọn mã cha là {sku}) và dùng quy đổi đơn vị nếu cần. Chỉ sửa tên đơn vị (cùng quy cách, vd "hop" → "Hộp"): lưu và ghi lý do.',
  },
  // ── [2026-11-19 Nguyễn Văn Thủy] Bộ quy tắc khai báo mặt hàng (docs/nghiep-vu/25): mỗi kiểm có mã, ô, câu báo, cách sửa (đóng góp) ──
  'ITEM-BLOCK-003': {
    id: 'ITEM-BLOCK-003', entity: 'item', level: 'block', status: 'approved', rule: 'R-GATE-3', okText: 'Có tên mặt hàng', field: 'name',
    title: 'Chưa nhập tên mặt hàng.',
    why: 'Tên in trên hoá đơn, phiếu nhập, bill; quầy và kho tìm hàng theo tên. Không có tên thì không chọn đúng hàng.',
    fix: 'Nhập tên mặt hàng (tối đa 50 ký tự). Mặt hàng được giữ nháp tới khi có tên.',
  },
  'ITEM-BLOCK-004': {
    id: 'ITEM-BLOCK-004', entity: 'item', level: 'block', status: 'approved', okText: 'Tên không quá 50 ký tự', field: 'name',
    title: 'Tên mặt hàng dài quá {max} ký tự (đang {len}).',
    why: 'Tên dài bị cắt trên bill, tem giá và hoá đơn điện tử, người đọc không phân biệt được hàng.',
    fix: 'Rút gọn tên còn tối đa {max} ký tự; thông tin thêm ghi ở Mô tả.',
  },
  'ITEM-BLOCK-005': {
    id: 'ITEM-BLOCK-005', entity: 'item', level: 'block', status: 'approved', okText: 'Tên không trùng mặt hàng khác', field: 'name',
    title: 'Tên "{name}" đã dùng cho mặt hàng {other}.',
    why: 'Hai mặt hàng cùng tên làm quầy và kho chọn nhầm, tồn kho và giá vốn ghi sai mã.',
    fix: 'Đặt tên khác (thêm quy cách, dung tích…), hoặc mở mặt hàng {other} để dùng lại.',
  },
  'ITEM-BLOCK-006': {
    id: 'ITEM-BLOCK-006', entity: 'item', level: 'block', status: 'approved', okText: 'Mã hàng chưa ai dùng', field: 'sku',
    title: 'Mã hàng {sku} đã có.',
    why: 'Mỗi mã hàng chỉ thuộc một mặt hàng; dùng lại mã làm lẫn tồn kho và lịch sử của hai mặt hàng.',
    fix: 'Bấm sinh mã lại theo nhóm hàng, hoặc gõ mã khác.',
  },
  'ITEM-BLOCK-007': {
    id: 'ITEM-BLOCK-007', entity: 'item', level: 'block', status: 'approved', okText: 'Mã chính đúng khuôn (không chữ ở đầu / cuối)', field: 'sku',
    title: 'Mã hàng {sku} không được có chữ ở đầu hoặc cuối.',
    why: 'Chữ ở đầu / cuối mã dành cho mã biến thể (mã cha + chữ). Mã chính có chữ làm hệ thống hiểu nhầm là biến thể.',
    fix: 'Bỏ chữ ở đầu / cuối mã; muốn tạo biến thể thì chọn "Mã biến thể" và chọn mã cha.',
  },
  'ITEM-BLOCK-008': {
    id: 'ITEM-BLOCK-008', entity: 'item', level: 'block', status: 'approved', okText: 'Mã biến thể có mã cha hợp lệ', field: 'sku',
    title: 'Mã biến thể {sku}: {detail}.',
    // [2026-11-21 kiennt] NT-DM-018 — mã biến thể mới chỉ thêm ở cuối mã cha (đóng góp)
    why: 'Mã biến thể là mã cha thêm tối đa 2 ký tự ở cuối; mã cha phải khai trước để biến thể lấy nhóm, nhãn, đơn vị tính theo.',
    fix: 'Khai mã cha trước, hoặc sửa mã biến thể: giữ nguyên mã cha, chỉ thêm tối đa 2 ký tự ở cuối (không thêm chữ ở đầu).',
  },
  'ITEM-BLOCK-009': {
    id: 'ITEM-BLOCK-009', entity: 'item', level: 'block', status: 'approved', okText: 'Nhóm / ngành / nhãn có trong danh mục', field: 'groupCode',
    title: '{label} {code} chưa có trong danh mục.',
    why: 'Phân loại quyết định báo cáo theo nhóm, nhãn và chính sách mua / bán; mã phân loại không có thì mặt hàng không lên đúng báo cáo.',
    fix: 'Chọn lại trong danh sách, hoặc khai {label} ở Danh mục nhóm hàng trước.',
  },
  'ITEM-BLOCK-011': {
    id: 'ITEM-BLOCK-011', entity: 'item', level: 'block', status: 'approved', okText: 'Giá bán theo bảng giá và đơn vị tính đã khai', field: 'prices',
    title: 'Giá bán: {detail}.',
    why: 'Giá gắn với một bảng giá và một đơn vị tính của mặt hàng; bảng giá hoặc đơn vị không có thì quầy không lấy được giá.',
    fix: 'Chọn bảng giá có sẵn và đơn vị tính đã khai ở thẻ Đơn vị tính.',
  },
  'ITEM-BLOCK-013': {
    id: 'ITEM-BLOCK-013', entity: 'item', level: 'block', status: 'approved', okText: 'Chưa có nhập xuất (xoá được)',
    title: 'Mặt hàng {sku} đã có nhập xuất, không xoá được.',
    why: 'Sổ kho, giá vốn và chứng từ đã ghi theo mặt hàng này; xoá làm mất lịch sử và sai số liệu.',
    fix: 'Bỏ tích "Theo dõi" để ngừng dùng mặt hàng.',
  },
  'ITEM-BLOCK-014': {
    id: 'ITEM-BLOCK-014', entity: 'item', level: 'block', status: 'approved', rule: 'R-GATE-3', okText: 'Đúng một đơn vị tính tỉ lệ 1', field: 'units',
    title: 'Đơn vị tính: {detail}.',
    why: 'Sổ kho đếm theo đúng một đơn vị nhỏ nhất (tỉ lệ 1); các đơn vị khác quy về đơn vị này.',
    fix: 'Ở thẻ Đơn vị tính, để đúng một dòng tỉ lệ 1 (vd Hộp = 1, Thùng = 48).',
  },
  'ITEM-BLOCK-015': {
    id: 'ITEM-BLOCK-015', entity: 'item', level: 'block', status: 'approved', okText: 'Tên đơn vị tính không trống, không trùng', field: 'units',
    title: 'Đơn vị tính: {detail}.',
    why: 'Phiếu chọn đơn vị theo tên; tên trống hoặc trùng thì không biết đang nhập theo đơn vị nào.',
    fix: 'Đặt tên cho mọi dòng đơn vị tính, mỗi tên một lần.',
  },
  'ITEM-BLOCK-016': {
    id: 'ITEM-BLOCK-016', entity: 'item', level: 'block', status: 'approved', okText: 'Tỉ lệ đơn vị tính lớn hơn 0', field: 'units',
    title: 'Tỉ lệ của đơn vị "{unit}" phải lớn hơn 0.',
    why: 'Tỉ lệ dùng để quy số lượng về đơn vị nhỏ nhất; bằng 0 hoặc âm làm tồn kho sai.',
    fix: 'Nhập số đơn vị nhỏ nhất trong một {unit} (vd 1 Thùng = 48 Hộp thì ghi 48).',
  },
  'ITEM-BLOCK-017': {
    id: 'ITEM-BLOCK-017', entity: 'item', level: 'block', status: 'approved', okText: 'Không quá 10 đơn vị tính', field: 'units',
    title: 'Mặt hàng có quá {max} đơn vị tính (đang {count}).',
    why: 'Quy định mỗi mặt hàng tối đa {max} đơn vị tính để quầy, kho chọn không nhầm.',
    fix: 'Bỏ bớt đơn vị tính không dùng.',
  },
  'ITEM-BLOCK-018': {
    id: 'ITEM-BLOCK-018', entity: 'item', level: 'block', status: 'approved', okText: 'Một đơn vị bán chính, một đơn vị mua mặc định', field: 'units',
    title: 'Đơn vị tính: {detail}.',
    why: 'Phiếu bán / phiếu mua tự điền đơn vị theo đơn vị chính / mặc định; có hai thì không biết lấy đơn vị nào.',
    fix: 'Chỉ tích một đơn vị bán chính và một đơn vị mua mặc định.',
  },
  // [2026-11-19 Nguyễn Văn Thủy] điều kiện form thêm / sửa mặt hàng đang tự kiểm — cùng bộ mã để thống kê chung (đóng góp)
  'ITEM-BLOCK-010': {
    id: 'ITEM-BLOCK-010', entity: 'item', level: 'block', status: 'approved', okText: 'Nhóm hàng chọn tới cấp 3', field: 'groupCode',
    title: 'Nhóm hàng phải chọn tới cấp 3 (ngành → nhãn → nhóm).',
    why: 'Mã hàng tự sinh ghép mã ngành, nhãn, nhóm; chưa tới cấp 3 thì không sinh được mã và báo cáo theo nhóm không đúng.',
    fix: 'Chọn nhóm hàng ở cấp cuối (nhóm sản phẩm).',
  },
  'ITEM-BLOCK-019': {
    id: 'ITEM-BLOCK-019', entity: 'item', level: 'block', status: 'approved', okText: 'Có mã hàng', field: 'sku',
    title: 'Chưa có mã hàng.',
    why: 'Mã hàng là khoá của mặt hàng trên mọi chứng từ, sổ kho, máy bán.',
    fix: 'Chọn nhóm hàng là mã tự sinh, hoặc gõ mã.',
  },
  'ITEM-BLOCK-020': {
    id: 'ITEM-BLOCK-020', entity: 'item', level: 'block', status: 'approved', okText: 'Mã hàng chỉ gồm chữ số, chữ cái', field: 'sku',
    title: 'Mã hàng chỉ gồm chữ số và chữ cái, không dấu cách.',
    why: 'Mã có dấu cách / ký tự lạ làm máy quét, nhập Excel, máy bán không tìm đúng hàng.',
    fix: 'Bỏ dấu cách và ký tự đặc biệt khỏi mã.',
  },
  'ITEM-BLOCK-021': {
    id: 'ITEM-BLOCK-021', entity: 'item', level: 'block', status: 'approved', okText: 'Đã chọn loại mã (mã mới / mã biến thể)', field: 'kind',
    title: 'Chưa chọn tạo Mã mới hay Mã biến thể.',
    why: 'Mã mới sinh theo nhóm hàng; mã biến thể đi theo mã cha (nhóm, đơn vị tính theo mã cha) — hai cách khai khác nhau.',
    fix: 'Bấm "Mã mới" hoặc "Mã biến thể" ở bước đầu.',
  },
  'ITEM-BLOCK-022': {
    id: 'ITEM-BLOCK-022', entity: 'item', level: 'block', status: 'approved', okText: 'Mọi dòng giá mua có nhà cung cấp', field: 'nccRows',
    title: 'Còn dòng giá mua chưa chọn nhà cung cấp.',
    why: 'Giá mua khai theo từng nhà cung cấp; dòng không có NCC thì đơn đặt không biết lấy giá của ai.',
    fix: 'Chọn nhà cung cấp cho dòng đó, hoặc bỏ dòng.',
  },
  'ITEM-BLOCK-023': {
    id: 'ITEM-BLOCK-023', entity: 'item', level: 'block', status: 'approved', okText: 'Có giá bán ĐVT chính ở bảng giá công ty', field: 'prices',
    title: 'Chưa nhập giá bán {unit} (ĐVT bán chính) ở {list}.',
    why: 'Máy bán và phiếu bán lấy giá theo bảng giá công ty; chưa có giá thì quầy không bán được (trừ hàng tích "Không bán").',
    fix: 'Nhập giá ở thẻ Bán hàng & giá, hoặc tích "Không bán" nếu hàng không bán.',
  },
  'ITEM-HINT-004': {
    id: 'ITEM-HINT-004', entity: 'item', level: 'warn', status: 'approved', okText: 'Đã chọn thuế suất GTGT', field: 'taxOutCode',
    title: 'Mặt hàng {sku} chưa chọn thuế suất GTGT.',
    why: 'Hoá đơn bán ra và phiếu nhập lấy thuế suất theo mặt hàng; chưa chọn thì phiếu tính thuế 0% và kê khai thuế sai.',
    fix: 'Chọn thuế suất ở ô Thuế suất GTGT; hàng không chịu thuế thì chọn KCT, hoặc ghi lý do khi lưu.',
  },
  'ITEM-HINT-005': {
    id: 'ITEM-HINT-005', entity: 'item', level: 'info', status: 'approved', okText: 'Có mã vạch', field: 'barcode',
    title: 'Mặt hàng {sku} chưa có mã vạch.',
    why: 'Quầy bán quét mã vạch để chọn hàng; chưa có thì thu ngân phải gõ tìm tay.',
  },
  // ── Đối tượng (DM03) ───────────────────────────────────────────────────────────────────────────────
  'PART-HINT-001': {
    id: 'PART-HINT-001', entity: 'partner', level: 'info', status: 'draft',
    title: 'Nhà cung cấp: hoá đơn đầu vào cần mã số thuế người bán.',
    why: 'Hoá đơn đầu vào kê khai khấu trừ thuế GTGT phải có MST người bán khớp hoá đơn điện tử; thiếu MST thì hoá đơn bị kiểm cảnh báo khi nhập.',
  },
  'PART-HINT-002': {
    id: 'PART-HINT-002', entity: 'partner', level: 'warn', status: 'draft',
    title: 'Nhà cung cấp {code} chưa có mã số thuế.',
    why: 'Lưu được với nhà cung cấp cá nhân / hộ kinh doanh không có MST, nhưng mọi hoá đơn đầu vào của đối tượng này sẽ bị cảnh báo khi kê khai và không đối chiếu được với hoá đơn điện tử của cơ quan thuế.',
    fix: 'Nhập mã số thuế (nút tra MST điền sẵn tên, địa chỉ); hộ kinh doanh / cá nhân không có MST thì ghi lý do khi lưu.',
  },
  'PART-HINT-003': {
    id: 'PART-HINT-003', entity: 'partner', level: 'warn', status: 'draft', rule: 'R-MD-3',
    title: 'Đã có đối tượng {other} cùng tên "{name}".',
    why: 'Hai mã cho cùng một khách / nhà cung cấp làm công nợ tách đôi: hoá đơn ghi một mã, phiếu thu ghi mã kia, đối chiếu không khớp. Nếu là một, dùng mã {other}; nếu khác người, phân biệt bằng tên viết tắt hoặc địa chỉ.',
    fix: 'Mở đối tượng đã có và dùng mã đó; nếu là người khác, phân biệt bằng tên viết tắt hoặc địa chỉ rồi ghi lý do khi lưu.',
  },
  'PART-HINT-004': {
    id: 'PART-HINT-004', entity: 'partner', level: 'warn', status: 'draft',
    title: 'Mã số thuế "{taxCode}" không đúng định dạng (10 số, hoặc 10 số - 3 số chi nhánh).',
    why: 'MST sai định dạng không tra được với cơ quan thuế; hoá đơn điện tử mang MST đúng sẽ không khớp với đối tượng này.',
    fix: 'Sửa MST: 10 số, hoặc 10 số - 3 số cho đơn vị phụ thuộc, hoặc 12 số (cá nhân).',
  },
  // [2026-11-19 11:52 AM khanhtd] NT-DM-011 — đổi MST theo ngày hiệu lực đã qua mà còn hoá đơn mang MST cũ
  'PART-HINT-005': {
    id: 'PART-HINT-005', entity: 'partner', level: 'warn', status: 'draft',
    title: 'Có {count} hoá đơn của {code} từ ngày {from} vẫn mang MST cũ {old}.',
    why: 'MST mới có hiệu lực từ ngày đã chọn, nhưng các hoá đơn này lập từ ngày đó vẫn ghi MST cũ. Hoá đơn đã nhận không bị sửa; chúng sẽ hiện ở Bàn làm việc kế toán (HT08, PARTNER_TAX_MISMATCH) để rà với đối tác.',
    fix: 'Kiểm lại ngày hiệu lực với đối tác. Nếu đúng: ghi lý do khi lưu, rồi yêu cầu đối tác lập hoá đơn điều chỉnh / thay thế cho hoá đơn lập sai MST (NĐ 123/2020).',
  },
};

/** Mọi quy tắc: chung (trên) + mỗi danh mục một tệp ở src/quy-tac/ (docs/nghiep-vu/25). */
export const CATALOG_HINTS: Record<string, CatalogHintDef> = { ...BASE_HINTS, ...QT_DOI_TUONG, ...QT_TO_CHUC_NGAN_HANG, ...QT_NHOM_HANG };

/** Phát hiện từ một luật, thay biến {x} trong title / why / learn. */
export function catalogFinding(code: string, vars: Record<string, string | number> = {}, extra: Partial<CatalogFinding> = {}): CatalogFinding {
  const def = CATALOG_HINTS[code];
  if (!def) throw new Error(`Luật nhắc ${code} chưa khai trong CATALOG_HINTS`);
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  return {
    code, level: def.level, title: fill(def.title), why: fill(def.why),
    ...(def.fix ? { howTo: fill(def.fix) } : {}), ...(def.rule ? { rule: def.rule } : {}), ...(def.learn ? { learn: fill(def.learn) } : {}),
    basis: basisOf(code).map((b) => b.title), ...(Object.keys(vars).length ? { vars } : {}), ...extra,
  };
}

/** Mã các cảnh báo mềm trong danh sách phát hiện (cần ghi lý do khi lưu). */
export function warnCodes(findings: readonly CatalogFinding[]): string[] {
  return findings.filter((f) => f.level === 'warn').map((f) => f.code);
}

// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09
/** Giá trị minh hoạ cho từng luật — màn duyệt hiện luật đúng như người dùng sẽ thấy trong form. */
export const CATALOG_HINT_EXAMPLES: Record<string, Record<string, string>> = {
  'ACC-HINT-001': { parent: '131', inherited: 'lưỡng tính, theo dõi đối tượng' },
  'ACC-HINT-003': { code: '13198', root: '131' },
  'ACC-HINT-004': { side: 'Có', root: '156', expected: 'Nợ' },
  'ACC-HINT-005': { code: '33110', root: '331' },
  'ACC-HINT-006': { code: '1388', balance: '12.500.000' },
  'ACC-HINT-007': { code: '990' },
  'ACC-BLOCK-001': { parent: '131' },
  'ITEM-BLOCK-001': { sku: 'SUA01' },
  'ITEM-BLOCK-002': { sku: 'SUA01' },
  'ITEM-BLOCK-004': { max: '50', len: '62' },
  'ITEM-BLOCK-005': { name: 'Sữa tươi TH 110ml', other: '100021001' },
  'ITEM-BLOCK-006': { sku: '100021001' },
  'ITEM-BLOCK-007': { sku: '100021001A' },
  'ITEM-BLOCK-008': { sku: '100021001AB', detail: 'chưa có mã cha 100021001' },
  'ITEM-BLOCK-009': { label: 'Nhóm hàng', code: '1001' },
  'ITEM-BLOCK-011': { detail: 'bảng giá BG02 chưa có' },
  'ITEM-BLOCK-013': { sku: 'SUA01' },
  'ITEM-BLOCK-014': { detail: 'chưa có đơn vị tỉ lệ 1 (đơn vị nhỏ nhất)' },
  'ITEM-BLOCK-015': { detail: 'đơn vị "Hộp" bị trùng' },
  'ITEM-BLOCK-016': { unit: 'Thùng' },
  'ITEM-BLOCK-017': { max: '10', count: '12' },
  'ITEM-BLOCK-018': { detail: 'có 2 đơn vị bán chính' },
  'ITEM-BLOCK-023': { unit: 'Hộp', list: 'Bảng giá công ty' },
  'ITEM-HINT-004': { sku: 'SUA01' },
  'ITEM-HINT-005': { sku: 'SUA01' },
  'PART-BLOCK-001': { codes: 'NHOM-X' }, 'PART-BLOCK-002': { taxCode: '0101234567', kind: 'nhà cung cấp', other: 'NCC001', name: 'Công ty An Bình' },
  'PART-BLOCK-003': { code: 'NCC001', name: 'Công ty An Bình', kind: 'nhà cung cấp' }, 'PART-BLOCK-004': { code: 'NCC001' }, 'PART-BLOCK-005': { code: 'NCC001', refs: 'hợp đồng 01/2026' },
  'PART-BLOCK-006': { code: 'NHOM1', used: 'NCC001' }, 'PART-BLOCK-007': { detail: 'nhóm NHOM2 đang là nhóm con của NHOM1' }, 'PART-BLOCK-008': { detail: 'đơn vị cha NCC009 chưa có trong danh mục' },
  'UNIT-BLOCK-001': { name: 'Hộp' }, 'UNIT-BLOCK-002': { name: 'Hộp', count: '12', action: 'xoá' },
  'BANK-BLOCK-001': { detail: 'tài khoản 112 là tài khoản tổng hợp; chọn tài khoản 112 chi tiết' }, 'BANK-BLOCK-002': { branch: 'CN09' }, 'BANK-BLOCK-003': { code: 'VCB01', method: 'CK' },
  'GRP-BLOCK-001': { detail: 'Nhãn hàng TH chưa có trong danh mục' }, 'GRP-BLOCK-002': { codes: 'HH2' }, 'GRP-BLOCK-003': { detail: 'V10 không phải loại thuế đầu ra' },
  'GRP-BLOCK-004': { detail: 'nhãn TH đang gắn cho mặt hàng 130181002' }, 'GRP-BLOCK-005': { detail: 'nhóm đã tạo không chuyển sang nhóm khác' }, 'GRP-BLOCK-006': { detail: 'mã 13 đã dùng cho nhóm "Sữa nước" cùng cấp' },
  'GRP-BLOCK-007': { sku: '130181002' }, 'GRP-BLOCK-008': { detail: 'cấp 2 phải đúng 3 ký tự (đang 2)' },
  'BR-BLOCK-001': { code: 'BH' }, 'BR-BLOCK-002': { code: 'CN01', detail: 'đã có chứng từ' }, 'BR-BLOCK-003': { code: 'CN01' }, 'BR-BLOCK-004': { code: 'MB', detail: 'đã ngừng dùng' },
  'ITEM-HINT-001': { sku: 'SUA01', group: 'HH' },
  'ITEM-HINT-002': { docNo: 'HD0001', count: '2', items: 'SUA02 (thiếu đơn vị tính; ghi theo nhóm mặc định HH) · QUA05 (ghi theo nhóm mặc định HH)' },
  'PART-HINT-002': { code: 'NCC-AN' },
  'PART-HINT-003': { other: 'KH001', name: 'Công ty TNHH An Bình' },
  'PART-HINT-004': { taxCode: '01234' },
  'PART-HINT-005': { count: '3', code: 'NCC-AN', from: '01/10/2026', old: '0101234567' },
};

/** Biến {x} một luật dùng (title / why / fix / learn) — câu chữ đơn vị sửa lại chỉ được dùng các biến này. */
export function hintVars(code: string): string[] {
  const d = CATALOG_HINTS[code];
  if (!d) return [];
  return [...new Set([d.title, d.why, d.fix ?? '', d.learn ?? ''].flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)))];
}

/**
 * Dấu của một luật (mức + câu chữ mặc định) — bản duyệt của đơn vị gắn dấu này; luật đổi ở bản phát hành sau → dấu khác → bản duyệt
 * hết hiệu lực, luật về "chưa duyệt" (S023-17). Băm chuỗi đơn giản (chạy cả trên trình duyệt), không dùng cho bảo mật.
 */
export function hintHash(code: string): string {
  const d = CATALOG_HINTS[code];
  if (!d) return '';
  const text = JSON.stringify([d.level, d.title, d.why, d.fix ?? '']);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `h1:${(h >>> 0).toString(16)}`;
}

/** Bản duyệt của đơn vị cho một luật (catalog_rule_reviews). Có bản duyệt = đã duyệt (bỏ nhãn nháp). */
export interface CatalogRuleReview {
  code: string;
  title?: string | null;
  why?: string | null;
  fix?: string | null;
  lowered?: boolean;
}

/**
 * Áp bản duyệt của đơn vị lên một phát hiện: câu chữ sửa lại (thay lại biến), hạ warn → info (D023-8), bỏ nhãn nháp.
 * Mức chặn không bao giờ hạ; mức khác warn không đổi.
 */
export function applyRuleReview(f: CatalogFinding, r: CatalogRuleReview | undefined): CatalogFinding {
  if (!r) return f;
  const vars = f.vars ?? {};
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  const { draft: _d, ...rest } = f;
  const lower = Boolean(r.lowered) && f.level === 'warn';
  return {
    ...rest,
    ...(r.title ? { title: fill(r.title) } : {}),
    ...(r.why ? { why: fill(r.why) } : {}),
    ...(r.fix ? { howTo: fill(r.fix) } : {}),
    ...(lower ? { level: 'info' as const, lowered: true } : {}),
  };
}
