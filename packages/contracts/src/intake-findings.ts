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
import { SCREENS, STOP_THE_LINE_STEP, type Remedy, type RemedyStep } from './remedy.js';

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
  // [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — D024-3: IN-ITEM-001 — mã hàng lạ khi đơn vị đã tắt tự thêm mặt hàng (bizcity.item.auto_create = off): mặt hàng nháp + bể chờ
  'IN-ITEM-001': { layer: 'L3', severity: 'block', stage: 'door', weight: 0, title: 'Mã hàng chưa có trong danh mục (đơn vị đã tắt tự thêm mặt hàng)', why: 'Đơn vị đã tắt tự thêm mặt hàng từ chứng từ: mặt hàng mới phải được kế toán xem (đơn vị tính, nhóm hạch toán) trước khi vào sổ, để kho và giá vốn không ghi theo mặc định sai. Phần mềm đã tạo sẵn một mặt hàng NHÁP từ dòng chứng từ.', fix: 'Mở mặt hàng nháp vừa tạo ở danh mục (lọc "Nháp"), kiểm đơn vị tính và nhóm hạch toán rồi lưu để kích hoạt; hoặc đồng bộ danh mục từ hệ thống nguồn trước khi gửi chứng từ.', ref: 'D024-3, R-ITEM-6, ADR-0019', acceptable: false },
  // [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28: IN-ITEM-009 — chứng từ dùng mặt hàng còn nháp (Gate A chưa kích hoạt, R-GATE-6)
  'IN-ITEM-009': { layer: 'L3', severity: 'block', stage: 'door', weight: 0, title: 'Mặt hàng còn nháp, chưa kích hoạt', why: 'Mặt hàng lưu nháp vì khai báo còn thiếu (đơn vị tính, nhóm hạch toán); ghi sổ với nó thì kho, giá vốn hoặc tài khoản sẽ sai.', fix: 'Mở mặt hàng ở danh mục, sửa phần còn thiếu để mặt hàng tự kích hoạt; chứng từ ở Trạm kiểm tra được kiểm lại tự động, rồi nộp lại.', ref: 'R-GATE-6, ADR-0019', acceptable: false },
  'IN-MD-005': { layer: 'L3', severity: 'warn', stage: 'advice', weight: 10, title: 'Mã số thuế đối tượng sai định dạng', why: 'Mã số thuế sai thì hoá đơn, bảng kê và tra cứu doanh nghiệp đều sai; cơ quan thuế loại hoá đơn.', fix: 'Mã số thuế gồm 10 chữ số, hoặc 10 chữ số + "-" + 3 chữ số (chi nhánh); không khoảng trắng.', ref: 'R-MD', acceptable: true },
  // [2026-11-03 09:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-29: IN-GUARD-001 — Commit Guard: cấu hình đổi giữa tiền kiểm và ghi sổ, chạy lại vẫn còn lỗi chặn (R-GATE-8)
  // [2026-11-07 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a (S031-8/10, bizcity_intake_findings@1 0.9.0-draft): tham chiếu chính sách nghiệp vụ (ADR-0031) — L4, cảnh báo, cửa nạp vẫn nhận
  'IN-POL-001': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 10, title: 'Tham chiếu chính sách không có trong sổ đăng ký hoặc băm khác bản đã phát hành', why: 'Chứng từ nói đã áp một chính sách, nhưng sổ đăng ký không có bản đó hoặc nội dung bản đã khác lúc nguồn tải. Không truy vết được chứng từ về đúng chính sách căn cứ.', fix: 'Ở nguồn: tải lại chính sách đã phát hành, tính lại theo bản đó rồi gửi lại đúng mã, bản và băm; chính sách tự lập ở nguồn thì đưa về module chủ để phát hành.', ref: 'ADR-0031 D-POL-5, D-POL-6', acceptable: true },
  'IN-POL-002': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 10, title: 'Bản chính sách không hiệu lực tại ngày chứng từ', why: 'Chính sách chọn theo ngày chứng từ. Bản được nêu chưa áp hoặc đã hết áp vào ngày đó, nên chứng từ đang dùng luật không đúng thời điểm.', fix: 'Ở nguồn: dùng bản hiệu lực tại ngày chứng từ; nếu ngày chứng từ sai thì sửa ngày rồi gửi bản mới (tăng version).', ref: 'ADR-0031 D-POL-0, R-ECP', acceptable: true },
  // [2026-11-09 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2b (S031-29, bizcity_intake_findings@1 0.10.0-draft): IN-POL-004
  'IN-POL-004': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 10, title: 'Quà tính lại theo chính sách khác quà nguồn gửi', why: 'Tính lại theo đúng bản chính sách nguồn nêu, trên các dòng bán, ra số quà khác dòng quà nguồn gửi (thiếu quà, thừa quà hoặc lệch số lượng). Số liệu khuyến mại của chứng từ có thể không đúng chính sách đã phát hành.', fix: 'Ở nguồn: tính lại bằng đúng bản chính sách đã nêu (tải về hoặc gọi POST /api/v1/policies/evaluate) rồi gửi lại dòng quà theo kết quả; chứng từ đã bán đúng thực tế mà chính sách chưa phản ánh thì kế toán trưởng chấp nhận cảnh báo kèm lý do.', ref: 'ADR-0031 D-POL-8', acceptable: true },
  'IN-POL-003': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 5, title: 'Đã có bản chính sách mới hơn hiệu lực tại ngày chứng từ', why: 'Nguồn (thường là máy bán hàng làm việc ngoại tuyến) đang dùng bản cũ trong khi sổ đăng ký đã có bản mới phủ ngày chứng từ. Số liệu có thể lệch so với chính sách hiện hành.', fix: 'Ở nguồn: làm mới chính sách đã phát hành rồi tính lại; chứng từ đã lập đúng bản nguồn có thì kế toán trưởng chấp nhận cảnh báo kèm lý do.', ref: 'ADR-0031 D-POL-9', acceptable: true },
  'IN-GUARD-001': { layer: 'L5', severity: 'block', stage: 'door', weight: 0, title: 'Cấu hình vừa đổi sau lần Kiểm thử, chạy lại còn lỗi chặn', why: 'Nguồn đã Kiểm thử chứng từ với danh mục / chính sách / khoá kỳ cũ; trước khi ghi sổ cấu hình đổi và chứng từ không còn đạt. Ghi theo kết quả Kiểm thử cũ thì sổ sẽ sai với cấu hình hiện hành.', fix: 'Xem các lỗi chặn đi kèm (là kết quả chạy lại theo cấu hình mới), sửa rồi Kiểm thử lại để lấy dấu mới trước khi nộp.', ref: 'R-GATE-8, ADR-0019', acceptable: false },
  // [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5 (S021-22): L5 định khoản thử (IN-POST-*) và kỳ khoá (IN-BIZ-001), stage posting — thành sự việc rồi mới biết chưa ghi sổ được
  'IN-BIZ-001': { layer: 'L4', severity: 'block', stage: 'posting', weight: 0, title: 'Kỳ kế toán của ngày chứng từ đã khoá', why: 'Kỳ đã khoá thì sổ của kỳ đó đã chốt, báo cáo và tờ khai đã lập; thêm hay sửa chứng từ vào kỳ đó làm số báo cáo đổi theo.', fix: 'Kế toán trưởng mở khoá kỳ nếu được phép; không thì lập chứng từ vào kỳ đang mở theo quy định của đơn vị.', ref: 'Period Lock Gate, R-LEDGER', acceptable: false },
  'IN-POST-001': { layer: 'L5', severity: 'block', stage: 'posting', weight: 0, title: 'Không chọn được lý do định khoản', why: 'Lý do định khoản quyết định ghi Nợ Có tài khoản nào. Thiếu lý do hoặc lý do chưa khai thì phần mềm không biết ghi vào đâu.', fix: 'Khai lý do còn thiếu trong Cấu hình hạch toán, hoặc đặt cờ mặc định cho loại chứng từ; nguồn gửi đúng mã lý do đã khai.', ref: 'R-POST, BIZCITY-POSTING-TEMPLATE-v1 §7', acceptable: false },
  'IN-POST-002': { layer: 'L5', severity: 'block', stage: 'posting', weight: 0, title: 'Không tra được tài khoản để định khoản', why: 'Mọi tài khoản đều tra từ cấu hình hạch toán, không viết cứng trong mã. Thiếu cấu hình thì không dựng được bút toán.', fix: 'Mở Tài khoản ngầm định và Lý do, khai mục còn thiếu như thông báo nêu, rồi Kiểm thử lại.', ref: 'AccountResolver, R-POST', acceptable: false },
  'IN-POST-003': { layer: 'L5', severity: 'block', stage: 'posting', weight: 0, title: 'Thiếu nhóm hạch toán mặt hàng', why: 'Nhóm hạch toán của mặt hàng quyết định tài khoản hàng hoá, doanh thu, giá vốn. Thiếu thì dòng hàng không có chỗ ghi.', fix: 'Gán nhóm hạch toán cho mặt hàng hoặc đặt nhóm mặc định ở Mặt hàng và Tài khoản.', ref: 'ADR-0017, AccountResolver', acceptable: false },
  'IN-POST-004': { layer: 'L5', severity: 'block', stage: 'posting', weight: 0, title: 'Bút toán dựng ra không cân hoặc không hợp lệ', why: 'Sổ cái chỉ nhận bút toán cân Nợ bằng Có. Bút toán dựng ra mà không cân là lỗi của luật định khoản, không phải của chứng từ.', fix: 'Không sửa chứng từ cho lọt. Dừng ghi sổ, báo nhóm Lõi kèm mã tra cứu của lần Kiểm thử.', ref: 'R-LEDGER, ledgerService.post', acceptable: false },
  'IN-POST-005': { layer: 'L5', severity: 'block', stage: 'posting', weight: 0, title: 'Định khoản thử không thành công vì lý do khác', why: 'Định khoản thử chạy đúng đường ghi sổ rồi hoàn tác. Lý do chưa có tên mã riêng, ví dụ chưa có luật cho loại chứng từ, hình thức thanh toán không dùng được, hết thời gian cho phép.', fix: 'Đọc thông báo kèm theo; sửa theo đó, hoặc báo kế toán trưởng nếu liên quan cấu hình. Lỗi lặp lại thì báo nhóm Lõi để thêm mã riêng.', ref: 'R-INTAKE-3, R-EVENT-11', acceptable: false },
  // [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-25: cảnh báo thuế / hoá đơn / hồ sơ kế toán lúc nhập, cùng luật với tự chẩn đoán (tax.findings.ts, S022-8)
  'IN-VAT-001': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 15, title: 'Thuế suất giảm dùng ngoài khoảng ngày được giảm', why: 'Thuế suất giảm chỉ áp cho hàng bán ra trong khoảng thời gian theo nghị quyết. Ngoài khoảng đó mà vẫn dùng thì thuế đầu ra kê khai thiếu.', fix: 'Đổi loại thuế của dòng về thuế suất đúng thời điểm; đã lập hoá đơn thì lập hoá đơn điều chỉnh theo quy định.', ref: 'NQ 204/2025/QH15, rulepack vat-vn', acceptable: true },
  'IN-INV-001': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 10, title: 'Hoá đơn mua vào thiếu ký hiệu, tên hoặc mã số thuế người bán', why: 'Bảng kê mua vào và tờ khai phải khớp dữ liệu cơ quan thuế. Hoá đơn thiếu ký hiệu hoặc mã số thuế người bán thì không đối chiếu được, thuế đầu vào có thể bị loại.', fix: 'Bổ sung ký hiệu hoá đơn, tên và mã số thuế người bán từ hoá đơn gốc.', ref: 'taxIssues (ACC78), INVOICE_FIELDS', acceptable: true },
  'IN-INV-002': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 10, title: 'Hoá đơn bán hàng lập sau ngày chứng từ bán', why: 'Hoá đơn hàng hoá phải lập vào thời điểm chuyển giao quyền sở hữu. Lập chậm hơn ngày giao có thể bị xử phạt.', fix: 'Lập hoá đơn ngay khi giao hàng; trường hợp đặc thù (dịch vụ, bán theo đợt) ghi căn cứ thời điểm riêng khi chấp nhận.', ref: 'Quy định về thời điểm lập hoá đơn', acceptable: true },
  'IN-CFG-001': { layer: 'L4', severity: 'warn', stage: 'advice', weight: 0, title: 'Đơn vị chưa khai hồ sơ kế toán áp cho ngày chứng từ', why: 'Hồ sơ kế toán (năm tài chính, chế độ kế toán, loại pháp nhân) quyết định bộ quy định để kiểm chuẩn. Chưa khai thì Kiểm chuẩn ra kết quả cần rà soát. Lỗi của cấu hình đơn vị nên không trừ điểm người lập.', fix: 'Kế toán trưởng khai hồ sơ kế toán có hiệu lực từ ngày thích hợp.', ref: 'ADR-0012, PROFILE_DECLARED', acceptable: false },
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
  // [2026-11-03 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28 / 29: phương án cho IN-ITEM-009 (mặt hàng nháp) và IN-GUARD-001 (Commit Guard) — R-FIX-1
  'IN-ITEM-001': {
    steps: [
      { text: 'Mở mặt hàng nháp vừa được tạo từ dòng chứng từ (Danh mục mặt hàng, lọc "Nháp"); kiểm đơn vị tính, nhóm hạch toán rồi lưu để kích hoạt', screen: SCREENS.DM10, role: 'accountant' },
      { text: 'Chứng từ ở Trạm kiểm tra được kiểm lại tự động khi mặt hàng kích hoạt; nộp lại hoặc để hệ thống nguồn gửi lại', role: 'creator' },
      { text: 'Về lâu dài: đồng bộ danh mục mặt hàng từ hệ thống nguồn (PUT /api/v1/products) trước khi gửi chứng từ có mã mới' },
    ],
    owner: 'accountant', verify: { code: 'IN-ITEM-001' },
    forbid: ['Không bật lại tự thêm mặt hàng chỉ để chứng từ lọt cửa nạp — mặt hàng thiếu đơn vị tính / nhóm hạch toán sẽ ghi sai kho và giá vốn'],
  },
  'IN-ITEM-009': {
    steps: [
      { text: 'Mở mặt hàng đang nháp ở danh mục (lọc "Nháp"), bổ sung phần còn thiếu theo khung Vì sao; lưu xong mặt hàng tự kích hoạt', screen: SCREENS.DM10, role: 'accountant' },
      { text: 'Chứng từ đang chờ ở Trạm kiểm tra được kiểm lại tự động; nộp lại hoặc để hệ thống nguồn gửi lại', role: 'creator' },
    ],
    owner: 'accountant', verify: { code: 'IN-ITEM-009' },
    forbid: ['Không đổi mã hàng trên chứng từ sang mặt hàng khác cho lọt cửa nạp — kho và giá vốn sẽ ghi sai mặt hàng'],
  },
  'IN-GUARD-001': {
    steps: [
      { text: 'Xem các lỗi chặn đi kèm (kết quả chạy lại theo cấu hình mới) và sửa theo phương án của từng mã' },
      { text: 'Kiểm thử lại để lấy dấu cấu hình mới (guard), rồi nộp lại kèm dấu mới', role: 'creator' },
    ],
    owner: 'creator', verify: { code: 'IN-GUARD-001' },
    forbid: ['Không bỏ dấu cấu hình để lọt cửa nạp mà chưa kiểm thử lại — kết quả kiểm thử cũ không còn đúng với cấu hình hiện hành'],
  },
  // [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5 (S021-22): phương án cho mã L5 và kỳ khoá — R-FIX-1
  'IN-BIZ-001': {
    steps: [
      { text: 'Kiểm ngày chứng từ có đúng không; sai thì sửa ở nguồn rồi gửi lại', role: 'creator' },
      { text: 'Đúng ngày và chứng từ phải vào kỳ đã khoá: kế toán trưởng quyết định mở khoá kỳ', screen: SCREENS.ACC2, role: 'chief_accountant' },
      { text: 'Kiểm thử lại; vào được thì nộp lại', role: 'creator' },
    ],
    owner: 'chief_accountant', verify: { code: 'IN-BIZ-001' },
    forbid: ['Không dời ngày chứng từ sang kỳ đang mở chỉ để lọt khoá kỳ — báo cáo của cả hai kỳ sẽ sai'],
  },
  'IN-POST-001': {
    steps: [
      { text: 'Mở Lý do – Tài khoản, khai lý do còn thiếu hoặc đặt cờ mặc định cho loại chứng từ', screen: SCREENS.ACC18, role: 'chief_accountant' },
      { text: 'Hoặc sửa mã lý do trên chứng từ cho đúng mã đã khai, rồi Kiểm thử lại', role: 'creator' },
    ],
    owner: 'chief_accountant', verify: { code: 'IN-POST-001' },
    forbid: ['Không đổi sang lý do khác chỉ để lọt: tài khoản ghi sổ sẽ khác ý nghiệp vụ'],
  },
  'IN-POST-002': {
    steps: [
      { text: 'Đọc các mục còn thiếu trong thông báo (tài khoản ngầm định, tài khoản ngân hàng, lý do)' },
      { text: 'Khai các mục đó ở Tài khoản ngầm định hoặc Lý do – Tài khoản', screen: SCREENS.ACC41, role: 'chief_accountant' },
      { text: 'Kiểm thử lại', role: 'creator' },
    ],
    owner: 'chief_accountant', verify: { code: 'IN-POST-002' },
    forbid: ['Không viết số tài khoản vào chứng từ để lách — số tài khoản chỉ đến từ cấu hình hạch toán'],
  },
  'IN-POST-003': {
    steps: [
      { text: 'Gán nhóm hạch toán cho mặt hàng hoặc đặt nhóm mặc định', screen: SCREENS.ACC17, role: 'chief_accountant' },
      { text: 'Kiểm thử lại', role: 'creator' },
    ],
    owner: 'chief_accountant', verify: { code: 'IN-POST-003' },
    forbid: ['Không suy nhóm hạch toán từ tiền tố mã hàng (ADR-0017)'],
  },
  'IN-POST-004': {
    steps: [
      { text: 'Giữ nguyên chứng từ và mục ở Trạm kiểm tra, không nộp lại nhiều lần' },
      STOP_THE_LINE_STEP,
    ],
    owner: 'chief_accountant', verify: { code: 'IN-POST-004' }, stopTheLine: true,
    forbid: ['Không sửa số liệu chứng từ cho bút toán cân — lỗi nằm ở luật định khoản', 'Không tắt kiểm cân của sổ'],
  },
  'IN-POST-005': {
    steps: [
      { text: 'Đọc thông báo kèm theo để biết lý do cụ thể' },
      { text: 'Lý do liên quan cấu hình thì nhờ kế toán trưởng xử lý ở Cấu hình hạch toán', screen: SCREENS.ACC18, role: 'chief_accountant' },
      { text: 'Lỗi lặp lại mà không rõ nguyên nhân thì báo nhóm Lõi kèm mã tra cứu', role: 'accountant' },
    ],
    owner: 'accountant', verify: { code: 'IN-POST-005' },
  },
  // [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-25: phương án cho cảnh báo thuế / hoá đơn / hồ sơ — R-FIX-1
  'IN-VAT-001': {
    steps: [
      { text: 'Đổi loại thuế của dòng về thuế suất đúng với ngày chứng từ ở hệ thống nguồn', role: 'creator' },
      { text: 'Kiểm loại thuế mặc định của mặt hàng nếu nhiều chứng từ cùng lỗi', screen: SCREENS.DM10, role: 'accountant' },
      { text: 'Đã lập hoá đơn với thuế suất sai: lập hoá đơn điều chỉnh theo quy định, kế toán trưởng quyết định', role: 'chief_accountant' },
      RESEND,
    ],
    owner: 'creator', verify: { code: 'IN-VAT-001' },
    forbid: ['Không đổi ngày chứng từ cho lọt khoảng giảm thuế — thuế và kỳ kê khai sẽ sai'],
  },
  'IN-INV-001': {
    steps: [
      { text: 'Bổ sung ký hiệu hoá đơn, tên và mã số thuế người bán từ hoá đơn gốc ở hệ thống nguồn', role: 'creator' },
      { text: 'Hoặc bổ sung ở Bổ sung thông tin thuế theo số chứng từ', screen: SCREENS.ACC78, role: 'accountant' },
      RESEND,
    ],
    owner: 'creator', verify: { code: 'IN-INV-001' },
    forbid: ['Không điền mã số thuế bất kỳ cho đủ trường — kê khai sẽ sai và có thể bị xử phạt'],
  },
  'IN-INV-002': {
    steps: [
      { text: 'Kiểm quy trình xuất hoá đơn ở hệ thống bán hàng: xuất ngay khi giao hàng' },
      { text: 'Đúng là chậm: ghi nhận để xử lý theo quy định; có căn cứ thời điểm khác (dịch vụ, bán theo đợt): kế toán trưởng chấp nhận cảnh báo kèm lý do', role: 'chief_accountant' },
    ],
    owner: 'chief_accountant', verify: { code: 'IN-INV-002' },
    forbid: ['Không sửa ngày hoá đơn về ngày giao khi hoá đơn đã lập và gửi khách'],
  },
  'IN-CFG-001': {
    steps: [
      { text: 'Mở Hồ sơ kế toán, chọn năm tài chính, chế độ kế toán, loại pháp nhân; ghi căn cứ', screen: SCREENS.HT07, role: 'chief_accountant' },
    ],
    owner: 'chief_accountant', verify: { code: 'IN-CFG-001' },
    forbid: ['Không khai hồ sơ cho có: chế độ sai thì Kiểm chuẩn chọn nhầm bộ quy định'],
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
  // [2026-11-07 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a (S031-8/10, bizcity_intake_findings@1 0.9.0-draft)
  'IN-POL-001': {
    steps: [{ text: 'Ở hệ thống nguồn: tải lại chính sách đã phát hành (mã, bản, băm) rồi tính lại theo đúng bản đó' }, { text: 'Chính sách tự lập ở nguồn: đưa về module chủ (Bán hàng, Mua hàng…) để phát hành, không dùng bản riêng', role: 'chief_accountant' }, RESEND],
    owner: 'creator', verify: { code: 'IN-POL-001' },
    forbid: ['Không sửa băm cho khớp mà không tải lại chính sách — băm là dấu của đúng bản đã phát hành'],
  },
  'IN-POL-002': {
    steps: [{ text: 'Dùng bản chính sách hiệu lực tại ngày chứng từ; nếu ngày chứng từ sai thì sửa ngày và tăng version ở nguồn' }, RESEND],
    owner: 'creator', verify: { code: 'IN-POL-002' },
    forbid: ['Không đổi ngày chứng từ chỉ để khớp một bản chính sách khác — ngày quyết định kỳ kế toán'],
  },
  'IN-POL-003': {
    steps: [{ text: 'Làm mới chính sách đã phát hành ở nguồn rồi tính lại theo bản mới' }, { text: 'Chứng từ lập đúng bản nguồn có tại thời điểm bán: kế toán trưởng chấp nhận cảnh báo, ghi lý do', role: 'chief_accountant' }],
    owner: 'creator', verify: { code: 'IN-POL-003' },
  },
  'IN-POL-004': {
    steps: [{ text: 'Tính lại theo đúng bản chính sách đã nêu (POST /api/v1/policies/evaluate hoặc luật đã tải) rồi gửi lại dòng quà theo kết quả' }, { text: 'Quà đã giao đúng thực tế mà chính sách chưa phản ánh: kế toán trưởng chấp nhận cảnh báo, ghi lý do', role: 'chief_accountant' }],
    owner: 'creator', verify: { code: 'IN-POL-004' },
    forbid: ['Không xoá dòng quà đã giao thật chỉ để khớp kết quả tính lại — quà đã giao phải có chứng từ'],
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
