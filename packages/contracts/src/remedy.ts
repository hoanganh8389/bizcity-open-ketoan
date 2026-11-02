// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: bizcity_remedy@1 — phương án khắc phục có cấu trúc cho mọi kiểm (R-FIX-1..4); sổ đăng ký màn SCREENS dùng chung cho kiểm, giao diện và check SC-FIX-1.
/**
 * PHƯƠNG ÁN KHẮC PHỤC (bizcity_remedy@1, PHASE-022 R-FIX-1..5).
 *
 * Mỗi kiểm mức warn / error (tự chẩn đoán, mục bảng kiểm khoá kỳ, mã tiền kiểm IN-*) khai `remedy`:
 *   steps   — các bước đánh số, mỗi bước một câu có động từ, tuỳ chọn màn (SCREENS) và vai cần có
 *   owner   — vai tối thiểu làm được phương án
 *   verify  — kiểm lại: một mã kiểm chạy lại, hoặc một màn có số liệu đã đổi
 *   stopTheLine — lỗi Tier 0 (sổ sai): bước đầu luôn là dừng ghi sổ, báo nhóm Lõi kèm mã tra cứu (R-FIX-2)
 *   forbid  — việc KHÔNG được làm (vd "Không điều chỉnh kho cho khớp")
 * Không trường nào chứa lệnh sửa dữ liệu: phương án đi qua màn / API công khai có quyền và bằng chứng (R-FIX-2).
 * Màn chỉ tham chiếu qua SCREENS — check SC-FIX-1 đối chiếu đường dẫn với menu của giao diện.
 */

export type RemedyRole = 'creator' | 'accountant' | 'chief_accountant' | 'owner' | 'operator' | 'core_team';

export interface ScreenRef { code: string; path: string; label: string }
export interface RemedyStep { text: string; screen?: ScreenRef; role?: RemedyRole }
export interface Remedy {
  steps: RemedyStep[];
  owner: RemedyRole;
  verify: { code?: string; screen?: ScreenRef };
  stopTheLine?: boolean;
  forbid?: string[];
}

export const REMEDY_ROLE_LABELS: Record<RemedyRole, string> = {
  creator: 'người lập', accountant: 'kế toán viên', chief_accountant: 'kế toán trưởng', owner: 'chủ đơn vị', operator: 'vận hành', core_team: 'nhóm Lõi',
};

const s = (code: string, path: string, label: string): ScreenRef => ({ code, path, label });

/** Màn thao tác được phương án khắc phục dẫn tới. Đường dẫn phải có trong menu giao diện (SC-FIX-1). */
export const SCREENS = {
  ACC14: s('ACC14', '/chung-tu', 'Định khoản tự động'),
  ACC18: s('ACC18', '/cau-hinh/ly-do', 'Lý do – Tài khoản'),
  ACC17: s('ACC17', '/cau-hinh/nhom-hach-toan', 'Mặt hàng – Tài khoản'),
  ACC41: s('ACC41', '/cau-hinh/tai-khoan-ngam-dinh', 'Tài khoản ngầm định'),
  ACC49: s('ACC49', '/nghiep-vu/tinh-gia-von', 'Tính giá vốn'),
  ACC6: s('ACC6', '/nghiep-vu/ket-chuyen', 'Kết chuyển lãi / lỗ'),
  ACC2: s('ACC2', '/cau-hinh/ky-ke-toan', 'Đóng / mở kỳ kế toán'),
  ACC78: s('ACC78', '/thue/bo-sung-thong-tin', 'Bổ sung thông tin thuế'),
  ACC83: s('ACC83', '/bao-cao/nhap-xuat-ton', 'Nhập xuất tồn'),
  ACC12: s('ACC12', '/bao-cao/so-chi-tiet', 'Sổ chi tiết tài khoản'),
  ACC93: s('ACC93', '/bao-cao/kiem-tra-chung-tu', 'Kiểm tra chứng từ, hoá đơn'),
  ACC64: s('ACC64', '/thue/bang-ke-mua-vao', 'Báo cáo thuế vào'),
  ACC31: s('ACC31', '/tai-san/khau-hao', 'Tính khấu hao, phân bổ'),
  ACC55: s('ACC55', '/quy/so-quy-tien-mat', 'Sổ quỹ tiền mặt'),
  ACC40: s('ACC40', '/bao-cao/so-chi-tiet-cong-no', 'Sổ chi tiết công nợ'),
  CN01: s('CN01', '/cong-no/khoan-cong-no', 'Khoản công nợ và đối trừ'),
  CN05: s('CN05', '/cong-no/yeu-cau-thanh-toan', 'Yêu cầu thanh toán'),
  HT06: s('HT06', '/he-thong/kiem-chuan', 'Kiểm chuẩn'),
  HT07: s('HT07', '/he-thong/ho-so-ke-toan', 'Hồ sơ kế toán'),
} as const satisfies Record<string, ScreenRef>;

/** Bước mở đầu bắt buộc của lỗi Tier 0 (R-FIX-2). */
export const STOP_THE_LINE_STEP: RemedyStep = { text: 'Dừng ghi sổ; báo nhóm Lõi kèm mã tra cứu của lượt chẩn đoán. Không tự sửa sổ, không tắt kiểm', role: 'chief_accountant' };
