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
import { SCREENS, type Remedy, type RemedyStep } from './remedy.js';

export type IntakeLayer ='L1' | 'L2' | 'L3' | 'L4' | 'L5';
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

// [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-26 (R-FIX-1, bizcity_remedy@1 §3): phương án khắc phục có cấu trúc cho mọi mã IN-* mức block / warn; phát hiện mang remedy; SC-FIX-1 kiểm
/** Mã bắt buộc có phương án khắc phục: mọi mã `block` / `warn` (R-FIX-1). Mã `hint` khai thì tốt, không bắt buộc. */
type IntakeCodeNeedingRemedy = { [K in IntakeCode]: (typeof INTAKE_CATALOG)[K]['severity'] extends 'hint' ? never : K }[IntakeCode];

const RESEND: RemedyStep = { text: 'Gửi lại chứng từ từ hệ thống nguồn, rồi xem kết quả tiền kiểm', role: 'creator' };

/**
 * PHƯƠNG ÁN KHẮC PHỤC theo mã (bizcity_remedy@1). Tách khỏi INTAKE_CATALOG vì danh mục giữ khuôn một dòng / mã (SC-INTAKE-1).
 * Đầu vào sai sửa ở NGUỒN (R-INTAKE-8): bước đầu là việc của người lập / hệ thống gửi; kế toán chỉ vào cuộc khi thiếu danh mục
 * hoặc khi cảnh báo được chấp nhận có lý do. Kiểm lại = gửi lại và tiền kiểm không còn mã đó. Mỗi khoá một đoạn — SC-FIX-1 đọc.
 */
export const INTAKE_REMEDIES: Record<IntakeCodeNeedingRemedy, Remedy> & Partial<Record<IntakeCode, Remedy>> = {
  'IN-SHAPE-001': {
    steps: [{ text: 'Điền trường còn thiếu (xem "trường" trong phát hiện) ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SHAPE-001' },
  },
  'IN-SHAPE-002': {
    steps: [{ text: 'Sửa trường sai kiểu ở hệ thống nguồn: số không kèm dấu phân cách hàng nghìn hay đơn vị tiền, mã là chuỗi' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SHAPE-002' },
  },
  'IN-SHAPE-003': {
    steps: [{ text: 'Đổi ngày sang dạng năm-tháng-ngày (vd 2026-10-05) ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SHAPE-003' },
    forbid: ['Không đổi ngày chứng từ sang ngày khác cho lọt cửa nạp — ngày quyết định kỳ kế toán'],
  },
  'IN-SHAPE-004': {
    steps: [{ text: 'Chọn một loại chứng từ có sẵn trong khuôn nạp (sale, purchase, customer_payment…) ở hệ thống nguồn' }, { text: 'Cần loại mới thì gửi đề xuất cho Nhóm Lõi, chưa gửi chứng từ' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SHAPE-004' },
    forbid: ['Không mượn loại chứng từ khác nghĩa — luật định khoản đi theo loại'],
  },
  'IN-SHAPE-005': {
    steps: [{ text: 'Rút gọn trường quá dài, hoặc tách chứng từ có quá nhiều dòng ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SHAPE-005' },
  },
  'IN-SHAPE-006': {
    steps: [{ text: 'Chọn một giá trị trong danh sách "mong đợi" của phát hiện ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SHAPE-006' },
  },
  'IN-SUM-001': {
    steps: [{ text: 'Tính lại tổng chứng từ bằng cộng các dòng tới đồng ở hệ thống nguồn; kiểm cách làm tròn từng dòng' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SUM-001' },
    forbid: ['Không sửa riêng tổng cho khớp mà không kiểm lại dòng — hoá đơn và sổ phải cùng số'],
  },
  'IN-SUM-002': {
    steps: [{ text: 'Giảm số phân bổ cho các hoá đơn, hoặc kiểm lại số tiền phiếu thu / chi ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SUM-002' },
  },
  'IN-SUM-005': {
    steps: [{ text: 'Tính lại tổng thanh toán = tiền trước thuế + thuế ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SUM-005' },
  },
  'IN-SUM-006': {
    steps: [{ text: 'Tính lại tổng thuế bằng cộng thuế từng dòng tới đồng ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-SUM-006' },
  },
  'IN-SUM-003': {
    steps: [
      { text: 'Kiểm mã thuế suất của dòng và cách làm tròn thuế (theo dòng hay theo hoá đơn) ở hệ thống nguồn' },
      { text: 'Lệch do làm tròn theo hoá đơn đúng quy định thì kế toán trưởng chấp nhận cảnh báo, ghi lý do', role: 'chief_accountant' },
      RESEND,
    ],
    owner: 'creator', verify: { code: 'IN-SUM-003' },
  },
  'IN-SUM-004': {
    steps: [
      { text: 'Kiểm đơn giá, số lượng, chiết khấu của dòng ở hệ thống nguồn' },
      { text: 'Lệch có lý do (giá đặc biệt, khuyến mại tính riêng) thì kế toán trưởng chấp nhận cảnh báo, ghi lý do', role: 'chief_accountant' },
      RESEND,
    ],
    owner: 'creator', verify: { code: 'IN-SUM-004' },
  },
  'IN-MD-001': {
    steps: [
      { text: 'Đổi mã chi nhánh ở hệ thống nguồn sang mã đã khai trong danh mục' },
      { text: 'Chi nhánh mới thật thì thêm vào danh mục chi nhánh trước', screen: SCREENS.DM02, role: 'accountant' },
      RESEND,
    ],
    owner: 'creator', verify: { code: 'IN-MD-001' },
    forbid: ['Không gán tạm sang chi nhánh khác cho lọt cửa nạp — sổ, kho, báo cáo sẽ sai chi nhánh'],
  },
  'IN-MD-004': {
    steps: [
      { text: 'Đồng bộ danh mục mặt hàng từ hệ thống nguồn trước khi gửi chứng từ (PUT /api/v1/products)' },
      { text: 'Gắn nhóm hạch toán cho mặt hàng mới', screen: SCREENS.DM10, role: 'accountant' },
    ],
    owner: 'creator', verify: { code: 'IN-MD-004' },
  },
  'IN-MD-005': {
    steps: [
      { text: 'Sửa mã số thuế ở hệ thống nguồn: 10 chữ số, hoặc 10 chữ số + "-" + 3 chữ số, không khoảng trắng' },
      { text: 'Sửa mã số thuế của đối tượng trong danh mục nếu đã lưu sai', screen: SCREENS.DM03, role: 'accountant' },
      RESEND,
    ],
    owner: 'creator', verify: { code: 'IN-MD-005' },
  },
  'IN-BIZ-003': {
    steps: [{ text: 'Đặt mã chứng từ (docKey) bắt đầu bằng mã của nguồn gửi, vd "pos-mini:CN01:HD0001"' }, RESEND],
    owner: 'creator', verify: { code: 'IN-BIZ-003' },
    forbid: ['Không dùng mã chứng từ của nguồn khác để sửa chứng từ của nơi đó'],
  },
  'IN-BIZ-004': {
    steps: [{ text: 'Gửi phiên bản lớn hơn phiên bản đã nhận; mỗi lần sửa chứng từ tăng version ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-BIZ-004' },
  },
  'IN-BIZ-005': {
    steps: [{ text: 'Tăng version của chứng từ đã sửa ở hệ thống nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-BIZ-005' },
    forbid: ['Không gửi lại nội dung đã sửa với cùng version — cửa nạp coi là không đổi, phần sửa không vào sổ'],
  },
  'IN-BIZ-006': {
    steps: [
      { text: 'Kiểm số và ký hiệu hoá đơn ở hệ thống nguồn' },
      { text: 'Đối chiếu với chứng từ đã có cùng số hoá đơn', screen: SCREENS.ACC93, role: 'accountant' },
      { text: 'Hoá đơn thay thế / điều chỉnh thì khai relation; trùng thật có lý do thì kế toán trưởng chấp nhận cảnh báo, ghi lý do', role: 'chief_accountant' },
    ],
    owner: 'creator', verify: { code: 'IN-BIZ-006' },
    forbid: ['Không đổi số hoá đơn cho khác đi khi không có hoá đơn thật mang số đó'],
  },
};

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
  // [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-26: phát hiện mang remedy lấy từ INTAKE_REMEDIES
  /** Phương án khắc phục (bizcity_remedy@1) — có ở mọi mã block / warn. */
  remedy?: Remedy;
}

export function intakeFinding(code: IntakeCode, path: string | null, extra: { got?: unknown; expected?: string } = {}): IntakeFinding {
  const s = INTAKE_CATALOG[code];
  const remedy = (INTAKE_REMEDIES as Partial<Record<IntakeCode, Remedy>>)[code];
  return { code, severity: s.severity, stage: s.stage, layer: s.layer, title: s.title, path, ...extra, why: s.why, fix: s.fix, ref: s.ref, ...(remedy ? { remedy } : {}) };
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
