// [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1 (2.17, ADR-0014): danh mục mã IN-* (bizcity_intake_findings@1) — lớp, mức, giai đoạn, trọng số, vì sao, sửa ở nguồn; điểm đầu vào
/**
 * DANH MỤC PHÁT HIỆN TIỀN KIỂM (bizcity_intake_findings@1, ADR-0014, RULE-INTAKE). NGUỒN DUY NHẤT của mã `IN-*`: bộ tiền kiểm
 * (Kernel modules/intake), giao diện Trạm kiểm tra, trang bài học `docs/huong-dan/loi-dau-vao/<mã>.md`, bảng người đọc
 * `docs/contracts/BIZCITY-INTAKE-FINDINGS-v1.md` — check SC-INTAKE-1 so ba nơi. Mỗi mã một dòng (bộ kiểm đọc bằng regex).
 *
 *   severity  block: không vào sổ được tới khi sửa · warn: vào được, kế toán trưởng có thể cho chấp nhận có lý do · hint: chỉ để học
 *   stage     door: cửa nạp TỪ CHỐI (không thành sự việc) · posting: thành sự việc nhưng chưa ghi sổ được (tầng B, ACC14)
 *             · advice: cửa nạp nhận bình thường, chỉ là hướng dẫn
 *   R-INTAKE-4: mã `block` + `door` ⇔ cửa nạp từ chối cùng dữ liệu (test cặp `intake-preflight.test.ts`). Mã chỉ có ở trạm
 *   (không có luật Kernel tương ứng) thì bắt buộc warn / hint + advice. Đổi nghĩa một mã = cấp mã mới (R-INTAKE-11).
 */

export type IntakeLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export type IntakeSeverity = 'block' | 'warn' | 'hint';
export type IntakeStage = 'door' | 'posting' | 'advice';

export interface IntakeCodeSpec {
  layer: IntakeLayer;
  severity: IntakeSeverity;
  stage: IntakeStage;
  /** Điểm trừ khi `warn` (0–100); `block` → điểm 0, `hint` → không trừ. */
  weight: number;
  /** Một dòng, tiếng Việt. */
  title: string;
  /** Vì sao kế toán cần — viết cho người mới (R-INTAKE-5). */
  why: string;
  /** Sửa ở hệ thống nguồn thế nào. */
  fix: string;
  /** Luật / hợp đồng / căn cứ. */
  ref: string;
  /** warn: kế toán trưởng cho phép chấp nhận có lý do được không. */
  acceptable: boolean;
}

// prettier-ignore
export const INTAKE_CATALOG = {
  'IN-SHAPE-001': { layer: 'L1', severity: 'block', stage: 'door', weight: 0, title: 'Thiếu trường bắt buộc', why: 'Thiếu trường thì phần mềm không biết ghi sổ vào đâu, ngày nào, bao nhiêu — chứng từ không thành sự việc kế toán được.', fix: 'Ở hệ thống nguồn: điền trường còn thiếu (xem "trường" trong thông báo) trước khi gửi.', ref: 'R-EVENT-7, bizcity_ledger_intake@1', acceptable: false },
  'IN-SHAPE-002': { layer: 'L1', severity: 'block', stage: 'door', weight: 0, title: 'Sai kiểu dữ liệu', why: 'Số tiền, số lượng phải là số; mã phải là chữ. Sai kiểu thì không cộng trừ, đối chiếu được.', fix: 'Gửi đúng kiểu: số không có dấu phân cách hàng nghìn, không kèm đơn vị tiền; mã là chuỗi.', ref: 'R-EVENT-7', acceptable: false },
  'IN-SHAPE-003': { layer: 'L1', severity: 'block', stage: 'door', weight: 0, title: 'Ngày không đúng định dạng YYYY-MM-DD', why: 'Ngày chứng từ quyết định kỳ kế toán; định dạng lạ dễ nhầm ngày / tháng, ghi sai kỳ.', fix: 'Gửi ngày dạng năm-tháng-ngày, vd 2026-10-05.', ref: 'R-EVENT-7', acceptable: false },
  'IN-SHAPE-004': { layer: 'L1', severity: 'block', stage: 'door', weight: 0, title: 'Loại chứng từ không có trong khuôn nạp', why: 'Loại chứng từ (docType) quyết định luật định khoản; loại lạ thì không có luật nào ghi sổ được.', fix: 'Dùng một loại có sẵn (sale, purchase, customer_payment…); cần loại mới thì đề xuất với Nhóm Lõi.', ref: 'bizcity_ledger_intake@1 §2', acceptable: false },
  'IN-SHAPE-005': { layer: 'L1', severity: 'block', stage: 'door', weight: 0, title: 'Quá độ dài / quá số lượng cho phép', why: 'Giới hạn độ dài giữ sổ, báo cáo, hoá đơn in ra đọc được và đúng khuôn của cơ quan thuế.', fix: 'Rút gọn trường (tên, diễn giải) hoặc tách chứng từ quá nhiều dòng.', ref: 'R-EVENT-7', acceptable: false },
  'IN-SHAPE-006': { layer: 'L1', severity: 'block', stage: 'door', weight: 0, title: 'Giá trị ngoài danh sách cho phép', why: 'Trường chỉ nhận một số giá trị (vd trạng thái hoá đơn); giá trị lạ thì không biết xử lý thế nào.', fix: 'Dùng đúng một giá trị trong danh sách nêu ở "mong đợi".', ref: 'R-EVENT-7', acceptable: false },
  'IN-SUM-001': { layer: 'L2', severity: 'block', stage: 'door', weight: 0, title: 'Tổng các dòng khác tổng chứng từ', why: 'Sổ ghi theo dòng, hoá đơn in theo tổng — lệch nhau thì sổ và hoá đơn không khớp, đối chiếu thuế sai.', fix: 'Ở hệ thống nguồn: tổng chứng từ phải bằng cộng các dòng tới đồng; kiểm cách làm tròn từng dòng.', ref: 'R-EVENT-5, assertTotals', acceptable: false },
  'IN-SUM-002': { layer: 'L2', severity: 'block', stage: 'door', weight: 0, title: 'Phân bổ thanh toán lớn hơn số tiền phiếu', why: 'Không thể trừ công nợ nhiều hơn số tiền thực thu / thực trả.', fix: 'Giảm số phân bổ cho các hoá đơn, hoặc kiểm lại số tiền phiếu.', ref: 'R-EVENT-5, assertTotals', acceptable: false },
  'IN-SUM-005': { layer: 'L2', severity: 'block', stage: 'door', weight: 0, title: 'Tổng thanh toán khác tiền trước thuế + thuế', why: 'Tổng tiền khách trả phải đúng bằng tiền hàng cộng thuế, nếu không doanh thu hoặc thuế phải nộp sẽ sai.', fix: 'Tính lại tổng = trước thuế + thuế ở hệ thống nguồn.', ref: 'R-EVENT-5, assertTotals', acceptable: false },
  'IN-SUM-006': { layer: 'L2', severity: 'block', stage: 'door', weight: 0, title: 'Tổng thuế khác cộng thuế các dòng', why: 'Thuế GTGT kê khai lấy theo dòng; tổng thuế lệch thì bảng kê bán ra / mua vào không khớp tờ khai.', fix: 'Tổng thuế phải bằng cộng thuế từng dòng tới đồng.', ref: 'R-EVENT-5, assertTotals', acceptable: false },
  'IN-SUM-003': { layer: 'L2', severity: 'warn', stage: 'advice', weight: 15, title: 'Thuế dòng khác tiền trước thuế × thuế suất', why: 'Thuế dòng lệch thuế suất thì có thể sai mã thuế hoặc tính tay; cơ quan thuế đối chiếu theo thuế suất.', fix: 'Kiểm mã thuế suất của dòng và cách làm tròn thuế (làm tròn theo dòng hay theo hoá đơn).', ref: 'R-POST, danh mục loại thuế', acceptable: true },
  'IN-SUM-004': { layer: 'L2', severity: 'warn', stage: 'advice', weight: 10, title: 'Đơn giá × số lượng − chiết khấu khác thành tiền dòng', why: 'Thành tiền lệch đơn giá thì giá vốn, lãi gộp, đối chiếu với đơn hàng sẽ khó giải thích.', fix: 'Kiểm đơn giá, số lượng, chiết khấu của dòng ở hệ thống nguồn.', ref: 'R-EVENT-5', acceptable: true },
  'IN-MD-001': { layer: 'L3', severity: 'block', stage: 'door', weight: 0, title: 'Chi nhánh (mã cửa hàng) chưa có', why: 'Sổ, kho, báo cáo theo chi nhánh; mã lạ thì không biết ghi cho cửa hàng nào.', fix: 'Dùng mã chi nhánh đã khai ở Danh mục chi nhánh, hoặc nhờ kế toán thêm chi nhánh trước.', ref: 'R-MD, findBranch', acceptable: false },
  'IN-MD-004': { layer: 'L3', severity: 'hint', stage: 'advice', weight: 0, title: 'Mã hàng chưa có trong danh mục', why: 'Mặt hàng mới chưa có nhóm hạch toán thì doanh thu, giá vốn theo mặc định — kế toán nên gắn nhóm sớm.', fix: 'Đồng bộ danh mục mặt hàng trước (PUT /api/v1/products) hoặc nhờ kế toán thêm và gắn nhóm hạch toán.', ref: 'R-MD', acceptable: true },
  'IN-MD-005': { layer: 'L3', severity: 'warn', stage: 'advice', weight: 10, title: 'Mã số thuế đối tượng sai định dạng', why: 'Mã số thuế sai thì hoá đơn, bảng kê và tra cứu doanh nghiệp đều sai; cơ quan thuế loại hoá đơn.', fix: 'Mã số thuế gồm 10 chữ số, hoặc 10 chữ số + "-" + 3 chữ số (chi nhánh); không khoảng trắng.', ref: 'R-MD', acceptable: true },
  'IN-BIZ-003': { layer: 'L4', severity: 'block', stage: 'door', weight: 0, title: 'Mã chứng từ không thuộc nguồn gửi', why: 'Mỗi nguồn (module, app) chỉ được nộp / sửa chứng từ của mình, để không ghi đè chứng từ của nơi khác.', fix: 'Mã chứng từ (docKey) phải bắt đầu bằng mã của nguồn, vd "pos-mini:CN01:HD0001".', ref: 'ADR-0011 D5, R-EVENT-13', acceptable: false },
  'IN-BIZ-004': { layer: 'L4', severity: 'block', stage: 'door', weight: 0, title: 'Phiên bản cũ hơn bản đã nhận', why: 'Sổ đang theo phiên bản mới hơn; nhận bản cũ sẽ ghi đè thông tin mới bằng thông tin cũ.', fix: 'Gửi phiên bản lớn hơn phiên bản đã nhận; sửa chứng từ thì tăng version.', ref: 'R-EVENT-4', acceptable: false },
  'IN-BIZ-005': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 20, title: 'Cùng phiên bản nhưng nội dung khác bản đã nhận', why: 'Cửa nạp coi cùng phiên bản là "không đổi" và bỏ qua — nội dung sửa sẽ KHÔNG vào sổ.', fix: 'Sửa chứng từ thì tăng version; gửi lại đúng nội dung cũ thì không sao.', ref: 'R-EVENT-4', acceptable: false },
  'IN-BIZ-006': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 20, title: 'Số hoá đơn đã có ở chứng từ khác', why: 'Một số hoá đơn chỉ thuộc một chứng từ; trùng thì có thể kê khai thuế hai lần.', fix: 'Kiểm số / ký hiệu hoá đơn; hoá đơn thay thế / điều chỉnh thì khai relation.', ref: 'Sổ hoá đơn, R-POST', acceptable: true },
  'IN-BIZ-007': { layer: 'L4', severity: 'hint', stage: 'advice', weight: 0, title: 'Ngày hoá đơn cách ngày chứng từ hơn 5 ngày', why: 'Hoá đơn lập xa ngày giao hàng / thu tiền có thể sai thời điểm lập hoá đơn theo quy định.', fix: 'Kiểm ngày hoá đơn và ngày chứng từ ở hệ thống nguồn.', ref: 'Sổ hoá đơn', acceptable: true },
} as const satisfies Record<string, IntakeCodeSpec>;

export type IntakeCode = keyof typeof INTAKE_CATALOG;

export interface IntakeFinding {
  code: IntakeCode;
  severity: IntakeSeverity;
  stage: IntakeStage;
  layer: IntakeLayer;
  title: string;
  /** Đường dẫn trường, vd `lines[2].qty`; null = cả chứng từ. */
  path: string | null;
  got?: unknown;
  expected?: string;
  why: string;
  fix: string;
  ref: string;
}

export function intakeFinding(code: IntakeCode, path: string | null, extra: { got?: unknown; expected?: string } = {}): IntakeFinding {
  const s = INTAKE_CATALOG[code];
  return { code, severity: s.severity, stage: s.stage, layer: s.layer, title: s.title, path, ...extra, why: s.why, fix: s.fix, ref: s.ref };
}

const SEVERITY_ORDER: Record<IntakeSeverity, number> = { block: 0, warn: 1, hint: 2 };

/** Sắp: block → warn → hint, rồi theo lớp L1 → L5. */
export function sortFindings(f: IntakeFinding[]): IntakeFinding[] {
  return [...f].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.layer.localeCompare(b.layer));
}

/** Điểm 0–100 (R-INTAKE-10): có block → 0; không thì 100 − Σ trọng số warn chưa chấp nhận; hint không trừ. */
export function intakeScore(findings: IntakeFinding[], accepted: readonly string[] = []): number {
  if (findings.some((f) => f.severity === 'block')) return 0;
  const minus = findings.filter((f) => f.severity === 'warn' && !accepted.includes(f.code)).reduce((s, f) => s + INTAKE_CATALOG[f.code].weight, 0);
  return Math.max(0, 100 - minus);
}
