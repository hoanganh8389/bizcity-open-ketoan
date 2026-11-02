// @bizcity-layer K kernel/periods
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: phương án khắc phục cho từng mục bảng kiểm trước khoá kỳ (GET /api/v1/periods/check), bizcity_remedy@1, R-FIX-1.
/**
 * Mỗi mục của bảng kiểm trước khoá kỳ có một phương án: bước, màn, vai, kiểm lại (= mở lại bảng kiểm ở màn kỳ kế toán).
 * Khoá trùng `key` của mục (period.routes.ts). Check SC-FIX-1 đối chiếu hai nơi.
 */
import { SCREENS, STOP_THE_LINE_STEP, type Remedy } from '@ketoan/contracts';

const verify = { screen: SCREENS.ACC2 };

export const PERIOD_CHECK_REMEDIES = {
  integrity: {
    steps: [STOP_THE_LINE_STEP, { text: 'Đọc từng mã lỗi trong chi tiết: mỗi mã tự chẩn đoán có phương án riêng', screen: SCREENS.ACC93 }, { text: 'Chỉ khoá khi đã sửa, hoặc ghi lý do chấp nhận ≥ 10 ký tự (lưu kèm lượt chẩn đoán)', screen: SCREENS.ACC2, role: 'chief_accountant' }],
    owner: 'chief_accountant', verify, stopTheLine: true,
  },
  errors: {
    steps: [{ text: 'Mở Định khoản tự động, thẻ Lỗi định khoản; đọc lỗi từng chứng từ', screen: SCREENS.ACC14 }, { text: 'Bổ sung cấu hình còn thiếu (lý do, mặt hàng – tài khoản, tài khoản ngầm định)', screen: SCREENS.ACC18, role: 'chief_accountant' }, { text: 'Định khoản lại; nguồn không cần gửi lại', screen: SCREENS.ACC14, role: 'accountant' }],
    owner: 'accountant', verify,
  },
  entryMismatch: {
    steps: [{ text: 'Mở BC kiểm tra chứng từ, lọc chứng từ lệch bút toán', screen: SCREENS.ACC93 }, { text: 'Định khoản lại chứng từ đó', screen: SCREENS.ACC14, role: 'accountant' }, { text: 'Còn lệch: báo nhóm Lõi kèm mã tra cứu', role: 'chief_accountant' }],
    owner: 'accountant', verify,
  },
  balanceMismatch: {
    steps: [STOP_THE_LINE_STEP, { text: 'Nhóm Lõi dựng lại số dư lưu sẵn từ dòng sổ', role: 'core_team' }],
    owner: 'core_team', verify, stopTheLine: true, forbid: ['Không sửa tay bảng số dư'],
  },
  orphanReturns: {
    steps: [{ text: 'Mở BC kiểm tra chứng từ, lọc phiếu trả lại không nối phiếu gốc', screen: SCREENS.ACC93 }, { text: 'Gắn số phiếu bán / mua gốc ở hệ thống nguồn, gửi lại', role: 'creator' }],
    owner: 'accountant', verify,
  },
  paymentRequests: {
    steps: [{ text: 'Mở Yêu cầu thanh toán: duyệt hoặc từ chối từng yêu cầu', screen: SCREENS.CN05, role: 'chief_accountant' }, { text: 'Lập phiếu chi cho yêu cầu đã duyệt', role: 'accountant' }],
    owner: 'chief_accountant', verify,
  },
  cogs: {
    steps: [{ text: 'Tính giá vốn tháng cho các chi nhánh trong danh sách', screen: SCREENS.ACC49, role: 'chief_accountant' }, { text: 'Đã kết chuyển thì kết chuyển lại', screen: SCREENS.ACC6, role: 'chief_accountant' }],
    owner: 'chief_accountant', verify,
  },
  closing: {
    steps: [{ text: 'Kết chuyển lãi / lỗ tháng cho các chi nhánh trong danh sách (tháng cũ trước)', screen: SCREENS.ACC6, role: 'chief_accountant' }],
    owner: 'chief_accountant', verify,
  },
  closingStale: {
    steps: [{ text: 'Chạy lại kết chuyển cho các chi nhánh trong danh sách; bút toán cũ tự đảo', screen: SCREENS.ACC6, role: 'chief_accountant' }],
    owner: 'chief_accountant', verify,
  },
  closingResidual: {
    steps: [{ text: 'Xem tài khoản còn dư trong chi tiết', screen: SCREENS.ACC12 }, { text: 'Bổ sung bước còn thiếu ở bộ quy tắc kết chuyển', screen: SCREENS.ACC6, role: 'chief_accountant' }, { text: 'Kết chuyển lại', screen: SCREENS.ACC6, role: 'chief_accountant' }],
    owner: 'chief_accountant', verify,
  },
} satisfies Record<string, Remedy>;
