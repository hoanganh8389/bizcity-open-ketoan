/**
 * Yêu cầu nghiệp vụ Tài chính – Kế toán của công ty (sheet "TaiChinh-KeToan", file yêu cầu xây dựng hệ thống ERP)
 * và tình trạng đáp ứng trong phần mềm.
 *
 * CÁCH CẬP NHẬT (lập trình viên): làm xong / làm thêm một phần của yêu cầu nào thì sửa đúng mục đó ở đây:
 *   - đổi `status` của từng tính năng (done / partial / todo / waiting), ghi `note` ngắn nếu còn thiếu gì;
 *   - bổ sung `solution` (đã giải quyết thế nào, viết cho kế toán đọc), `screens` (mã màn), `guides` (tên tệp
 *     docs/huong-dan/<tên>.md), `updated` (ngày cập nhật).
 * Trạng thái của cả yêu cầu tự tính từ các tính năng. Mã màn phải có trong menu (layout/menu.ts) mới mở được.
 * Thứ tự, mã, câu chữ của yêu cầu giữ đúng như file của công ty để đối chiếu.
 */

export type FeatureStatus = 'done' | 'partial' | 'todo' | 'waiting';
export interface ReqFeature { text: string; status: FeatureStatus; note?: string }
export interface Requirement {
  code: string;
  group: ReqGroup;
  name: string;
  /** Các dòng "Tính năng yêu cầu" của chức năng trong file yêu cầu. */
  features: ReqFeature[];
  /** Phần mềm đã đáp ứng thế nào (viết cho kế toán đọc). */
  solution: string;
  /** Mã màn hình liên quan (mở được từ bảng). */
  screens: string[];
  /** Tài liệu hướng dẫn (docs/huong-dan/<tên>.md). */
  guides: string[];
  /** Phần còn lại dự kiến làm ở đợt nào. */
  plan?: string;
  updated: string;
}
export type ReqGroup = 'DM' | 'FI' | 'AP' | 'AR' | 'FA' | 'RP' | 'TAX' | 'REPORT' | 'GENERAL';

export const REQ_GROUPS: { key: ReqGroup; label: string }[] = [
  { key: 'DM', label: 'DM — Quản lý danh mục' },
  { key: 'FI', label: 'FI — Kế toán tổng hợp' },
  { key: 'AP', label: 'AP — Quản lý công nợ phải trả' },
  { key: 'AR', label: 'AR — Quản lý công nợ phải thu' },
  { key: 'FA', label: 'FA — Quản lý TSCĐ / CCDC / CP trả trước' },
  { key: 'RP', label: 'RP — Quản lý thanh toán' },
  { key: 'TAX', label: 'Quản lý thuế và in ấn' },
  { key: 'REPORT', label: 'Báo cáo yêu cầu chung' },
  { key: 'GENERAL', label: 'Yêu cầu chung' },
];

const f = (text: string, status: FeatureStatus, note?: string): ReqFeature => ({ text, status, note });
const LIST = (s: FeatureStatus = 'done') => [f('Hiển thị danh sách', s), f('Tìm kiếm', s)];
const CRUD = (s: FeatureStatus = 'done', note?: string) => f('Nhập mới: tạo mới, cập nhật, khoá', s, note);
const LINK = (s: FeatureStatus, note?: string) => f('Chức năng nhập liệu và báo cáo link được đến danh mục này', s, note);
const D = '14/10/2026';

export const FINANCE_REQUIREMENTS: Requirement[] = [
  // ------------------------------------------------------------------ DM
  {
    code: 'DM-001', group: 'DM', name: 'Quản lý danh mục tài khoản', updated: D,
    features: [...LIST(), CRUD()],
    solution: 'Danh mục tài khoản theo cây (tài khoản tổng hợp, chi tiết), có tìm kiếm, thêm, sửa, ngừng dùng. Mỗi tài khoản bật được theo dõi đối tượng, khoản mục, bộ phận, hợp đồng, nhân viên, vụ việc, dự án, nguồn vốn, dòng tiền.',
    screens: ['ACC1'], guides: ['tai-khoan'],
  },
  {
    code: 'DM-002', group: 'DM', name: 'Danh mục Cửa hàng / Bộ phận / Phòng ban', updated: D,
    features: [...LIST(), CRUD(), LINK('done', 'Chi tiết chi phí theo khoản mục, bộ phận (ACC47); tổng hợp theo nhân viên, hợp đồng, bộ phận (ACC69); định mức chi phí theo bộ phận (KH02)')],
    solution: 'Cửa hàng là danh mục Chi nhánh (mỗi cửa hàng một mã, thuộc một đơn vị hạch toán); phòng ban, bộ phận là danh mục Bộ phận (có cha – con). Dòng phiếu chọn bộ phận; mọi sổ, báo cáo lọc được theo chi nhánh; báo cáo chi phí ACC44 gom theo bộ phận; ACC47 chi tiết từng dòng chi phí theo khoản mục, bộ phận; ACC69 tổng hợp phát sinh theo nhân viên, hợp đồng, bộ phận. Danh mục bộ phận đầy đủ (từng cửa hàng mã BH + mã cửa hàng, HO, phòng ban) có sẵn ở dữ liệu gốc (TI08); chi nhánh gắn bộ phận, bút toán tự động từ cửa hàng mang bộ phận để xem lãi lỗ từng cửa hàng; tài khoản loại 5 – 8 bắt buộc bộ phận.',
    screens: ['DM02', 'ACC26', 'ACC44', 'ACC47', 'ACC69', 'TI08'], guides: ['chi-nhanh', 'khoan-muc-bo-phan', 'chi-phi-khoan-muc'], plan: 'Đợt 5 (báo cáo)',
  },
  {
    code: 'DM-003', group: 'DM', name: 'Danh mục khoản mục', updated: D,
    features: [...LIST(), CRUD(), LINK('done', 'ACC47 chi tiết theo khoản mục, bộ phận; ACC75 nhật ký chi tiền theo khoản mục; ACC90 tài khoản chi phí × khoản mục theo chi nhánh')],
    solution: 'Khoản mục chi phí có cha – con; dòng phiếu chọn khoản mục (bắt buộc khi tài khoản có bật theo dõi); kết chuyển giữ khoản mục; báo cáo ACC44 gom theo khoản mục; ACC47 chi tiết, ACC75 nhật ký chi tiền chia theo khoản mục gốc, ACC90 tài khoản × khoản mục mỗi chi nhánh một cột. Danh mục khoản mục chuẩn của công ty có sẵn ở dữ liệu gốc (TI08), quay về được khi bị sửa lộn xộn; lý do có khoản mục thì bút toán tự động mang khoản mục đó.',
    screens: ['ACC24', 'ACC44', 'ACC47', 'ACC75', 'ACC90', 'TI08'], guides: ['khoan-muc-bo-phan', 'chi-phi-khoan-muc'], plan: 'Đợt 5 (báo cáo)',
  },
  {
    code: 'DM-004', group: 'DM', name: 'Danh mục Vụ việc', updated: D,
    features: [...LIST(), CRUD()],
    solution: 'Danh mục vụ việc (khai trương, sự kiện, sửa chữa lớn…). Dòng phiếu chọn vụ việc; tài khoản bật "theo dõi vụ việc" thì bắt buộc; báo cáo chi phí ACC44 và sổ chi tiết lọc, gom theo vụ việc.',
    screens: ['DM06', 'ACC44'], guides: ['khoan-muc-bo-phan'],
  },
  {
    code: 'DM-005', group: 'DM', name: 'Danh mục Hợp đồng', updated: D,
    features: [...LIST(), CRUD(), LINK('done')],
    solution: 'Hợp đồng có loại (thuê nhà, NCC hàng hoá, mua tài sản – chi phí – dịch vụ, tín dụng, bán hàng), hợp đồng gốc / phụ lục, đối tượng, nhân viên phụ trách, ngày ký, ngày kết thúc, giá trị, thuế chủ nhà, lịch thanh toán. Dòng phiếu và thẻ tài sản chọn hợp đồng; báo cáo chi phí ACC44, lãi lỗ theo hợp đồng ACC70 / ACC71, lịch thanh toán HD01.',
    screens: ['ACC25', 'HD01', 'ACC70', 'ACC71'], guides: ['hop-dong'],
  },
  {
    code: 'DM-006', group: 'DM', name: 'Danh mục Dự án / Nguồn vốn', updated: D,
    features: [...LIST(), CRUD(), LINK('done')],
    solution: 'Hai danh mục riêng: Dự án và Nguồn vốn. Dòng phiếu chọn dự án, nguồn vốn; tài khoản bật theo dõi thì bắt buộc; ACC44 và sổ chi tiết gom, lọc được.',
    screens: ['DM07', 'ACC20', 'ACC44'], guides: ['khoan-muc-bo-phan'],
  },
  {
    code: 'DM-007', group: 'DM', name: 'Danh mục Ngân hàng', updated: D,
    features: [...LIST(), CRUD(), LINK('done')],
    solution: 'Mỗi tài khoản ngân hàng (ngân hàng, chi nhánh, số tài khoản, chủ tài khoản, địa chỉ, điện thoại, người liên hệ) gắn một tài khoản kế toán 112 chi tiết. Hình thức thanh toán chuyển khoản trỏ về tài khoản ngân hàng; phiếu báo nợ / báo có hiện tên ngân hàng; sổ tiền gửi ACC56 lọc theo tài khoản ngân hàng.',
    screens: ['DM09', 'DM05', 'ACC56'], guides: ['hinh-thuc-thanh-toan', 'so-quy'],
  },
  {
    code: 'DM-008', group: 'DM', name: 'Danh mục TSCĐ / CCDC / CP trả trước', updated: D,
    features: [
      f('Hiển thị danh sách', 'done'),
      f('Import hình ảnh, kích thước, điện năng… tương ứng từng mã tài sản', 'done', 'Thẻ có phần thông số kỹ thuật (tên – giá trị) và ảnh; Excel có cột Kích thước, Điện năng tiêu thụ, Thông số khác. Ảnh chọn trên thẻ, chưa nhập ảnh hàng loạt từ Excel'),
      f('Tìm kiếm', 'done'),
      f('Nhập mới (có trường khai các mã danh mục quản lý liên quan, ví dụ hợp đồng…): tạo mới, cập nhật, khoá', 'done'),
      f('Ghi nhận giá trị nguyên giá, giá trị còn lại', 'done'),
      f('Phân loại nhóm tài sản, loại tài sản', 'done'),
      f('Ghi nhận giá trị khấu hao đã chạy và kế hoạch khấu hao trong tương lai', 'done', 'Số đã trích từng tháng; lịch khấu hao cả vòng đời ở thẻ; màn Kế hoạch khấu hao, phân bổ (TS01)'),
    ],
    solution: 'Thẻ tài sản cố định, công cụ dụng cụ, chi phí trả trước: nguyên giá, giá trị còn lại, số tháng, loại tài sản, chi nhánh, bộ phận, khoản mục, hợp đồng, phân bổ nhiều nơi, mức trích theo thuế, nhóm công cụ dụng cụ, mục đích sử dụng, thông số kỹ thuật, ảnh; nhập đầu kỳ từ Excel.',
    screens: ['ACC28', 'ACC22', 'ACC23', 'ACC29'], guides: ['tai-san'], plan: 'Đợt 4',
  },
  {
    code: 'DM-009', group: 'DM', name: 'Danh mục nhóm tài sản', updated: D,
    features: [
      ...LIST(), f('Nhập mới', 'done'),
      f('Nhóm tài sản gán với tài khoản hạch toán để sinh bút toán tự động đẩy về sổ cái', 'done', 'Khấu hao / phân bổ tự ghi sổ theo tài khoản của nhóm; ghi tăng, ghi giảm, thanh lý lập phiếu kế toán từ thẻ theo tài khoản của thẻ'),
    ],
    solution: 'Loại tài sản khai tài khoản nguyên giá, hao mòn, chi phí, số tháng mặc định. Khấu hao / phân bổ hằng tháng tự ghi sổ theo các tài khoản này. Thêm danh mục nhóm công cụ dụng cụ (ACC19) và mục đích sử dụng (ACC21) để phân nhóm, ghi mục đích trên thẻ.',
    screens: ['ACC37', 'ACC19', 'ACC21', 'ACC31'], guides: ['tai-san'], plan: 'Đợt 4',
  },
  {
    code: 'DM-010', group: 'DM', name: 'Danh mục Khách hàng', updated: D,
    features: [f('Thừa hưởng thông tin khai báo bên bán hàng', 'done')],
    solution: 'Khách hàng tự thêm khi chứng từ bán hàng gửi sang, hoặc hệ thống bán hàng đồng bộ hàng loạt qua API. Kế toán bổ sung nhóm, hạn thanh toán, hạn mức nợ, giới hạn số phiếu nợ, tài khoản ngân hàng, khoá; chứng từ gửi sang không ghi đè các thông tin này.',
    screens: ['DM03', 'DM08'], guides: ['doi-tuong'],
  },
  {
    code: 'DM-011', group: 'DM', name: 'Danh mục Nhà cung cấp', updated: D,
    features: [f('Thừa hưởng thông tin khai báo bên mua hàng', 'done')],
    solution: 'Dùng chung danh mục Đối tượng với khách hàng (một đối tượng vừa mua vừa bán thì cấn trừ được). Nhà cung cấp tự thêm theo chứng từ mua / chứng từ nguồn, hoặc đồng bộ qua API.',
    screens: ['DM03', 'DM08'], guides: ['doi-tuong'],
  },
  {
    code: 'DM-012', group: 'DM', name: 'Quản lý hợp đồng khung Tài sản, Chi phí, Tín dụng → liên kết quản lý công nợ, thanh toán, kế hoạch tài chính', updated: D,
    features: [
      f('Hiển thị danh sách hợp đồng khung mua hàng', 'done'),
      f('Tìm kiếm hợp đồng khung mua hàng', 'done'),
      f('Nhập mới hợp đồng khung mua hàng (ví dụ hợp đồng thuê nhà, tín dụng, mua tài sản, dịch vụ…)', 'done'),
      f('Liên kết quản lý công nợ, thanh toán', 'done', 'HD01: nút Lập yêu cầu TT tạo yêu cầu thanh toán (CN05) cho kỳ; mỗi kỳ một yêu cầu; lập phiếu chi xong kỳ tự sang đã trả'),
      f('Liên kết kế hoạch tài chính', 'done', 'Kỳ thanh toán hợp đồng chưa trả được điền vào kế hoạch thu chi (KH01); hợp đồng sắp hết hạn, kỳ sắp đến hiện ở Tổng quan'),
    ],
    solution: 'Hợp đồng có loại, hợp đồng gốc, lịch thanh toán (sinh đều theo kỳ, sửa từng kỳ, thuế nộp thay chủ nhà). Màn HD01 nhắc các kỳ đến hạn, lập yêu cầu thanh toán cho từng kỳ (duyệt, lập phiếu chi thì kỳ tự đánh dấu đã trả), hoặc đánh dấu đã trả bằng tay.',
    screens: ['ACC25', 'HD01', 'CN05'], guides: ['hop-dong'], plan: 'Đợt 6 (kế hoạch tài chính)',
  },
  {
    code: 'DM-013', group: 'DM', name: 'Danh mục Nhãn hàng', updated: D,
    features: [f('Thừa hưởng thông tin khai báo bên mua hàng', 'partial', 'Chờ hệ thống mua hàng gửi phân loại qua API; mã hàng của chứng từ đã nhận từ trước chưa được đổ vào danh mục (việc còn lại)')],
    solution: 'Danh mục mặt hàng có nhãn hàng, ngành hàng, nhóm hàng, loại hàng. Hệ thống bán / mua hàng đồng bộ mặt hàng kèm mã phân loại qua API (mã chưa có thì tự thêm); chứng từ mang mã hàng mới thì mặt hàng tự thêm.',
    screens: ['DM10', 'DM11'], guides: ['mat-hang'],
  },

  // ------------------------------------------------------------------ FI
  {
    code: 'FI-001', group: 'FI', name: 'Ghi nhận bút toán', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu kế toán', 'done'),
      f('Tìm kiếm các phiếu kế toán', 'done'),
      f('Nhập mới phiếu kế toán: bút toán tự động, bút toán mẫu, bút toán lặp hỗ trợ nhập liệu', 'done'),
      f('Sửa / xoá phiếu kế toán (theo phân quyền)', 'done', 'Kế toán viên chỉ sửa / huỷ phiếu của mình; thêm khoá dữ liệu đến ngày, chỉ sửa trong N ngày, chỉ lập phiếu hôm nay, cấm kế toán viên huỷ'),
      f('Điều chỉnh số dư tài khoản', 'done', 'Bằng phiếu kế toán'),
      f('Cấn trừ số dư tài khoản', 'done', 'Cấn trừ theo số dư hoặc chọn từng hoá đơn hai bên (một phiếu bán với nhiều phiếu nhập)'),
      f('Bộ sổ hạch toán theo chuẩn mực kế toán Việt Nam (VAS)', 'done'),
    ],
    solution: 'Phiếu kế toán, phiếu thu / chi / báo có / báo nợ; định khoản tự động cho chứng từ nhận từ hệ thống bán hàng, mua hàng; bút toán mẫu (lập từ mẫu) và bút toán lặp (sinh phiếu định kỳ); sửa = ghi số âm rồi ghi lại, huỷ = ghi số âm; kế toán viên chỉ sửa / huỷ phiếu của mình, kế toán trưởng sửa / huỷ mọi phiếu; khoá dữ liệu theo ngày (ACC2); số dư đầu kỳ; cấn trừ công nợ chọn từng hoá đơn. Hai bộ sổ (nội bộ, thuế) theo hệ thống tài khoản hiện hành.',
    screens: ['ACC16', 'BT01', 'BT02', 'ACC14', 'ACC15', 'BT03', 'ACC2'], guides: ['phieu-ke-toan', 'but-toan-mau', 'can-tru-cong-no', 'so-du-tai-khoan', 'chung-tu', 'ky-ke-toan'],
  },
  {
    code: 'FI-002', group: 'FI', name: 'Kết chuyển số dư tài khoản', updated: D,
    features: [f('Tìm kiếm số dư các tài khoản cần kết chuyển', 'done'), f('Thực hiện kết chuyển tự động', 'done')],
    solution: 'Xem trước bút toán kết chuyển và lãi lỗ từng chi nhánh, rồi kết chuyển (chạy lại thì tự đảo bút toán cũ). Danh sách bút toán kết chuyển mẫu sửa được. Đầu năm mới: kết chuyển lợi nhuận năm nay sang lợi nhuận năm trước (4212 → 4211). Số dư cuối kỳ sang đầu kỳ sau phần mềm tự tính liên tục từ sổ cái, không cần bước kết chuyển số dư.',
    screens: ['ACC6'], guides: ['ket-chuyen', 'ky-ke-toan'],
  },
  {
    code: 'FI-003', group: 'FI', name: 'Đóng / mở kỳ kế toán', updated: D,
    features: [f('Cập nhật trạng thái từng kỳ kế toán', 'done')],
    solution: 'Kỳ kế toán theo tháng. Lưới khoá chi nhánh × loại chứng từ: tick từng ô, cả hàng, cả cột, nút Đóng kỳ. Bảng kiểm trước khi khoá (chứng từ lỗi, lệch, chưa tính giá vốn, chưa kết chuyển…). Mở khoá bắt buộc lý do, có nhật ký khoá / mở. Kỳ đã khoá không ghi, không sửa được.',
    screens: ['ACC2'], guides: ['ky-ke-toan'],
  },

  // ------------------------------------------------------------------ AP
  {
    code: 'AP-001', group: 'AP', name: 'Quản lý khoản đặt cọc, trả trước (phải trả)', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu đặt cọc, trả trước', 'done'),
      f('Tìm kiếm các phiếu đặt cọc, trả trước', 'done'),
      f('Nhập mới phiếu đặt cọc, trả trước', 'done'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Copy dữ liệu từ quản lý đơn đặt hàng / báo giá đơn đặt hàng', 'done', 'Chọn từ Chứng từ nguồn (CN06); cần hệ thống mua hàng gửi đơn đặt hàng, báo giá qua API'),
      f('Đẩy dữ liệu sang phân hệ thanh toán (yêu cầu thanh toán)', 'done', 'Yêu cầu thanh toán khoản chưa ghi công nợ (TK ghi Nợ 331): phiếu chi sinh ra tự gắn mục đích trả trước, hiện ở màn Đặt cọc, trả trước'),
      f('Đẩy dữ liệu hạch toán sang kế toán tổng hợp (sổ cái)', 'done'),
    ],
    solution: 'Phiếu đặt cọc, trả trước cho nhà cung cấp (phiếu chi / báo nợ: Nợ 331 hoặc ký quỹ / Có tiền), ghi sổ ngay. Danh sách hiện số cọc đã trừ và còn lại; trừ cọc vào hoá đơn bằng đối trừ ở CN01.',
    screens: ['CN04', 'CN06', 'CN01'], guides: ['phieu-cong-no', 'khoan-cong-no'],
  },
  {
    code: 'AP-002', group: 'AP', name: 'Quản lý ghi tăng công nợ phải trả', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu ghi tăng công nợ', 'done'),
      f('Tìm kiếm các phiếu ghi tăng công nợ', 'done'),
      f('Nhập mới phiếu ghi tăng công nợ: copy từ dữ liệu mua hàng hoặc ghi nhận khoản tăng công nợ bất kỳ', 'done'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Copy dữ liệu từ phiếu nhập hàng / đơn đặt hàng / báo giá', 'done', 'Điền sẵn đối tượng, số tiền, hạn thanh toán, nội dung; dòng hàng của chứng từ nguồn chưa chép sang'),
      f('Đẩy dữ liệu sang thanh toán (yêu cầu thanh toán)', 'done'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Phiếu ghi tăng công nợ phải trả (Nợ chi phí / tài sản / Có 331), có thuế GTGT và hoá đơn đầu vào, hạn thanh toán; mỗi phiếu thành một khoản công nợ, yêu cầu thanh toán chọn được khoản này. Phiếu nhập mua gửi từ hệ thống mua hàng cũng tự sinh khoản công nợ.',
    screens: ['CN03', 'CN06', 'CN05', 'CN01'], guides: ['phieu-cong-no', 'yeu-cau-thanh-toan'],
  },
  {
    code: 'AP-003', group: 'AP', name: 'Quản lý ghi giảm công nợ phải trả', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu ghi giảm công nợ', 'done'),
      f('Tìm kiếm các phiếu ghi giảm công nợ', 'done'),
      f('Nhập mới phiếu ghi giảm công nợ', 'done'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Copy dữ liệu từ phiếu xuất trả hàng / phiếu ghi tăng công nợ phải trả', 'done'),
      f('Đẩy dữ liệu sang thanh toán', 'done', 'Khoản ghi giảm trừ vào hoá đơn bằng đối trừ; phần còn lại mới đưa vào yêu cầu thanh toán'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Phiếu ghi giảm công nợ phải trả (Nợ 331 / Có thu nhập, giảm chi phí…). Phiếu trả hàng nhà cung cấp gửi từ hệ thống mua hàng cũng tự ghi giảm và nối về phiếu nhập gốc.',
    screens: ['CN03', 'CN01'], guides: ['phieu-cong-no', 'khoan-cong-no'],
  },

  // ------------------------------------------------------------------ AR
  {
    code: 'AR-001', group: 'AR', name: 'Quản lý khoản đặt cọc, trả trước (phải thu)', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu đặt cọc, trả trước', 'done'),
      f('Tìm kiếm các phiếu đặt cọc, trả trước', 'done'),
      f('Nhập mới phiếu đặt cọc, trả trước', 'done'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Copy dữ liệu từ quản lý đơn đặt hàng / báo giá đơn đặt hàng', 'done', 'Chọn từ Chứng từ nguồn (CN06); cần hệ thống bán hàng gửi đơn, báo giá qua API'),
      f('Đẩy dữ liệu sang phân hệ thanh toán', 'done', 'Khoản cọc trừ vào hoá đơn bán bằng đối trừ (CN01)'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Phiếu khách đặt cọc, trả trước (phiếu thu / báo có: Nợ tiền / Có 131), ghi sổ ngay, theo dõi số cọc còn lại, trừ vào hoá đơn bán.',
    screens: ['CN04', 'CN06', 'CN01'], guides: ['phieu-cong-no', 'khoan-cong-no'],
  },
  {
    code: 'AR-002', group: 'AR', name: 'Quản lý ghi tăng công nợ phải thu', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu ghi tăng công nợ', 'done'),
      f('Tìm kiếm các phiếu ghi tăng công nợ', 'done'),
      f('Nhập mới phiếu ghi tăng công nợ', 'done'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Copy dữ liệu từ phiếu xuất hàng / đơn bán hàng', 'done'),
      f('Đẩy dữ liệu sang thanh toán', 'done', 'Phiếu thu chọn khoản để thu'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Phiếu ghi tăng công nợ phải thu (Nợ 131 / Có thu nhập…), có thuế đầu ra; phiếu bán nợ gửi từ hệ thống bán hàng tự sinh khoản công nợ có hạn thanh toán.',
    screens: ['CN02', 'CN06', 'CN01', 'ACC51'], guides: ['phieu-cong-no', 'khoan-cong-no'],
  },
  {
    code: 'AR-003', group: 'AR', name: 'Quản lý ghi giảm công nợ phải thu', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu ghi giảm công nợ', 'done'),
      f('Tìm kiếm các phiếu ghi giảm công nợ', 'done'),
      f('Nhập mới phiếu ghi giảm công nợ', 'done'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Copy dữ liệu từ phiếu xuất trả hàng / phiếu ghi tăng công nợ', 'done'),
      f('Đẩy dữ liệu sang thanh toán', 'done'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Phiếu ghi giảm công nợ phải thu (chiết khấu, xoá nợ, điều chỉnh…); phiếu khách trả hàng gửi từ hệ thống bán hàng tự ghi giảm và nối về phiếu bán gốc.',
    screens: ['CN02', 'CN01'], guides: ['phieu-cong-no', 'khoan-cong-no'],
  },

  // ------------------------------------------------------------------ FA
  {
    code: 'FA-001', group: 'FA', name: 'Nhập giao dịch tăng tài sản, chi phí', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu ghi tăng TSCĐ / CCDC / CP trả trước', 'done'),
      f('Tìm kiếm các phiếu ghi tăng', 'done'),
      f('Nhập mới phiếu ghi tăng TSCĐ / CCDC / CP trả trước', 'done'),
      f('Nhập mới phiếu ghi tăng CP trả trước', 'done'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Đẩy giá trị nguyên giá sang danh mục, đưa ra bảng khấu hao / phân bổ kế hoạch', 'done', 'Lịch khấu hao cả vòng đời ở thẻ; màn Kế hoạch khấu hao, phân bổ (TS01) các tháng tới'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done', 'Nút Hạch toán ghi tăng ở thẻ: gợi ý Nợ TK nguyên giá / chờ phân bổ, lập phiếu kế toán'),
    ],
    solution: 'Thêm thẻ tài sản / công cụ / chi phí trả trước, nhập đầu kỳ từ Excel; hạch toán ghi tăng thành phiếu kế toán; lịch khấu hao cả vòng đời và kế hoạch các tháng tới.',
    screens: ['ACC28', 'ACC22', 'ACC23', 'TS01'], guides: ['tai-san'], plan: 'Đợt 4',
  },
  {
    code: 'FA-002', group: 'FA', name: 'Ghi nhận giảm tài sản, chi phí', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu đã ghi giảm', 'done'),
      f('Tìm kiếm các phiếu ghi giảm', 'done'),
      f('Nhập mới phiếu ghi giảm CP trả trước', 'done', 'Nút Ghi giảm / thanh lý ở thẻ: Nợ TK chi phí / Có 242 phần chưa phân bổ'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Cập nhật nguyên giá sang danh mục, đưa ra bảng khấu hao kế hoạch đã điều chỉnh', 'done', 'Đánh giá lại cập nhật thẻ; lịch khấu hao tính lại theo thẻ'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done', 'Gợi ý Nợ hao mòn / Có nguyên giá, Nợ 8111 / Có nguyên giá phần còn lại; lập phiếu kế toán, thẻ chuyển sang đã ghi giảm'),
    ],
    solution: 'Ghi giảm từ thẻ: gợi ý định khoản (sửa được), lập phiếu kế toán, thẻ thôi trích từ ngày ghi giảm. Đánh giá lại nguyên giá (chia mốc ngày, khấu hao tính lại từ mốc).',
    screens: ['ACC30', 'ACC32', 'ACC28'], guides: ['tai-san'], plan: 'Đợt 4',
  },
  {
    code: 'FA-003', group: 'FA', name: 'Thanh lý, nhượng bán tài sản, chi phí', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu đã thanh lý, nhượng bán', 'done', 'Màn ghi giảm (ACC30) và lịch sử thẻ'),
      f('Tìm kiếm', 'done'),
      f('Nhập mới phiếu thanh lý', 'done', 'Thêm dòng giá bán (Nợ 131 / Có 7111, thuế GTGT đầu ra) và chi phí thanh lý (Nợ 8111 / Có 111)'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Cập nhật trạng thái sang danh mục', 'done'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Ghi giảm / thanh lý từ thẻ: xoá nguyên giá, hao mòn, giá trị còn lại vào 8111, giá bán vào 7111 kèm thuế, chi phí thanh lý; một phiếu kế toán; thẻ chuyển sang đã ghi giảm.',
    screens: ['ACC30'], guides: ['tai-san'], plan: 'Đợt 4',
  },
  {
    code: 'FA-004', group: 'FA', name: 'Điều chuyển tài sản, chi phí', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu đã điều chuyển', 'done'),
      f('Tìm kiếm', 'done'),
      f('Sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Nhập mới phiếu điều chuyển', 'done'),
      f('Cập nhật trạng thái sang danh mục', 'done'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done', 'Cùng đơn vị hạch toán: không ghi sổ, khấu hao chia theo ngày. Khác đơn vị: nút Hạch toán… lập hai phiếu kế toán (bên giao Có nguyên giá, Nợ hao mòn + 13681; bên nhận Nợ nguyên giá, Có hao mòn + 33681)'),
    ],
    solution: 'Điều chuyển chi nhánh, bộ phận theo ngày, giữ lịch sử; khấu hao tháng điều chuyển chia theo số ngày. Điều chuyển sang chi nhánh khác đơn vị hạch toán: lập hai phiếu kế toán qua phải thu / phải trả nội bộ theo số luỹ kế đến hết tháng trước; đã hạch toán thì không xoá được lần điều chuyển trước khi huỷ phiếu.',
    screens: ['ACC33'], guides: ['tai-san'], plan: 'Đợt 4',
  },
  {
    code: 'FA-005', group: 'FA', name: 'Ghi nhận khấu hao / phân bổ thủ công', updated: D,
    features: [
      f('Hiển thị danh sách', 'done'), f('Tìm kiếm', 'done'), f('Nhập mới', 'done'), f('Sửa / xoá (theo phân quyền)', 'done'),
      f('Cập nhật giá trị khấu hao sang danh mục', 'done'), f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Sửa tay số trích của từng thẻ, từng tháng (kèm lý do); lần tính khấu hao sau dùng số sửa tay.',
    screens: ['ACC31'], guides: ['tai-san'],
  },
  {
    code: 'FA-006', group: 'FA', name: 'Ghi nhận khấu hao / phân bổ tự động', updated: D,
    features: [
      f('Hiển thị danh sách', 'done'), f('Tìm kiếm', 'done'), f('Nhập mới', 'done'), f('Sửa / xoá (theo phân quyền)', 'done'),
      f('Cập nhật giá trị khấu hao sang danh mục', 'done'), f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Tính khấu hao / phân bổ hằng tháng cho cả TSCĐ, CCDC, chi phí trả trước (tháng đầu theo ngày, tháng cuối trích nốt), tự ghi sổ; tính lại thì đảo bút toán cũ; dồn các tháng chưa trích.',
    screens: ['ACC31', 'ACC27'], guides: ['tai-san'],
  },
  {
    code: 'FA-007', group: 'FA', name: 'Thay đổi năm tài chính tài sản', updated: D,
    features: [
      f('Đóng năm tài chính trước của TSCĐ / CCDC / CP trả trước', 'done', 'Khoá kỳ các tháng của năm cũ, loại chứng từ Khấu hao, phân bổ (ACC2)'),
      f('Kết chuyển số dư từ năm tài chính tài sản cũ sang năm mới', 'done', 'Không cần bước kết chuyển: nguyên giá, luỹ kế tính liên tục qua các năm'),
    ],
    solution: 'Số dư tài sản tính liên tục từ thẻ và số đã trích qua các năm, đầu năm cứ tính khấu hao tháng 1; chốt năm cũ bằng khoá kỳ.',
    screens: ['ACC2', 'ACC31', 'TS01'], guides: ['tai-san', 'ky-ke-toan'], plan: 'Đợt 4',
  },

  // ------------------------------------------------------------------ RP
  {
    code: 'RP-001', group: 'RP', name: 'Quản lý khoản thu', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu đã ghi nhận thu', 'done'),
      f('Tìm kiếm', 'done'),
      f('Nhập mới / sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Ghi nhận khoản thu từ các khoản công nợ đã ghi nhận trước đó', 'done'),
      f('Ghi nhận khoản thu chưa từng ghi nhận công nợ (thanh toán trực tiếp)', 'done'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Phiếu thu / báo có: đánh dấu "Thanh toán cho khoản công nợ" để chọn các khoản phải thu còn mở của khách và số thu từng khoản; phần thu thừa nằm lại là khoản trả trước. Màn CN01 xem các khoản chờ thu theo hạn, đối trừ sau.',
    screens: ['ACC51', 'ACC54', 'CN01'], guides: ['phieu-thu-chi', 'khoan-cong-no'],
  },
  {
    code: 'RP-002', group: 'RP', name: 'Quản lý khoản chi', updated: D,
    features: [
      f('Hiển thị danh sách các phiếu đã ghi nhận chi', 'done'),
      f('Tìm kiếm', 'done'),
      f('Nhập mới / sửa / xoá phiếu (theo phân quyền)', 'done'),
      f('Ghi nhận khoản chi từ các khoản công nợ đã ghi nhận trước đó', 'done'),
      f('Ghi nhận khoản chi chưa từng ghi nhận công nợ (thanh toán trực tiếp)', 'done'),
      f('Đẩy dữ liệu hạch toán sang sổ cái', 'done'),
    ],
    solution: 'Phiếu chi / báo nợ chọn khoản phải trả để trả. Yêu cầu thanh toán: đề nghị → duyệt một / hai cấp → lập phiếu chi / báo nợ, tự trừ vào khoản đã chọn.',
    screens: ['ACC52', 'ACC53', 'CN05', 'CN01'], guides: ['phieu-thu-chi', 'yeu-cau-thanh-toan'],
  },
  {
    code: 'RP-003', group: 'RP', name: 'Kế hoạch tài chính', updated: D,
    features: [
      f('Lập kế hoạch tài chính định kỳ (dự kiến thu – chi), liên kết mua hàng, bán hàng, quản lý công nợ', 'done', 'KH01: kế hoạch theo tháng × chi nhánh, điền từ khoản công nợ đến hạn và lịch hợp đồng, thêm dòng tay'),
      f('Báo cáo / cảnh báo công nợ đến hạn, đã / chưa thanh toán; theo dõi hợp đồng thuê nhà: kỳ hạn, thời hạn thanh toán, thuế chủ nhà', 'done'),
      f('Báo cáo chi phí so sánh định mức và thực hiện theo giai đoạn / bộ phận / shop / chi nhánh / công ty', 'done', 'KH02: định mức theo tháng × chi nhánh (hoặc cả công ty) × bộ phận (hoặc mọi bộ phận) × khoản mục, so thực tế theo khoảng tháng'),
      f('Báo cáo so sánh thực hiện và kế hoạch', 'done', 'KH01 tab So với thực hiện: thu, chi theo tháng × chi nhánh'),
    ],
    solution: 'Kế hoạch thu chi (KH01) điền từ công nợ đến hạn, lịch hợp đồng và nhập tay, so với tiền thực vào / ra; định mức chi phí (KH02) so chi phí thực tế; cảnh báo công nợ quá hạn / sắp đến hạn, kỳ hợp đồng, hợp đồng sắp hết hạn ở Tổng quan; khoản công nợ theo hạn (CN01), tuổi nợ, lịch thanh toán hợp đồng thuê nhà có thuế chủ nhà (HD01).',
    screens: ['KH01', 'KH02', 'CN01', 'ACC39', 'ACC67', 'HD01'], guides: ['ke-hoach-tai-chinh', 'khoan-cong-no', 'tuoi-no', 'hop-dong'], plan: 'Đợt 6',
  },

  // ------------------------------------------------------------------ Thuế và in ấn
  {
    code: 'TAX-01', group: 'TAX', name: 'In phiếu liên tục; phần mềm thuế ký điện tử được trên phiếu', updated: D,
    features: [
      f('In phiếu liên tục (nhiều phiếu một lần)', 'done', 'Chọn nhiều phiếu ở danh sách → In liên tục, mỗi phiếu một trang'),
      f('Ký điện tử trên phiếu', 'partial', 'Đã có ký xác nhận trong phần mềm theo vai (người lập, thủ quỹ, kế toán trưởng, giám đốc), in lên phiếu; chưa có chữ ký số dùng chứng thư số (token USB)'),
    ],
    solution: 'In phiếu theo mẫu 01-TT / 02-TT, in liên tục nhiều phiếu. Ký xác nhận từng phiếu hoặc hàng loạt; chữ ký gắn phiên bản phiếu (sửa phiếu thì phải ký lại), in "Đã ký xác nhận" kèm tên, giờ ký.',
    screens: ['ACC51', 'ACC52', 'ACC53', 'ACC54', 'ACC16'], guides: ['phieu-thu-chi'], plan: 'Đợt 7',
  },
  {
    code: 'TAX-02', group: 'TAX', name: 'Cảnh báo hoá đơn rủi ro thuế (doanh nghiệp bỏ trốn, tạm dừng, chưa cấp mã cơ quan thuế…)', updated: D,
    features: [
      f('Cảnh báo hoá đơn rủi ro', 'done', 'Người bán trong danh sách rủi ro (theo ngày), MST sai, trên cổng đã huỷ / thay thế, lệch tiền, cổng báo không hợp lệ, có trong sổ không có trên cổng'),
      f('Tự tra trạng thái người nộp thuế trên cổng cơ quan thuế', 'todo', 'Cổng cần đăng nhập và mã xác nhận; hiện kế toán khai / nhập Excel danh sách người nộp thuế rủi ro'),
    ],
    solution: 'Màn Cảnh báo hoá đơn rủi ro (THUE02) xét hoá đơn mua vào trong sổ và trên cổng; tab Người nộp thuế rủi ro để khai / nhập Excel danh sách từ thông báo của cơ quan thuế.', screens: ['THUE02', 'THUE01', 'ACC78'], guides: ['hoa-don-co-quan-thue', 'bo-sung-thong-tin-thue'], plan: 'Đợt 7',
  },
  {
    code: 'TAX-03', group: 'TAX', name: 'Liên kết số liệu cơ quan nhà nước: danh sách hoá đơn đầu vào / đầu ra để kế toán lấy, kiểm tra và nhập vào phần mềm', updated: D,
    features: [
      f('Lấy hoá đơn đầu vào, đầu ra từ cơ quan thuế', 'partial', 'Nhập tệp Excel / XML tải từ cổng hoá đơn điện tử; chưa tự kết nối cổng (cần tài khoản doanh nghiệp và mã xác nhận)'),
      f('Kiểm tra (đối chiếu) với sổ hoá đơn', 'done', 'Khớp, lệch tiền, trên cổng đã huỷ / thay thế, chưa có trong sổ, không có trên cổng'),
      f('Nhập vào phần mềm', 'done', 'Hoá đơn chưa có trong sổ chuyển thành chứng từ nguồn để lập phiếu công nợ'),
    ],
    solution: 'Màn Hoá đơn từ cơ quan thuế (THUE01): nhập Excel "Xuất excel" hoặc các tệp XML hoá đơn từ cổng, đối chiếu với sổ hoá đơn theo ký hiệu + số (+ MST người bán), chuyển hoá đơn chưa có thành chứng từ nguồn (CN06).',
    screens: ['THUE01', 'CN06', 'ACC78', 'ACC64', 'ACC65'], guides: ['hoa-don-co-quan-thue', 'bo-sung-thong-tin-thue', 'bang-ke-mua-vao', 'bang-ke-ban-ra'], plan: 'Đợt 7',
  },

  // ------------------------------------------------------------------ Báo cáo yêu cầu chung
  {
    code: 'BC-01', group: 'REPORT', name: 'Các báo cáo kế toán phải phân tích được theo nhóm hàng, ngành hàng, loại hàng', updated: D,
    features: [f('Phân tích theo nhóm, ngành, loại hàng', 'partial', 'Tổng hợp bán hàng (BH02) và nhập xuất tồn, mua hàng, giá vốn (ACC83, ô Xem theo) gom theo nhãn hàng, ngành hàng, nhóm hàng, loại hàng; công nợ theo mặt hàng chưa gom theo phân loại')],
    solution: 'Mặt hàng có nhãn hàng, ngành hàng, nhóm hàng, loại hàng. Tổng hợp bán hàng gom theo các phân loại này; báo cáo nhập xuất tồn (ACC83) chọn Xem theo nhóm / loại / nhãn hiệu / ngành hàng / nhóm hạch toán, kèm cột mua hàng và giá vốn hàng bán; lãi gộp (BH04) theo mặt hàng, nhóm / loại / nhãn / ngành hàng, cửa hàng, khách.', screens: ['DM10', 'DM11', 'BH01', 'BH02', 'BH04', 'ACC83'], guides: ['mat-hang'], plan: 'Đợt 5',
  },
  {
    code: 'BC-02', group: 'REPORT', name: 'Các báo cáo kế toán phải phân tích được theo nhóm KH / NCC, loại KH / NCC', updated: D,
    features: [f('Phân tích theo nhóm, loại khách hàng / nhà cung cấp', 'done', 'Tổng hợp bán hàng gom theo nhóm khách; sổ tổng hợp công nợ có cột nhóm đối tượng; mua hàng gom theo nhà cung cấp / nhóm nhà cung cấp ở ACC83 (ô Xem theo)')],
    solution: 'Danh mục nhóm đối tượng (khách lẻ, khách buôn, NCC hàng hoá, NCC tài sản / dịch vụ, chủ nhà, cơ quan nhà nước…). Bán hàng gom theo nhóm khách (BH02); công nợ có cột nhóm đối tượng; mua hàng (nhập mua trừ trả lại) gom theo nhà cung cấp, nhóm nhà cung cấp (ACC83).', screens: ['DM08', 'DM03', 'BH02', 'ACC83'], guides: ['doi-tuong'], plan: 'Đợt 5',
  },
  {
    code: 'BC-03', group: 'REPORT', name: 'Biên bản đối chiếu công nợ phải thu / phải trả tự động trên phần mềm', updated: D,
    features: [f('Biên bản đối chiếu công nợ', 'done', 'Màn CN07: chọn kỳ, bộ sổ, tài khoản, tick đối tác, in biên bản (kèm chi tiết chứng từ nếu chọn)')],
    solution: 'Màn Biên bản đối chiếu công nợ (CN07): số dư đầu kỳ, phát sinh, cuối kỳ theo từng tài khoản của đối tác, kết luận số còn nợ bằng số và bằng chữ, in hàng loạt mỗi đối tác một trang.', screens: ['CN07', 'ACC40'], guides: ['doi-chieu-cong-no', 'so-chi-tiet-cong-no'], plan: 'Đợt 5',
  },
  {
    code: 'BC-04', group: 'REPORT', name: 'Các mẫu biểu TGS sẽ gửi lại', updated: D,
    features: [f('Mẫu biểu báo cáo quản trị của công ty', 'waiting', 'Chờ công ty gửi mẫu')],
    solution: '—', screens: [], guides: [], plan: 'Đợt 5',
  },

  // ------------------------------------------------------------------ Yêu cầu chung
  {
    code: 'CHUNG-01', group: 'GENERAL', name: 'Phần mềm nhanh, không lỗi; báo cáo xem được toàn bộ shop / chi nhánh / công ty trong nhiều tháng', updated: D,
    features: [f('Xử lý nhanh giờ cao điểm', 'partial', 'Chưa chạy thử tải với số đơn thật mỗi ngày'), f('Báo cáo toàn bộ shop / chi nhánh / công ty nhiều tháng', 'done', 'Không giới hạn khoảng ngày, số chi nhánh')],
    solution: 'Số dư cộng dồn theo ngày cập nhật cùng lúc ghi sổ nên báo cáo tổng hợp không phải quét lại toàn bộ dòng sổ.', screens: [], guides: [], plan: 'Đợt 8',
  },
  {
    code: 'CHUNG-02', group: 'GENERAL', name: 'Báo cáo cập nhật luôn các phiếu sửa / phiếu mới', updated: D,
    features: [f('Báo cáo cập nhật ngay', 'done')],
    solution: 'Phiếu ghi sổ hoặc sửa là báo cáo có số mới ngay, không phải chạy lại.', screens: [], guides: [],
  },
  {
    code: 'CHUNG-03', group: 'GENERAL', name: 'Giao diện dễ dùng cho thu ngân không rành kế toán; tiếng Việt; hướng dẫn sử dụng và đào tạo; hỗ trợ kỹ thuật; dễ nâng cấp, bảo trì', updated: D,
    features: [f('Giao diện tiếng Việt, dễ thao tác', 'done'), f('Hướng dẫn sử dụng', 'done', 'Mỗi màn có nút Hướng dẫn'), f('Tài liệu đào tạo theo vai trò', 'done', 'Hướng dẫn "Tài liệu đào tạo theo vai trò": việc thường làm và màn hình của kế toán viên, kế toán trưởng, chủ đơn vị, người chỉ xem')],
    solution: 'Mỗi màn có mã chức năng, nút Hướng dẫn mở tài liệu của chính màn đó; mục Tiện ích có Hướng dẫn sử dụng, Kiến trúc & Nghiệp vụ.', screens: ['TI09', 'TI10'], guides: ['00-bat-dau', 'dao-tao-theo-vai-tro'], plan: 'Đợt 8',
  },
  {
    code: 'CHUNG-04', group: 'GENERAL', name: 'API mở để kết nối hệ thống khác', updated: D,
    features: [f('API mở', 'done')],
    solution: 'Nhận chứng từ, đồng bộ danh mục (đối tượng, mặt hàng, chứng từ nguồn), đọc báo cáo qua API; khoá API chia phạm vi quyền.', screens: ['HT02'], guides: ['khoa-api'],
  },
  {
    code: 'CHUNG-05', group: 'GENERAL', name: 'Sao lưu dữ liệu tự động', updated: D,
    features: [f('Sao lưu tự động', 'partial', 'Đang sao lưu trên máy chủ; chưa chép bản sao lưu ra nơi khác, chưa kiểm tra khôi phục định kỳ')],
    solution: 'Sao lưu cơ sở dữ liệu hằng ngày trên máy chủ.', screens: [], guides: [], plan: 'Đợt 8',
  },
  {
    code: 'CHUNG-06', group: 'GENERAL', name: 'Không mất dữ liệu khi mất mạng', updated: D,
    features: [f('Không mất dữ liệu khi mất mạng', 'partial', 'Bên gửi gửi lại an toàn (không ghi trùng); chưa có hàng đợi phía máy chủ')],
    solution: 'Mỗi chứng từ có khoá riêng và số phiên bản: gửi lại khi mạng chập chờn không ghi trùng.', screens: [], guides: [], plan: 'Đợt 8',
  },
  {
    code: 'CHUNG-07', group: 'GENERAL', name: 'Lưu trữ dữ liệu tối thiểu 10 năm', updated: D,
    features: [f('Lưu trữ 10 năm', 'partial', 'Sổ chỉ thêm, có nhật ký thao tác; chưa có chính sách giữ bản sao lưu năm')],
    solution: 'Sổ cái không sửa, không xoá; mọi lần sửa đều để lại bút toán và nhật ký.', screens: [], guides: [], plan: 'Đợt 8',
  },
  {
    code: 'CHUNG-08', group: 'GENERAL', name: 'Phân quyền user chỉ được xem dữ liệu phần mềm / phần hành trong một giai đoạn nhất định (từ ngày … đến ngày …)', updated: D,
    features: [f('Phân quyền theo phần hành', 'partial', 'Có 4 vai trò và quyền sửa / huỷ phiếu, duyệt thanh toán; chưa chia theo từng phần hành'), f('Phân quyền theo khoảng ngày', 'todo')],
    solution: 'Vai trò chủ sở hữu, kế toán trưởng, kế toán, chỉ xem; kế toán viên chỉ sửa phiếu của mình.', screens: ['HT01'], guides: ['nguoi-dung'], plan: 'Đợt 8',
  },
  {
    code: 'CHUNG-09', group: 'GENERAL', name: 'Khoá / mã hoá được dữ liệu khi yêu cầu', updated: D,
    features: [f('Khoá dữ liệu', 'done', 'Khoá kỳ kế toán theo bộ sổ, chi nhánh, loại chứng từ; khoá dữ liệu đến ngày, chỉ sửa trong N ngày'), f('Mã hoá dữ liệu', 'partial', 'Mật khẩu băm, đường truyền mã hoá; chưa mã hoá bản sao lưu')],
    solution: 'Khoá sổ theo kỳ; kỳ đã khoá không ghi, không sửa được.', screens: ['ACC2'], guides: ['ky-ke-toan'], plan: 'Đợt 8',
  },
];

/** Trạng thái của cả yêu cầu, tính từ các tính năng. */
export function requirementStatus(r: Requirement): FeatureStatus {
  const s = r.features.map((x) => x.status);
  if (s.every((x) => x === 'done')) return 'done';
  if (s.some((x) => x === 'done' || x === 'partial')) return 'partial';
  if (s.every((x) => x === 'waiting')) return 'waiting';
  return 'todo';
}
