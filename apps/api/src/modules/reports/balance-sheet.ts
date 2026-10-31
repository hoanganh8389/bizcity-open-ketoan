// @bizcity-layer D modules/ke-toan
// [2026-10-31 08:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — ledger.query (PHASES 3.7): đọc sổ qua khung nhìn bizcity_read.* thay bảng ledger_* (SC-KERNEL-7)
/**
 * Báo cáo tình hình tài chính (mẫu B01-DN theo Thông tư 99/2025/TT-BTC; trước đây gọi là Bảng cân đối kế toán).
 *
 * Cách tính:
 *  - Lấy số dư (Nợ − Có) của từng (tài khoản chi tiết, đối tượng) tới hết một ngày, gồm cả bút toán kết chuyển.
 *  - Mỗi chỉ tiêu "lấy số" khai danh sách đầu số tài khoản và cách lấy (kind):
 *        debit            số dư Nợ thuần của nhóm tài khoản (Nợ − Có)            → tài sản
 *        credit           số dư Có thuần (Có − Nợ)                                → nguồn vốn
 *        contra           tài khoản điều chỉnh giảm tài sản (hao mòn, dự phòng): ghi ÂM số dư Có
 *        debitByPartner   tài khoản lưỡng tính: cộng các số dư NỢ của từng đối tượng (không bù trừ)
 *        creditByPartner  tài khoản lưỡng tính: cộng các số dư CÓ của từng đối tượng
 *    Tài khoản lưỡng tính (131, 331, 333, 138…) vì thế lên cả hai phía: dư Nợ ở tài sản, dư Có ở nguồn vốn.
 *  - Chỉ tiêu "công thức" cộng trừ các chỉ tiêu khác theo mã số.
 *  - Lãi lỗ CHƯA kết chuyển (số dư các tài khoản đầu 5–9) được cộng vào chỉ tiêu 420b để bảng vẫn cân
 *    khi xem giữa kỳ; báo cáo trả riêng con số này để giao diện nhắc người dùng.
 *  - Ngắn hạn / dài hạn (xem cả bảng TERM_MAP):
 *      * 242: 2421 lên chỉ tiêu 161, 2422 lên 271; phần chờ phân bổ theo dõi trên thẻ công cụ / chi phí trả trước
 *        được tách lại theo lịch phân bổ: phần phân bổ trong 12 tháng tới là ngắn hạn, phần sau đó là dài hạn.
 *      * Phải thu, phải trả, vay…: số dư mặc định là ngắn hạn; phần dài hạn kế toán khai ở màn "Phân loại dài hạn"
 *        (bảng long_term_balances, theo ngày lập báo cáo) được chuyển từ chỉ tiêu ngắn hạn sang dài hạn tương ứng.
 *      Chỉ áp dụng khi xem cả đơn vị (không lọc chi nhánh).
 *
 * Muốn đổi chỉ tiêu: sửa bảng BALANCE_SHEET_LINES (thứ tự là thứ tự in).
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { db, toNumber, type Db } from '../../db/client.js';

type Kind = 'debit' | 'credit' | 'contra' | 'debitByPartner' | 'creditByPartner';
interface LineDef {
  code: string;
  name: string;
  /** Cấp trình bày: 0 tổng cộng, 1 mục A/B/C/D, 2 mục I/II, 3 chỉ tiêu, 4 chỉ tiêu con. */
  level: 0 | 1 | 2 | 3 | 4;
  kind?: Kind;
  accounts?: string[];
  /** Đầu số loại ra khỏi `accounts` (ví dụ 338 trừ 3387). */
  exclude?: string[];
  formula?: [string, 1 | -1][];
  /** Chỉ tiêu nhận thêm lãi lỗ chưa kết chuyển. */
  addUnclosedProfit?: boolean;
}

const sum = (...codes: string[]): [string, 1][] => codes.map((c) => [c, 1]);

/**
 * Chỉ tiêu theo mẫu B01-DN của Thông tư 99/2025/TT-BTC ("Báo cáo tình hình tài chính").
 * Chỉ tiêu lấy số khai trước chỉ tiêu công thức dùng tới nó là không bắt buộc: bảng được tính nhiều lượt.
 *
 * Số dư phải thu, phải trả, vay… mặc định trình bày ở chỉ tiêu NGẮN HẠN; phần dài hạn lấy từ màn "Phân loại dài hạn"
 * (xem TERM_MAP). Chi phí chờ phân bổ tách theo 2421 / 2422 và theo lịch phân bổ của thẻ tài sản.
 * Chỉ tiêu có accounts rỗng: phần mềm chưa có nghiệp vụ sinh số (luôn 0) nhưng vẫn in để đúng mẫu.
 */
export const BALANCE_SHEET_LINES: LineDef[] = [
  { code: '100', name: 'A. TÀI SẢN NGẮN HẠN', level: 1, formula: sum('110', '120', '130', '140', '150', '160') },
  { code: '110', name: 'I. Tiền và các khoản tương đương tiền', level: 2, formula: sum('111', '112') },
  { code: '111', name: '1. Tiền', level: 3, kind: 'debit', accounts: ['111', '112', '113'] },
  { code: '112', name: '2. Các khoản tương đương tiền', level: 3, kind: 'debit', accounts: ['1281'] },
  { code: '120', name: 'II. Đầu tư tài chính ngắn hạn', level: 2, formula: sum('121', '122', '123', '124', '125', '126') },
  { code: '121', name: '1. Chứng khoán kinh doanh', level: 3, kind: 'debit', accounts: ['121'] },
  { code: '122', name: '2. Dự phòng giảm giá chứng khoán kinh doanh (*)', level: 3, kind: 'contra', accounts: ['2291'] },
  { code: '123', name: '3. Đầu tư nắm giữ đến ngày đáo hạn ngắn hạn', level: 3, kind: 'debit', accounts: ['128'], exclude: ['1281'] },
  { code: '124', name: '4. Dự phòng đầu tư nắm giữ đến ngày đáo hạn ngắn hạn (*)', level: 3, kind: 'contra', accounts: [] },
  { code: '125', name: '5. Đầu tư ngắn hạn khác', level: 3, kind: 'debit', accounts: [] },
  { code: '126', name: '6. Dự phòng tổn thất các khoản đầu tư ngắn hạn khác (*)', level: 3, kind: 'contra', accounts: [] },
  { code: '130', name: 'III. Các khoản phải thu ngắn hạn', level: 2, formula: sum('131', '132', '133', '134', '135', '136', '137') },
  { code: '131', name: '1. Phải thu ngắn hạn của khách hàng', level: 3, kind: 'debitByPartner', accounts: ['131'] },
  { code: '132', name: '2. Trả trước cho người bán ngắn hạn', level: 3, kind: 'debitByPartner', accounts: ['331'] },
  { code: '133', name: '3. Phải thu nội bộ ngắn hạn', level: 3, kind: 'debitByPartner', accounts: ['1362', '1363', '1368', '336'], exclude: ['3361'] },
  { code: '134', name: '4. Phải thu theo tiến độ hợp đồng xây dựng', level: 3, kind: 'debitByPartner', accounts: ['337'] },
  { code: '135', name: '5. Phải thu ngắn hạn khác', level: 3, kind: 'debitByPartner', accounts: ['138', '141', '244', '334', '335', '338', '344'], exclude: ['1381', '1383', '3387'] },
  { code: '136', name: '6. Dự phòng phải thu ngắn hạn khó đòi (*)', level: 3, kind: 'contra', accounts: ['2293'] },
  { code: '137', name: '7. Tài sản thiếu chờ xử lý', level: 3, kind: 'debit', accounts: ['1381'] },
  { code: '140', name: 'IV. Hàng tồn kho', level: 2, formula: sum('141', '142') },
  { code: '141', name: '1. Hàng tồn kho', level: 3, kind: 'debit', accounts: ['151', '152', '153', '154', '155', '156', '157', '158'] },
  { code: '142', name: '2. Dự phòng giảm giá hàng tồn kho (*)', level: 3, kind: 'contra', accounts: ['2294'] },
  { code: '150', name: 'V. Tài sản sinh học ngắn hạn', level: 2, formula: sum('151', '152', '153') },
  { code: '151', name: '1. Súc vật nuôi lấy sản phẩm một lần ngắn hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '152', name: '2. Cây trồng theo mùa vụ hoặc lấy sản phẩm một lần ngắn hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '153', name: '3. Dự phòng tổn thất tài sản sinh học ngắn hạn (*)', level: 3, kind: 'contra', accounts: [] },
  { code: '160', name: 'VI. Tài sản ngắn hạn khác', level: 2, formula: sum('161', '162', '163', '164', '165') },
  { code: '161', name: '1. Chi phí chờ phân bổ ngắn hạn', level: 3, kind: 'debit', accounts: ['242'], exclude: ['2422'] },
  { code: '162', name: '2. Thuế giá trị gia tăng được khấu trừ', level: 3, kind: 'debit', accounts: ['133'] },
  { code: '163', name: '3. Thuế và các khoản khác phải thu Nhà nước', level: 3, kind: 'debitByPartner', accounts: ['333', '1383'] },
  { code: '164', name: '4. Giao dịch mua bán lại trái phiếu Chính phủ', level: 3, kind: 'debit', accounts: ['171'] },
  { code: '165', name: '5. Tài sản ngắn hạn khác', level: 3, kind: 'debit', accounts: [] },

  { code: '200', name: 'B. TÀI SẢN DÀI HẠN', level: 1, formula: sum('210', '220', '230', '240', '250', '260', '270') },
  { code: '210', name: 'I. Các khoản phải thu dài hạn', level: 2, formula: sum('211', '212', '213', '214', '215', '216') },
  { code: '211', name: '1. Phải thu dài hạn của khách hàng', level: 3, kind: 'debit', accounts: [] },
  { code: '212', name: '2. Trả trước cho người bán dài hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '213', name: '3. Vốn kinh doanh ở đơn vị trực thuộc', level: 3, kind: 'debit', accounts: ['1361'] },
  { code: '214', name: '4. Phải thu nội bộ dài hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '215', name: '5. Phải thu dài hạn khác', level: 3, kind: 'debit', accounts: [] },
  { code: '216', name: '6. Dự phòng phải thu dài hạn khó đòi (*)', level: 3, kind: 'contra', accounts: [] },
  { code: '220', name: 'II. Tài sản cố định', level: 2, formula: sum('221', '224', '227') },
  { code: '221', name: '1. Tài sản cố định hữu hình', level: 3, formula: sum('222', '223') },
  { code: '222', name: '- Nguyên giá', level: 4, kind: 'debit', accounts: ['211'] },
  { code: '223', name: '- Giá trị hao mòn luỹ kế (*)', level: 4, kind: 'contra', accounts: ['2141'] },
  { code: '224', name: '2. Tài sản cố định thuê tài chính', level: 3, formula: sum('225', '226') },
  { code: '225', name: '- Nguyên giá', level: 4, kind: 'debit', accounts: ['212'] },
  { code: '226', name: '- Giá trị hao mòn luỹ kế (*)', level: 4, kind: 'contra', accounts: ['2142'] },
  { code: '227', name: '3. Tài sản cố định vô hình', level: 3, formula: sum('228', '229') },
  { code: '228', name: '- Nguyên giá', level: 4, kind: 'debit', accounts: ['213'] },
  { code: '229', name: '- Giá trị hao mòn luỹ kế (*)', level: 4, kind: 'contra', accounts: ['2143'] },
  { code: '230', name: 'III. Tài sản sinh học dài hạn', level: 2, formula: sum('231', '236', '237', '238') },
  { code: '231', name: '1. Súc vật nuôi cho sản phẩm định kỳ dài hạn', level: 3, kind: 'debit', accounts: ['215'] },
  { code: '236', name: '2. Súc vật nuôi lấy sản phẩm một lần dài hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '237', name: '3. Cây trồng theo mùa vụ hoặc lấy sản phẩm một lần dài hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '238', name: '4. Dự phòng tổn thất tài sản sinh học dài hạn (*)', level: 3, kind: 'contra', accounts: ['2295'] },
  { code: '240', name: 'IV. Bất động sản đầu tư', level: 2, formula: sum('241', '242') },
  { code: '241', name: '- Nguyên giá', level: 4, kind: 'debit', accounts: ['217'] },
  { code: '242', name: '- Giá trị hao mòn luỹ kế (*)', level: 4, kind: 'contra', accounts: ['2147'] },
  { code: '250', name: 'V. Tài sản dở dang dài hạn', level: 2, formula: sum('251', '252') },
  { code: '251', name: '1. Chi phí sản xuất, kinh doanh dở dang dài hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '252', name: '2. Chi phí xây dựng cơ bản dở dang', level: 3, kind: 'debit', accounts: ['241'] },
  { code: '260', name: 'VI. Đầu tư tài chính dài hạn', level: 2, formula: sum('261', '262', '263', '264', '265', '266') },
  { code: '261', name: '1. Đầu tư vào công ty con', level: 3, kind: 'debit', accounts: ['221'] },
  { code: '262', name: '2. Đầu tư vào công ty liên doanh, liên kết', level: 3, kind: 'debit', accounts: ['222'] },
  { code: '263', name: '3. Đầu tư góp vốn vào đơn vị khác', level: 3, kind: 'debit', accounts: ['2281'] },
  { code: '264', name: '4. Dự phòng tổn thất đầu tư vào đơn vị khác dài hạn (*)', level: 3, kind: 'contra', accounts: ['2292'] },
  { code: '265', name: '5. Đầu tư nắm giữ đến ngày đáo hạn dài hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '266', name: '6. Dự phòng tổn thất đầu tư nắm giữ đến ngày đáo hạn dài hạn (*)', level: 3, kind: 'contra', accounts: [] },
  { code: '270', name: 'VII. Tài sản dài hạn khác', level: 2, formula: sum('271', '272', '273', '274') },
  { code: '271', name: '1. Chi phí chờ phân bổ dài hạn', level: 3, kind: 'debit', accounts: ['2422'] },
  { code: '272', name: '2. Tài sản thuế thu nhập hoãn lại', level: 3, kind: 'debit', accounts: ['243'] },
  { code: '273', name: '3. Thiết bị, vật tư, phụ tùng thay thế dài hạn', level: 3, kind: 'debit', accounts: [] },
  { code: '274', name: '4. Tài sản dài hạn khác', level: 3, kind: 'debit', accounts: ['2288'] },
  { code: '280', name: 'TỔNG CỘNG TÀI SẢN (280 = 100 + 200)', level: 0, formula: sum('100', '200') },

  { code: '300', name: 'C. NỢ PHẢI TRẢ', level: 1, formula: sum('310', '330') },
  { code: '310', name: 'I. Nợ ngắn hạn', level: 2, formula: sum('311', '312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '322', '323', '324', '325') },
  { code: '311', name: '1. Phải trả người bán ngắn hạn', level: 3, kind: 'creditByPartner', accounts: ['331'] },
  { code: '312', name: '2. Người mua trả tiền trước ngắn hạn', level: 3, kind: 'creditByPartner', accounts: ['131'] },
  { code: '313', name: '3. Phải trả cổ tức, lợi nhuận', level: 3, kind: 'credit', accounts: ['332'] },
  { code: '314', name: '4. Thuế và các khoản phải nộp Nhà nước ngắn hạn', level: 3, kind: 'creditByPartner', accounts: ['333'] },
  { code: '315', name: '5. Phải trả người lao động', level: 3, kind: 'creditByPartner', accounts: ['334'] },
  { code: '316', name: '6. Chi phí phải trả ngắn hạn', level: 3, kind: 'creditByPartner', accounts: ['335'] },
  { code: '317', name: '7. Phải trả nội bộ ngắn hạn', level: 3, kind: 'creditByPartner', accounts: ['336', '1362', '1363', '1368'], exclude: ['3361'] },
  { code: '318', name: '8. Phải trả theo tiến độ hợp đồng xây dựng', level: 3, kind: 'creditByPartner', accounts: ['337'] },
  { code: '319', name: '9. Doanh thu chờ phân bổ ngắn hạn', level: 3, kind: 'credit', accounts: ['3387'] },
  { code: '320', name: '10. Phải trả ngắn hạn khác', level: 3, kind: 'creditByPartner', accounts: ['338', '138', '141', '244', '344'], exclude: ['3387', '1381', '1383'] },
  { code: '321', name: '11. Vay và nợ thuê tài chính ngắn hạn', level: 3, kind: 'credit', accounts: ['341', '3431'], exclude: ['34112'] },
  { code: '322', name: '12. Dự phòng phải trả ngắn hạn', level: 3, kind: 'credit', accounts: ['352'] },
  { code: '323', name: '13. Quỹ khen thưởng, phúc lợi', level: 3, kind: 'credit', accounts: ['353'] },
  { code: '324', name: '14. Quỹ bình ổn giá', level: 3, kind: 'credit', accounts: ['357'] },
  { code: '325', name: '15. Giao dịch mua bán lại trái phiếu Chính phủ', level: 3, kind: 'credit', accounts: [] },
  { code: '330', name: 'II. Nợ dài hạn', level: 2, formula: sum('331', '332', '333', '334', '335', '336', '337', '338', '339', '340', '341', '342', '343', '344') },
  { code: '331', name: '1. Phải trả người bán dài hạn', level: 3, kind: 'credit', accounts: [] },
  { code: '332', name: '2. Người mua trả tiền trước dài hạn', level: 3, kind: 'credit', accounts: [] },
  { code: '333', name: '3. Thuế và các khoản phải nộp Nhà nước dài hạn', level: 3, kind: 'credit', accounts: [] },
  { code: '334', name: '4. Chi phí phải trả dài hạn', level: 3, kind: 'credit', accounts: [] },
  { code: '335', name: '5. Phải trả nội bộ về vốn kinh doanh', level: 3, kind: 'credit', accounts: ['3361'] },
  { code: '336', name: '6. Phải trả nội bộ dài hạn', level: 3, kind: 'credit', accounts: [] },
  { code: '337', name: '7. Doanh thu chờ phân bổ dài hạn', level: 3, kind: 'credit', accounts: [] },
  { code: '338', name: '8. Phải trả dài hạn khác', level: 3, kind: 'credit', accounts: [] },
  { code: '339', name: '9. Vay và nợ thuê tài chính dài hạn', level: 3, kind: 'credit', accounts: ['34112'] },
  { code: '340', name: '10. Trái phiếu chuyển đổi', level: 3, kind: 'credit', accounts: ['3432'] },
  { code: '341', name: '11. Cổ phiếu ưu đãi', level: 3, kind: 'credit', accounts: [] },
  { code: '342', name: '12. Thuế thu nhập hoãn lại phải trả', level: 3, kind: 'credit', accounts: ['347'] },
  { code: '343', name: '13. Dự phòng phải trả dài hạn', level: 3, kind: 'credit', accounts: [] },
  { code: '344', name: '14. Quỹ phát triển khoa học và công nghệ', level: 3, kind: 'credit', accounts: ['356'] },

  { code: '400', name: 'D. VỐN CHỦ SỞ HỮU', level: 1, formula: sum('411', '412', '413', '414', '415', '416', '417', '418', '419', '420') },
  { code: '411', name: '1. Vốn góp của chủ sở hữu', level: 3, kind: 'credit', accounts: ['4111'] },
  { code: '412', name: '2. Thặng dư vốn', level: 3, kind: 'credit', accounts: ['4112'] },
  { code: '413', name: '3. Quyền chọn chuyển đổi trái phiếu', level: 3, kind: 'credit', accounts: ['4113'] },
  { code: '414', name: '4. Vốn khác của chủ sở hữu', level: 3, kind: 'credit', accounts: ['411'], exclude: ['4111', '4112', '4113'] },
  { code: '415', name: '5. Cổ phiếu mua lại của chính mình (*)', level: 3, kind: 'credit', accounts: ['419'] },
  { code: '416', name: '6. Chênh lệch đánh giá lại tài sản', level: 3, kind: 'credit', accounts: ['412'] },
  { code: '417', name: '7. Chênh lệch tỷ giá hối đoái', level: 3, kind: 'credit', accounts: ['413'] },
  { code: '418', name: '8. Quỹ đầu tư phát triển', level: 3, kind: 'credit', accounts: ['414'] },
  { code: '419', name: '9. Quỹ khác thuộc vốn chủ sở hữu', level: 3, kind: 'credit', accounts: ['418'] },
  { code: '420', name: '10. Lợi nhuận sau thuế chưa phân phối', level: 3, formula: sum('420a', '420b') },
  { code: '420a', name: '- LNST chưa phân phối luỹ kế đến cuối kỳ trước', level: 4, kind: 'credit', accounts: ['4211'] },
  { code: '420b', name: '- LNST chưa phân phối kỳ này', level: 4, kind: 'credit', accounts: ['4212'], addUnclosedProfit: true },
  { code: '440', name: 'TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)', level: 0, formula: sum('300', '400') },
];

export interface Bal { account: string; partnerId: string; net: number }

/**
 * Cặp chỉ tiêu ngắn hạn → dài hạn của từng nhóm tài khoản. Tài khoản lưỡng tính (131, 331, 138…) có hai cặp:
 * dư Nợ (phía tài sản) và dư Có (phía nguồn vốn). Khớp theo đầu số dài nhất.
 */
export const TERM_MAP: { prefix: string; asset?: [string, string]; liability?: [string, string]; label: string }[] = [
  { prefix: '131', asset: ['131', '211'], liability: ['312', '332'], label: 'Phải thu khách hàng / người mua trả tiền trước' },
  { prefix: '331', asset: ['132', '212'], liability: ['311', '331'], label: 'Phải trả người bán / trả trước cho người bán' },
  { prefix: '1368', asset: ['133', '214'], liability: ['317', '336'], label: 'Phải thu, phải trả nội bộ' },
  { prefix: '336', asset: ['133', '214'], liability: ['317', '336'], label: 'Phải thu, phải trả nội bộ' },
  { prefix: '138', asset: ['135', '215'], liability: ['320', '338'], label: 'Phải thu, phải trả khác' },
  { prefix: '141', asset: ['135', '215'], label: 'Tạm ứng' },
  { prefix: '244', asset: ['135', '215'], liability: ['320', '338'], label: 'Ký quỹ, ký cược' },
  { prefix: '338', asset: ['135', '215'], liability: ['320', '338'], label: 'Phải thu, phải trả khác' },
  { prefix: '3387', liability: ['319', '337'], label: 'Doanh thu chờ phân bổ' },
  { prefix: '344', asset: ['135', '215'], liability: ['320', '338'], label: 'Nhận ký quỹ, ký cược' },
  { prefix: '333', liability: ['314', '333'], label: 'Thuế và các khoản phải nộp Nhà nước' },
  { prefix: '335', liability: ['316', '334'], label: 'Chi phí phải trả' },
  { prefix: '341', liability: ['321', '339'], label: 'Vay và nợ thuê tài chính (34112 vay dài hạn tự lên chỉ tiêu 339)' },
  { prefix: '3431', liability: ['321', '339'], label: 'Trái phiếu thường' },
  { prefix: '352', liability: ['322', '343'], label: 'Dự phòng phải trả' },
  { prefix: '128', asset: ['123', '265'], label: 'Đầu tư nắm giữ đến ngày đáo hạn' },
];
export const termRuleFor = (account: string) => TERM_MAP.filter((r) => account.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];

/** Một lần chuyển số từ chỉ tiêu ngắn hạn sang dài hạn (hoặc ngược lại), tính bằng xu. */
export interface TermMove { account: string; partnerId: string | null; from: string; to: string; cents: number; requested: number; source: 'manual' | 'schedule'; note: string }


/** Số dư (Nợ − Có, tính bằng xu) theo (tài khoản, đối tượng) tới một mốc ngày. */
async function balancesAt(trx: Db, a: { tenantId: string; branchIds: string[] | null; date: string; inclusive: boolean }): Promise<Bal[]> {
  const branchFilter = a.branchIds ? sql`AND branch_id = ANY(${a.branchIds}::bigint[])` : sql``;
  const dateFilter = a.inclusive ? sql`posting_date <= ${a.date}::date` : sql`posting_date < ${a.date}::date`;
  const res = await sql<{ account_code: string; partner_id: string; net: string }>`
    SELECT account_code, partner_id, SUM(debit - credit) AS net
      FROM bizcity_read.ledger_balances_daily
     WHERE tenant_id = ${a.tenantId} AND ${dateFilter} ${branchFilter}
     GROUP BY account_code, partner_id
    HAVING SUM(debit - credit) <> 0`.execute(trx);
  return res.rows.map((r) => ({ account: r.account_code, partnerId: r.partner_id, net: toCents(toNumber(r.net)) }));
}

const matches = (def: LineDef, account: string) => def.accounts!.some((p) => account.startsWith(p)) && !(def.exclude ?? []).some((p) => account.startsWith(p));

function evaluate(bals: Bal[], moves: TermMove[] = []) {
  // Lãi lỗ chưa kết chuyển: số dư Có thuần của các tài khoản doanh thu, chi phí, xác định kết quả (đầu 5–9).
  const unclosed = bals.filter((b) => /^[5-9]/.test(b.account)).reduce((s, b) => s - b.net, 0);
  const values = new Map<string, number>();
  const leaf = (def: LineDef): number => {
    const hit = bals.filter((b) => matches(def, b.account));
    let v = 0;
    switch (def.kind) {
      case 'debit': v = hit.reduce((s, b) => s + b.net, 0); break;
      case 'credit': v = hit.reduce((s, b) => s - b.net, 0); break;
      case 'contra': v = hit.reduce((s, b) => s + b.net, 0); break; // số dư Có → net âm → hiện âm
      case 'debitByPartner': v = hit.reduce((s, b) => s + (b.net > 0 ? b.net : 0), 0); break;
      case 'creditByPartner': v = hit.reduce((s, b) => s + (b.net < 0 ? -b.net : 0), 0); break;
    }
    return v + (def.addUnclosedProfit ? unclosed : 0);
  };
  for (const def of BALANCE_SHEET_LINES) if (def.kind) values.set(def.code, leaf(def));
  for (const m of moves) {
    values.set(m.from, (values.get(m.from) ?? 0) - m.cents);
    values.set(m.to, (values.get(m.to) ?? 0) + m.cents);
  }
  // Công thức lồng nhau nhiều cấp: lặp tới khi mọi dòng tính xong.
  const pending = BALANCE_SHEET_LINES.filter((d) => d.formula);
  for (let round = 0; round < 6 && pending.some((d) => !values.has(d.code)); round++) {
    for (const def of pending) {
      if (values.has(def.code) || def.formula!.some(([c]) => !values.has(c))) continue;
      values.set(def.code, def.formula!.reduce((s, [c, sign]) => s + sign * values.get(c)!, 0));
    }
  }
  // Tài khoản có số dư (đầu 1–4) mà không chỉ tiêu nào lấy: nguyên nhân thường gặp khi bảng không cân.
  const leaves = BALANCE_SHEET_LINES.filter((d) => d.kind);
  const unmapped = new Map<string, number>();
  for (const b of bals) {
    if (!/^[1-4]/.test(b.account) || leaves.some((d) => matches(d, b.account))) continue;
    unmapped.set(b.account, (unmapped.get(b.account) ?? 0) + b.net);
  }
  return { values, unclosed, unmapped: [...unmapped.entries()].filter(([, v]) => v !== 0).map(([account, v]) => ({ account, debit: fromCents(Math.max(v, 0)), credit: fromCents(Math.max(-v, 0)) })) };
}

/**
 * Các lần chuyển ngắn hạn → dài hạn tại một ngày: phần kế toán khai (long_term_balances) và lịch phân bổ của thẻ
 * công cụ dụng cụ, chi phí trả trước. Số chuyển không vượt số dư thực tế của tài khoản / đối tượng.
 */
export async function termMoves(trx: Db, a: { tenantId: string; date: string; bals: Bal[]; prepaid?: Map<string, { short: number; long: number }> }): Promise<TermMove[]> {
  const moves: TermMove[] = [];
  const rows = await trx
    .selectFrom('long_term_balances as l')
    .leftJoin('partners as p', 'p.id', 'l.partner_id')
    .select(['l.account_code', 'l.partner_id', 'l.amount', 'l.note', 'p.code as partner_code', 'p.name as partner_name'])
    .where('l.tenant_id', '=', a.tenantId)
    .where('l.as_of', '=', a.date)
    .execute();
  for (const r of rows) {
    const rule = termRuleFor(r.account_code);
    if (!rule) continue;
    const hit = a.bals.filter((b) => b.account.startsWith(r.account_code) && (!r.partner_id || b.partnerId === String(r.partner_id)));
    // Lưỡng tính: dư Nợ của từng đối tượng là tài sản, dư Có là nợ phải trả.
    const debit = hit.reduce((s, b) => s + (b.net > 0 ? b.net : 0), 0);
    const credit = hit.reduce((s, b) => s + (b.net < 0 ? -b.net : 0), 0);
    const side = rule.asset && rule.liability ? (debit >= credit ? 'asset' : 'liability') : rule.asset ? 'asset' : 'liability';
    const pair = side === 'asset' ? rule.asset! : rule.liability!;
    const available = side === 'asset' ? debit : credit;
    const requested = toCents(toNumber(r.amount));
    const who = r.partner_code ? ` — ${r.partner_code} ${r.partner_name ?? ''}`.trimEnd() : '';
    moves.push({ account: r.account_code, partnerId: r.partner_id ? String(r.partner_id) : null, from: pair[0], to: pair[1], cents: Math.min(requested, available), requested, source: 'manual', note: `${r.account_code}${who}${r.note ? ` (${r.note})` : ''}` });
  }
  for (const [account, v] of a.prepaid ?? []) {
    const balance = a.bals.filter((b) => b.account === account).reduce((s, b) => s + b.net, 0);
    if (balance <= 0) continue;
    if (account.startsWith('2422')) {
      if (v.short > 0) moves.push({ account, partnerId: null, from: '271', to: '161', cents: Math.min(v.short, balance), requested: v.short, source: 'schedule', note: `${account}: phần phân bổ trong 12 tháng tới` });
    } else if (v.long > 0) {
      moves.push({ account, partnerId: null, from: '161', to: '271', cents: Math.min(v.long, balance), requested: v.long, source: 'schedule', note: `${account}: phần phân bổ sau 12 tháng tới` });
    }
  }
  return moves;
}

const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

type PrepaidSplit = (date: string) => Promise<Map<string, { short: number; long: number }>>;

export async function balanceSheet(a: { tenantId: string; from: string; to: string; branchIds: string[] | null; prepaidSplit?: PrepaidSplit }) {
  const [end, start] = await Promise.all([
    balancesAt(db, { ...a, date: a.to, inclusive: true }),
    balancesAt(db, { ...a, date: a.from, inclusive: false }),
  ]);
  // Tách dài hạn chỉ khi xem cả đơn vị: số khai là số của cả đơn vị.
  const whole = !a.branchIds;
  const openingDate = dayBefore(a.from);
  const endMoves = whole ? await termMoves(db, { tenantId: a.tenantId, date: a.to, bals: end, prepaid: await a.prepaidSplit?.(a.to) }) : [];
  const startMoves = whole ? await termMoves(db, { tenantId: a.tenantId, date: openingDate, bals: start, prepaid: await a.prepaidSplit?.(openingDate) }) : [];
  const e = evaluate(end, endMoves);
  const s = evaluate(start, startMoves);
  const assets = e.values.get('280') ?? 0;
  const sources = e.values.get('440') ?? 0;
  return {
    asOf: a.to,
    openingAsOf: a.from,
    rows: BALANCE_SHEET_LINES.map((def) => ({
      code: def.code,
      name: def.name,
      level: def.level,
      accounts: def.accounts ? def.accounts.join(', ') + (def.exclude ? ` (trừ ${def.exclude.join(', ')})` : '') : '',
      section: Number(def.code.slice(0, 3)) < 300 ? ('assets' as const) : ('sources' as const),
      closing: fromCents(e.values.get(def.code) ?? 0),
      opening: fromCents(s.values.get(def.code) ?? 0),
    })),
    totals: { assets: fromCents(assets), sources: fromCents(sources), difference: fromCents(assets - sources) },
    /** Lãi (+) / lỗ (−) chưa kết chuyển đã cộng vào chỉ tiêu 420b. */
    unclosedProfit: fromCents(e.unclosed),
    unmapped: e.unmapped,
    /** Phần chuyển ngắn hạn ↔ dài hạn tại ngày cuối kỳ và ngày trước đầu kỳ; requested > amount: số khai vượt số dư thực tế. */
    longTerm: {
      applied: whole,
      openingDate,
      closing: endMoves.map(({ cents, requested, ...m }) => ({ ...m, amount: fromCents(cents), requested: fromCents(requested) })),
      opening: startMoves.map(({ cents, requested, ...m }) => ({ ...m, amount: fromCents(cents), requested: fromCents(requested) })),
    },
  };
}
