// @bizcity-layer K kernel/periods
// [2026-11-10 09:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2 (S032-35): phép kiểm trỏ điều kiện khoá sổ closeRef (RULE-SELF-DIAGNOSTICS §2b, PHASE-032 · 70 §3a)
/**
 * SỔ ĐIỀU KIỆN KHOÁ SỔ (PC, R-DIAG-10) — 23 điều kiện ở PHASE-032 · 60 §2; nhịp và bước theo PHASE-032 · 70 §3a.
 * Kernel khai, app.ts đăng ký vào Platform (registerCloseConditions). Mỗi phép kiểm tự chẩn đoán trỏ một PC bằng closeRef;
 * kỳ kiểm, bước khoá, tên lấy từ đây, không lặp trên từng phép kiểm. PC chưa có phép kiểm nào nuôi thì ghi checkedElsewhere.
 * Mức khi khoá kỳ ở B2c-2 theo mặc định của Platform; danh sách chặn D032-11 có hiệu lực ở S032-30.
 */
import type { CloseCondition } from '@bizcity/platform/system/diagnostics';

export const CLOSE_CONDITIONS: CloseCondition[] = [
  { code: 'PC-001', title: 'Danh mục hợp lệ tại ngày', cadence: ['day'], stage: 'pre' },
  { code: 'PC-002', title: 'Chứng từ và sổ đúng trạng thái, không ghi trùng', cadence: ['day'], stage: 'pre' },
  { code: 'PC-003', title: 'Không còn chứng từ chờ của kỳ', cadence: ['day'], stage: 'pre' },
  { code: 'PC-004', title: 'Tồn kho không âm, kiểm kê đã xử lý', cadence: ['day'], stage: 'pre' },
  { code: 'PC-005', title: 'Giá vốn đã chốt, không cũ', cadence: ['week', 'period'], stage: 'pre' },
  { code: 'PC-006', title: 'Phân bổ giá vốn theo lớp nhập khớp lượng xuất', cadence: ['week', 'period'], stage: 'pre',
    checkedElsewhere: 'Chưa có phép kiểm; thêm ở PHASE-032 S032-12..16 (lớp giá, phân bổ FIFO).' },
  { code: 'PC-007', title: 'Lô và hạn dùng', cadence: ['day'], stage: 'pre',
    checkedElsewhere: 'Chưa có phép kiểm; lô và hạn hôm nay chỉ ở chứng từ mua hàng. Thêm ở PHASE-032 S032-8..10.' },
  { code: 'PC-008', title: 'Chuyển kho, hàng đang chuyển', cadence: ['day'], stage: 'pre' },
  { code: 'PC-009', title: 'Giá trị kho khớp sổ cái', cadence: ['week', 'period'], stage: 'pre' },
  { code: 'PC-010', title: 'Trả hàng hoàn đúng giá vốn gốc', cadence: ['day'], stage: 'pre',
    checkedElsewhere: 'Kiểm chứng từ (phiếu trả không tìm được đơn gốc), chưa là phép tự chẩn đoán. Thêm ở PHASE-032 S032-17.' },
  { code: 'PC-011', title: 'Thuế và hoá đơn', cadence: ['day', 'week'], stage: 'pre' },
  { code: 'PC-012', title: 'Tiền và ngân hàng', cadence: ['week'], stage: 'pre' },
  { code: 'PC-013', title: 'Công nợ khớp sổ cái', cadence: ['week'], stage: 'pre' },
  { code: 'PC-014', title: 'Chi phí cuối kỳ (khấu hao, phân bổ)', cadence: ['period'], stage: 'pre' },
  { code: 'PC-015', title: 'Kỳ và phạm vi khoá', cadence: ['period'], stage: 'lock',
    checkedElsewhere: 'Khoá theo kỳ × chi nhánh × loại chứng từ, trigger CSDL chặn ghi vào kỳ đã khoá (migration 0082). Khoá theo nhóm tính giá thêm ở PHASE-032 S032-28.' },
  { code: 'PC-016', title: 'Sổ cái toàn vẹn, không sửa ngoài ứng dụng', cadence: ['day'], stage: 'pre' },
  { code: 'PC-017', title: 'Đủ nguồn để kết chuyển', cadence: ['period'], stage: 'pre' },
  { code: 'PC-018', title: 'Kết chuyển không lỗi thời', cadence: ['day', 'period'], stage: 'post',
    checkedElsewhere: 'Hôm nay nằm trong phép kiểm việc cuối kỳ (PERIOD_CLOSE_OPEN: giá vốn tính sau kết chuyển). Tách mã riêng ở PHASE-032 S032-20.' },
  { code: 'PC-019', title: 'Tài khoản 911 hết số dư', cadence: ['period'], stage: 'post',
    checkedElsewhere: 'Kết chuyển tự huỷ cả lần chạy khi tài khoản 911 còn dư.' },
  { code: 'PC-020', title: 'Lợi nhuận và báo cáo khớp sổ', cadence: ['period'], stage: 'post' },
  { code: 'PC-021', title: 'Số liệu không đổi tới lúc khoá', cadence: ['period'], stage: 'lock',
    checkedElsewhere: 'Khoá kỳ chạy trong một giao dịch có tự chẩn đoán (R-DIAG-4). Dấu số liệu thêm ở PHASE-032 S032-29.' },
  { code: 'PC-022', title: 'Quyền khoá sổ', cadence: ['period'], stage: 'lock',
    checkedElsewhere: 'Quyền khoá kỳ (periods:lock), vai có phạm vi (PHASE-028).' },
  { code: 'PC-023', title: 'Số dư liền mạch giữa các kỳ', cadence: ['period'], stage: 'lock',
    checkedElsewhere: 'Nhật ký khoá kỳ ghi mỗi lần mở khoá kèm lý do. Kiểm đầu kỳ = cuối kỳ trước thêm ở PHASE-032 S032-29.' },
];
