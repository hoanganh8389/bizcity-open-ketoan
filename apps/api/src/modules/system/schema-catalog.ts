// @bizcity-layer P module-sdk
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10).
// [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5).
// [2026-10-30 11:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — MCP cho trợ lý AI: POST /mcp, công cụ sinh từ action, xác nhận trước khi ghi (PHASES 2.11, 2.12).
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — gói định khoản cài / xem trước / gỡ: bảng config_packs, cài = phát hành một bản chính sách (ADR-0009 Q-5).
/**
 * Danh mục bảng: nhóm, tên tiếng Việt, thuật ngữ kế toán, vai trò.
 * Màn "Kiến trúc & Nghiệp vụ" ghép danh mục này với cấu trúc đọc thật từ cơ sở dữ liệu
 * (cột, chú thích, khoá ngoại, trigger). Thêm bảng mới thì khai báo ở đây; bảng chưa khai báo
 * vẫn hiện trong nhóm "Khác".
 */

export interface SchemaGroup {
  key: string;
  label: string;
  /** Vị trí trong dòng chảy kế toán. */
  summary: string;
}

export interface SchemaTableInfo {
  group: string;
  label: string;
  /** Thuật ngữ kế toán tương ứng (nếu có). */
  term?: string;
  purpose: string;
  /** Thư mục code xử lý bảng (apps/api/src/modules/…). */
  module?: string;
}

export const SCHEMA_GROUPS: SchemaGroup[] = [
  { key: 'events', label: '① Sự kiện kế toán (đầu vào)', summary: 'Chứng từ gốc kéo / nhận từ hệ thống bán hàng (và số dư đầu kỳ, bút toán nhập trong ERP), lưu nguyên bản, có phiên bản, có cờ chờ định khoản. Mọi bút toán đều trỏ về đây.' },
  { key: 'rules', label: '② Quy tắc định khoản', summary: 'Ánh xạ sự kiện → tài khoản Nợ / Có. Tài khoản không viết cứng trong code mà tra theo thứ tự: lý do → nhóm hàng → loại thuế → hình thức thanh toán → mặc định.' },
  { key: 'ledger', label: '③ Sổ cái (chỉ thêm)', summary: 'Bút toán và dòng định khoản. Không sửa, không xoá: sai thì ghi số âm rồi ghi lại; bút toán đảo, trả hàng nối về bút toán gốc ở ledger_links. Số dư theo ngày cập nhật cùng giao dịch.' },
  { key: 'tax', label: '④ Sổ hoá đơn và thuế', summary: 'Danh sách hoá đơn bán ra / mua vào tách theo thuế suất; thông tin thuế kế toán bổ sung (kỳ kê khai, khấu trừ); tờ khai GTGT (lần đầu, bổ sung), quyết toán TNDN, thông tin người nộp thuế.' },
  { key: 'sales', label: '⑤ Số liệu bán hàng và kho', summary: 'Mọi lần hàng vào / ra kho (số lượng), giá vốn bình quân; dòng hàng và tiền thu của phiếu bán / trả lại đọc qua bảng ảo từ chứng từ đã định khoản. Dựng lại được từ sự kiện.' },
  { key: 'assets', label: '⑦ Tài sản và báo cáo năm', summary: 'Thẻ tài sản cố định, công cụ dụng cụ, chi phí trả trước và số trích từng tháng; phần dài hạn khai cho Báo cáo tình hình tài chính.' },
  { key: 'periods', label: '⑥ Kỳ và khoá sổ', summary: 'Kỳ kế toán theo tháng; khoá theo chi nhánh × loại chứng từ. Kỳ đã khoá thì không ghi, không sửa.' },
  { key: 'catalog', label: 'Danh mục', summary: 'Đối tượng mà định khoản nhắc tới: tài khoản, khách hàng / nhà cung cấp, hàng hoá, thuế, hình thức thanh toán, chiều phân tích.' },
  { key: 'platform', label: 'Nền tảng', summary: 'Đơn vị sử dụng, người dùng, khoá API, chi nhánh, nhật ký thao tác.' },
  { key: 'other', label: 'Khác', summary: 'Bảng kỹ thuật hoặc chưa khai báo nhóm.' },
];

export const SCHEMA_TABLES: Record<string, SchemaTableInfo> = {
  // ① Sự kiện
  accounting_events: { group: 'events', label: 'Sự kiện kế toán', term: 'Chứng từ gốc', module: 'documents', purpose: 'Mỗi phiếu nguồn (bán, hoàn, thanh toán khách hàng, nhập, chuyển kho…) là một dòng; payload giữ nguyên JSON đã gửi. doc_key chống trùng khi gửi lại. Cờ: status = pending và posted_version rỗng → mới, chờ định khoản; version > posted_version → đã sửa, chờ định khoản lại; posted / error / cancelled.' },
  accounting_event_versions: { group: 'events', label: 'Phiên bản cũ của sự kiện', term: 'Lịch sử chứng từ', module: 'documents', purpose: 'Bên gửi sửa phiếu thì gửi phiên bản mới; bản trước được cất ở đây để tra lại.' },
  cash_transfer_confirmations: { group: 'events', label: 'Xác nhận nhận tiền chuyển tiền', term: 'Kế toán xác nhận đã nhận tiền', module: 'documents', purpose: 'Kế toán xác nhận nơi nhận đã nhận tiền của phiếu chuyển tiền (gửi ở trạng thái đã chuyển), thay bước duyệt của HTsoft. Áp mỗi lần định khoản: ghi thêm bút toán nơi nhận nếu số tiền, chi nhánh nhận, ngân hàng nhận còn khớp lúc xác nhận.' },
  posting_log: { group: 'events', label: 'Nhật ký định khoản', term: 'Nhật ký định khoản', module: 'documents', purpose: 'Mỗi lần nhận, định khoản, định khoản lại, lỗi, huỷ một chứng từ ghi một dòng (bút toán ghi, số bút toán đảo, người làm). Chỉ ghi thêm, không sửa, không xoá.' },

  // ② Quy tắc
  posting_reasons: { group: 'rules', label: 'Lý do nhập / xuất', term: 'Nghiệp vụ', module: 'posting-config', purpose: 'Mỗi lý do (bán, trả lại, tặng, chuyển kho…) chỉ định tài khoản dùng khi định khoản.' },
  posting_policy_versions: { group: 'rules', label: 'Phiên bản chính sách kế toán', term: 'Chính sách kế toán', module: 'posting-config', purpose: 'Bản chụp cấu hình định khoản kèm ngày hiệu lực: chứng từ định khoản theo bản của ngày hạch toán, nên đổi chế độ không làm đổi số chứng từ cũ. Sửa cấu hình tự chụp bản bổ sung; đổi chế độ thì phát hành. Chỉ thêm.' },
  config_packs: { group: 'rules', label: 'Gói định khoản đã cài', term: 'Gói định khoản', module: 'posting-config', purpose: 'Gói theo ngành (lý do, nhóm hạch toán, tài khoản ngầm định, thuế, hình thức thanh toán) đã cài: cài có xem trước và phát hành một bản chính sách kế toán; gỡ chỉ ngừng dùng mã gói đã thêm mà chưa phát sinh.' },
  product_posting_groups: { group: 'rules', label: 'Nhóm hạch toán hàng hoá', module: 'posting-config', purpose: 'Nhóm hàng quyết định tài khoản doanh thu, giá vốn, kho riêng (ví dụ sữa bột khác đồ dùng).' },
  posting_defaults: { group: 'rules', label: 'Tài khoản ngầm định', module: 'posting-config', purpose: 'Tài khoản dùng khi các tầng trên không chỉ định (phải thu khách, thuế đầu ra…).' },
  closing_rules: { group: 'rules', label: 'Quy tắc kết chuyển', term: 'Kết chuyển cuối kỳ', module: 'closing', purpose: 'Thứ tự đổ doanh thu, chi phí về 911 rồi lãi lỗ về 421.' },
  closing_rule_versions: { group: 'rules', label: 'Lịch sử quy tắc kết chuyển', term: 'Kết chuyển cuối kỳ', module: 'closing', purpose: 'Mỗi lần sửa bộ quy tắc kết chuyển một phiên bản; chứng từ kết chuyển ghi số phiên bản đã chạy.' },

  // ③ Sổ cái
  ledger_entries: { group: 'ledger', label: 'Bút toán', term: 'Bút toán (journal entry)', module: 'ledger', purpose: 'Phiếu cha của bút toán: số liên tục, ngày ghi sổ, chi nhánh, loại chứng từ, số phiếu, trỏ về sự kiện. Một sự kiện sinh một hoặc vài bút toán; content_hash (dấu vân tay) để khi định khoản lại chỉ đảo bút toán có thay đổi.' },
  ledger_lines: { group: 'ledger', label: 'Dòng bút toán', term: 'Định khoản Nợ / Có', module: 'ledger', purpose: 'Mỗi dòng ghi một bên Nợ hoặc Có của một tài khoản. Tổng Nợ = tổng Có trong mỗi bút toán (cơ sở dữ liệu tự kiểm). Chỉ thêm.' },
  ledger_balances_daily: { group: 'ledger', label: 'Số phát sinh theo ngày', term: 'Số dư / phát sinh', module: 'ledger', purpose: 'Cộng dồn Nợ / Có theo chi nhánh × tài khoản × ngày × đối tượng, để báo cáo tổng hợp khỏi quét toàn bộ dòng sổ.' },
  ledger_entry_sequences: { group: 'ledger', label: 'Bộ đếm số bút toán', term: 'Đánh số liên tục', module: 'ledger', purpose: 'Cấp số bút toán liền mạch, không trùng, không nhảy số theo năm.' },
  document_sequences: { group: 'ledger', label: 'Bộ đếm số phiếu nhập tay', term: 'Đánh số chứng từ', module: 'vouchers', purpose: 'Cấp số cho chứng từ lập trong ERP (số dư đầu kỳ, phiếu kế toán).' },

  // ④ Thuế
  ledger_links: { group: 'ledger', label: 'Liên kết bút toán', term: 'Bút toán đảo, trả hàng ↔ bút toán gốc', module: 'ledger', purpose: 'Mỗi dòng nối một bút toán mới (đảo, trả hàng, điều chỉnh, quà tặng, thay thế) với bút toán gốc. Chỉ thêm, không sửa, không xoá; mỗi bút toán chỉ bị đảo một lần.' },
  contract_schedules: { group: 'catalog', label: 'Lịch thanh toán hợp đồng', term: 'Kỳ thanh toán', module: 'dimensions', purpose: 'Các kỳ thanh toán theo hợp đồng (thuê nhà, tín dụng, mua tài sản…): ngày đến hạn, số tiền, thuế nộp thay, đã trả hay chưa. Dùng để nhắc hạn.' },
  item_classes: { group: 'catalog', label: 'Phân loại hàng hoá', term: 'Nhãn / ngành / nhóm / loại hàng', module: 'products', purpose: 'Nhãn hàng, ngành hàng, nhóm hàng, loại hàng (có cha – con) gắn trên mặt hàng, để báo cáo phân tích theo nhóm hàng.' },
  debt_items: { group: 'ledger', label: 'Khoản công nợ', term: 'Công nợ theo chứng từ', module: 'debts', purpose: 'Mỗi (chứng từ, đối tượng, tài khoản theo dõi đối tượng) một khoản ghi Nợ hoặc ghi Có, có hạn thanh toán và số còn lại. Dựng lại được từ sổ: đồng bộ mỗi lần chứng từ ghi sổ, sửa, huỷ.' },
  debt_allocations: { group: 'ledger', label: 'Đối trừ công nợ', term: 'Thanh toán trừ vào khoản nào', module: 'debts', purpose: 'Ghép một khoản ghi Nợ với một khoản ghi Có cùng đối tượng, cùng tài khoản (thu tiền trừ hoá đơn nào, đặt cọc trừ hoá đơn nào). Có người ghép, ngày ghép; gỡ được.' },
  purchase_documents: { group: 'events', label: 'Chứng từ mua hàng', term: 'Phiếu mua hàng', module: 'mua-hang', purpose: 'Mọi chứng từ phía mua trong một bảng (đơn đặt, nhập mua, trả / đổi hàng, nhận / xuất quà, chi phí mua hàng, thưởng cuối kỳ, ứng trước, trả tiền), phân biệt bằng kind. Cột cho thứ cần lọc; data (jsonb) giữ dòng hàng, điều khoản, lịch trả, cảnh báo và vết chính sách lúc duyệt. Duyệt → ghi sổ qua cổng chứng từ (links giữ các chứng từ kế toán đã sinh).' },
  purchase_policies: { group: 'rules', label: 'Chính sách mua hàng', term: 'Điều kiện mua hàng', module: 'mua-hang', purpose: 'Chiết khấu, bậc số lượng, khuyến mại, CKTT, thưởng doanh số / chỉ tiêu / giai đoạn, hạn mức công nợ (phân bổ chi nhánh), điều khoản thanh toán, giá mua cố định, chỉ tiêu cung ứng, theo dõi lô: loại + phạm vi + hiệu lực + quy tắc (jsonb).' },
  stock_levels: { group: 'rules', label: 'Tồn max / min', term: 'Tồn max', module: 'mua-hang', purpose: 'Tồn max / min theo chi nhánh – kho – mã hàng (ĐVT nhỏ nhất): gốc của đề xuất chuyển hàng xuống shop và công thức đặt mua. Ghi từ màn Tồn max, nhập Excel, phiếu đăng ký đã duyệt.' },
  stock_sku_settings: { group: 'rules', label: 'Cài tồn max riêng từng mã', term: 'Tốc độ bán riêng', module: 'mua-hang', purpose: 'Riêng từng mã: số ngày đo tốc độ bán, số ngày cần đủ hàng, cách làm tròn khi chuyển (tự động / nguyên thùng / lẻ).' },
  stock_max_requests: { group: 'events', label: 'Phiếu đăng ký tồn max', term: 'Đăng ký tồn max', module: 'mua-hang', purpose: 'Shop đăng ký max mã có sẵn / chi nhánh đăng ký max hàng mới (bảng mặt hàng × shop); duyệt thì ghi tồn max.' },
  order_formulas: { group: 'rules', label: 'Công thức đặt hàng', term: 'Công thức đặt mua', module: 'mua-hang', purpose: 'Công thức tính SL cần nhập của từng chi nhánh cha: kho tính tồn / lấy max, các thành phần bật tắt, hệ số, số ngày bán dự phòng, làm tròn.' },
  transfer_requests: { group: 'events', label: 'Đề nghị chuyển hàng xuống shop', term: 'Đề nghị chuyển kho', module: 'mua-hang', purpose: 'Đề nghị chuyển từ kho chi nhánh cha xuống shop (tính theo tồn max − tồn − đi đường, làm tròn thùng); kho / POS quét để lên phiếu chuyển.' },
  supplier_products: { group: 'rules', label: 'Mặt hàng & giá mua của NCC', term: 'Bảng giá mua', module: 'mua-hang', purpose: 'NCC × mã hàng × ĐVT (chọn từ ĐVT của mặt hàng): mã hàng bên NCC, giá mua cố định gồm / chưa thuế, ngưỡng cảnh báo lệch, hiệu lực; NCC trống = giá chung. Lập đơn / phiếu tự điền ĐVT và giá, cảnh báo lệch giá.' },
  supplier_invoices: { group: 'events', label: 'Hoá đơn đầu vào của NCC', term: 'Hoá đơn NCC', module: 'mua-hang', purpose: 'Mỗi hoá đơn NCC gửi một dòng (mẫu số, ký hiệu, số, ngày, MST, tổng tiền) — nguồn gõ tay / Excel / AI / API. Đối soát với phiếu nhập cùng NCC + số hoá đơn. Chỉ huỷ, không xoá.' },
  supplier_invoice_lines: { group: 'events', label: 'Dòng hàng hoá đơn NCC', term: 'Dòng hoá đơn NCC', module: 'mua-hang', purpose: 'Dòng theo cách NCC ghi (mã / tên / ĐVT bên NCC, SL, giá chưa thuế, thuế suất) + mã, ĐVT bên mình đã nhận diện.' },
  supplier_item_aliases: { group: 'rules', label: 'Nhận diện mã hàng NCC', term: 'Mã hàng NCC đã học', module: 'mua-hang', purpose: 'Dữ liệu học: NCC × mã / tên / ĐVT bên NCC → mã + ĐVT bên mình; ghi khi người dùng chọn mã cho dòng hoá đơn, lần sau tự nhận.' },
  purchase_attachments: { group: 'rules', label: 'Tệp đính kèm mua hàng', term: 'Hồ sơ, chứng từ đính kèm', module: 'mua-hang', purpose: 'Hợp đồng, CO, CQ, báo giá, hoá đơn, biên bản… của nhà cung cấp, chứng từ mua hàng hay chính sách; nội dung tệp nằm trên ổ dữ liệu ERP, bảng giữ tên, loại, dung lượng, người gửi, thời gian.' },
  payment_requests: { group: 'events', label: 'Yêu cầu thanh toán', term: 'Đề nghị chi', module: 'payment-requests', purpose: 'Đề nghị chi tiền cho một đối tượng (từ khoản phải trả đang mở, kỳ thanh toán hợp đồng, hoặc khoản chưa ghi công nợ): nháp → chờ duyệt → duyệt một / hai cấp → lập phiếu chi. Giữ người lập, người duyệt, thời điểm.' },
  payment_request_settings: { group: 'rules', label: 'Cấu hình duyệt yêu cầu thanh toán', module: 'payment-requests', purpose: 'Số tiền từ bao nhiêu thì cần cấp duyệt thứ hai.' },
  reference_documents: { group: 'events', label: 'Chứng từ nguồn', term: 'Đơn đặt hàng, báo giá, phiếu nhập / xuất', module: 'reference-documents', purpose: 'Chứng từ của hệ thống mua hàng, bán hàng gửi sang để kế toán chọn khi lập phiếu đặt cọc, ghi tăng / giảm công nợ. Chỉ lưu, không ghi sổ.' },
  voucher_templates: { group: 'events', label: 'Bút toán mẫu', term: 'Phiếu mẫu', module: 'voucher-templates', purpose: 'Phiếu thu / chi / báo có / báo nợ / phiếu kế toán dựng sẵn (dòng TK Nợ / Có, đối tượng, chiều phân tích; số tiền có thể để 0) để lập nhanh hoặc lặp định kỳ.' },
  voucher_recurrences: { group: 'events', label: 'Bút toán lặp', term: 'Phiếu định kỳ', module: 'voucher-templates', purpose: 'Lịch sinh phiếu từ một bút toán mẫu: hằng tháng / quý / năm, ngày trong tháng, từ tháng – đến tháng, chi nhánh.' },
  voucher_recurrence_runs: { group: 'events', label: 'Kỳ đã sinh của bút toán lặp', term: 'Chống sinh trùng', module: 'voucher-templates', purpose: 'Mỗi (bút toán lặp, kỳ YYYY-MM) sinh đúng một phiếu; nối tới phiếu đã sinh.' },
  bank_accounts: { group: 'catalog', label: 'Tài khoản ngân hàng', term: 'Ngân hàng', module: 'bank-accounts', purpose: 'Ngân hàng, chi nhánh, số tài khoản, chủ tài khoản; mỗi tài khoản ngân hàng gắn một tài khoản kế toán 112 chi tiết. Hình thức thanh toán chuyển khoản trỏ về đây.' },
  partner_groups: { group: 'catalog', label: 'Nhóm đối tượng', term: 'Loại khách hàng / NCC', module: 'partners', purpose: 'Nhóm khách hàng, nhà cung cấp (khách lẻ, khách buôn, NCC hàng hoá, NCC tài sản / dịch vụ, chủ nhà…) để lọc, gom báo cáo theo nhóm.' },
  tax_invoices: { group: 'tax', label: 'Hoá đơn', term: 'Sổ hoá đơn', module: 'tax-invoices', purpose: 'Một dòng mỗi hoá đơn bán ra / mua vào, có trạng thái (hợp lệ, thay thế, điều chỉnh, huỷ). Không phải sổ kế toán mà là danh sách để kê khai.' },
  tax_info_patches: { group: 'tax', label: 'Bổ sung thông tin thuế', term: 'Thông tin thuế bổ sung', module: 'tax-info', purpose: 'Phần kế toán bổ sung cho hoá đơn của chứng từ (số, ký hiệu, ngày, người bán), kỳ kê khai, được khấu trừ hay không, chứng từ thanh toán không dùng tiền mặt. Áp lại mỗi lần chứng từ được ghi sổ lại.' },
  tax_invoice_lines: { group: 'tax', label: 'Dòng thuế suất của hoá đơn', term: 'Bảng kê thuế', module: 'tax-invoices', purpose: 'Tiền hàng và tiền thuế của hoá đơn tách theo thuế suất / nhóm kê khai.' },

  // ⑤ Bán hàng
  inventory_movements: { group: 'sales', label: 'Hàng vào / ra kho', term: 'Nhập – xuất kho', module: 'inventory', purpose: 'Mỗi dòng là một lần hàng vào (số lượng dương) hoặc ra (âm) một chi nhánh: nhập mua, trả nhà cung cấp, bán, khách trả, chuyển kho đi / đến, điều chỉnh. Nguồn của nhập xuất tồn và giá vốn bình quân.' },
  sales_lines: { group: 'sales', label: 'Dòng hàng bán (bảng ảo)', term: 'Chi tiết bán hàng', module: 'reports', purpose: 'Bảng ảo (view): dòng hàng của phiếu bán / trả lại, đọc thẳng từ payload phiên bản đã định khoản. Không lưu trùng dữ liệu.' },
  sales_payments: { group: 'sales', label: 'Tiền thu bán hàng (bảng ảo)', term: 'Thanh toán theo hình thức', module: 'reports', purpose: 'Bảng ảo (view): tiền thu / trả khách của phiếu bán, hoàn — kèm phiếu, phiếu thanh toán khách hàng trỏ về phiếu (invoiceDocKey), phần đối trừ đổi trả (DOITRU).' },
  posted_event_payloads: { group: 'events', label: 'Nội dung phiếu đã định khoản (bảng ảo)', module: 'documents', purpose: 'Bảng ảo (view): payload đúng phiên bản đã định khoản của mỗi sự kiện chưa huỷ; nguồn của sales_lines, sales_payments.' },
  inventory_costs: { group: 'sales', label: 'Giá vốn bình quân tháng', term: 'Tính giá xuất kho', module: 'inventory', purpose: 'Mỗi (nhóm tính giá = đơn vị hạch toán, mặt hàng, tháng) một dòng: tồn đầu, nhập tính giá, đơn giá bình quân, xuất, tồn cuối. Tính lại được từ hàng vào / ra kho.' },

  // ⑦ Tài sản, tờ khai, báo cáo năm
  asset_categories: { group: 'assets', label: 'Loại tài sản', module: 'assets', purpose: 'Tài khoản nguyên giá, tài khoản hao mòn / chờ phân bổ, tài khoản chi phí và số tháng ngầm định của một nhóm tài sản.' },
  assets: { group: 'assets', label: 'Thẻ tài sản', term: 'TSCĐ, CCDC, chi phí trả trước', module: 'assets', purpose: 'Mỗi tài sản cố định, công cụ dụng cụ đã xuất dùng hoặc khoản chi phí trả trước cần phân bổ: nguyên giá, ngày bắt đầu, số tháng, luỹ kế đầu, tài khoản, chi nhánh, khoản mục.' },
  asset_depreciations: { group: 'assets', label: 'Khấu hao, phân bổ từng tháng', term: 'Trích khấu hao', module: 'assets', purpose: 'Số trích của từng thẻ theo tháng và chứng từ "Khấu hao, phân bổ" đã ghi sổ. Tính lại tháng thì dòng của tháng đó được tính lại, bút toán cũ ghi số âm.' },
  asset_allocations: { group: 'assets', label: 'Phân bổ chi phí tài sản', module: 'assets', purpose: 'Chia số trích hằng tháng của một tài sản cho nhiều chi nhánh, tài khoản chi phí, khoản mục, bộ phận theo tỷ lệ phần trăm.' },
  asset_events: { group: 'assets', label: 'Lịch sử tài sản', term: 'Đánh giá lại, điều chuyển, kiểm kê', module: 'assets', purpose: 'Đánh giá lại (chênh lệch nguyên giá, luỹ kế, thời gian còn lại), điều chuyển chi nhánh, kết quả kiểm kê. Không tự ghi sổ cái; khấu hao các tháng sau đọc theo các sự kiện này.' },
  asset_depreciation_overrides: { group: 'assets', label: 'Sửa tay số trích', module: 'assets', purpose: 'Kế toán sửa số trích của một tài sản trong một tháng, kèm lý do và người sửa.' },
  cit_returns: { group: 'tax', label: 'Quyết toán thuế TNDN', term: 'Mẫu 03/TNDN', module: 'statements', purpose: 'Tờ khai quyết toán thuế thu nhập doanh nghiệp đã lưu theo năm: chỉ tiêu tính từ báo cáo kết quả kinh doanh và phần kế toán nhập tay (điều chỉnh tăng, giảm, lỗ chuyển, ưu đãi).' },
  taxpayer_profiles: { group: 'tax', label: 'Thông tin người nộp thuế', term: 'Người nộp thuế', module: 'statements', purpose: 'Tên, mã số thuế, địa chỉ, cơ quan thuế quản lý, đại lý thuế, người ký: in ở phần đầu các tờ khai.' },
  vat_returns: { group: 'tax', label: 'Tờ khai thuế GTGT', term: 'Mẫu 01/GTGT', module: 'statements', purpose: 'Tờ khai đã lưu theo kỳ (tháng / quý): toàn bộ chỉ tiêu, phần nhập tay; revision 0 là lần đầu, 1, 2… là các lần khai bổ sung (kèm giải trình 01/KHBS, tiền chậm nộp); kỳ sau lấy [43] của lần mới nhất làm [22].' },
  long_term_balances: { group: 'assets', label: 'Phân loại dài hạn', term: 'Ngắn hạn / dài hạn', module: 'statements', purpose: 'Phần dài hạn (còn trên 12 tháng) của số dư phải thu, phải trả, vay tại ngày lập báo cáo; Báo cáo tình hình tài chính chuyển số này sang chỉ tiêu dài hạn.' },

  // ⑥ Kỳ
  fiscal_periods: { group: 'periods', label: 'Kỳ kế toán', term: 'Kỳ', module: 'periods', purpose: 'Kỳ tháng trong năm tài chính; mỗi bút toán thuộc đúng một kỳ.' },
  period_locks: { group: 'periods', label: 'Khoá sổ', term: 'Khoá sổ', module: 'periods', purpose: 'Khoá kỳ theo chi nhánh, loại chứng từ; có ghi người khoá.' },
  cash_plans: { group: 'catalog', label: 'Kế hoạch thu chi', term: 'Kế hoạch tài chính', module: 'planning', purpose: 'Dự kiến thu / chi theo tháng, chi nhánh: nhập tay hoặc điền từ khoản công nợ đến hạn, lịch thanh toán hợp đồng; so với tiền thực vào / ra.' },
  cost_norms: { group: 'catalog', label: 'Định mức chi phí', term: 'Định mức', module: 'planning', purpose: 'Định mức chi phí theo tháng × chi nhánh × khoản mục để so với chi phí thực tế.' },
  document_signatures: { group: 'events', label: 'Chữ ký trên phiếu', term: 'Ký phiếu', module: 'signatures', purpose: 'Người lập, thủ quỹ, kế toán trưởng, giám đốc ký xác nhận phiếu trong phần mềm; gắn phiên bản phiếu lúc ký, sửa phiếu thì chữ ký cũ hết hiệu lực.' },
  authority_invoices: { group: 'tax', label: 'Hoá đơn từ cơ quan thuế', term: 'Hoá đơn trên cổng', module: 'authority-invoices', purpose: 'Hoá đơn mua vào / bán ra tải từ cổng hoá đơn điện tử (Excel, XML) để đối chiếu với sổ hoá đơn; không ghi sổ.' },
  risky_taxpayers: { group: 'tax', label: 'Người nộp thuế rủi ro', term: 'Doanh nghiệp rủi ro', module: 'authority-invoices', purpose: 'Người bán ngừng hoạt động, bỏ địa chỉ kinh doanh, rủi ro cao… để cảnh báo hoá đơn mua vào.' },
  period_lock_events: { group: 'periods', label: 'Nhật ký khoá / mở kỳ', term: 'Nhật ký khoá sổ', module: 'periods', purpose: 'Mỗi lần khoá hoặc mở một ô (kỳ, chi nhánh, loại chứng từ): người làm, lúc nào, lý do.' },

  // Danh mục
  accounts: { group: 'catalog', label: 'Hệ thống tài khoản', term: 'Tài khoản kế toán', module: 'accounts', purpose: 'Danh mục tài khoản (111, 131, 156, 511…), cấp cha con, bên số dư, có theo dõi đối tượng hay không.' },
  partners: { group: 'catalog', label: 'Đối tượng', term: 'Đối tượng công nợ', module: 'partners', purpose: 'Khách hàng, nhà cung cấp, nhân viên, nội bộ, khác (cột kind = vai trò chính, also_kinds = vai trò thêm: vừa là NCC vừa là khách hàng) — để theo dõi công nợ từng đối tượng trên 131, 331…' },
  products: { group: 'catalog', label: 'Hàng hoá', module: 'catalog', purpose: 'Danh mục hàng chuẩn: mã hàng (sku), tên, nhóm, barcode, ảnh, mô tả, cờ hàng chính / sữa < 24 tháng / không bán / xuất điều chỉnh, thuế, nhóm hạch toán. Hệ thống bán hàng kéo về qua /api/v1/catalog/feed.' },
  unit_names: { group: 'catalog', label: 'Danh mục đơn vị tính', term: 'Tên ĐVT (Hộp, Lốc, Lốc_4, Thùng…)', module: 'catalog', purpose: 'Tên ĐVT dùng chung, không có tỉ lệ: có sẵn danh sách khởi tạo; khai ĐVT mới ở mặt hàng thì CSDL tự thêm (trigger). Tỉ lệ quy đổi ở product_units.' },
  product_units: { group: 'catalog', label: 'Đơn vị tính của mặt hàng', term: 'ĐVT & tỉ lệ quy đổi', module: 'catalog', purpose: 'Mỗi mặt hàng một bộ đơn vị: 1 đơn vị = ratio × đơn vị nhỏ nhất (đúng một đơn vị ratio 1), đơn vị bán chính, khối lượng.' },
  price_lists: { group: 'catalog', label: 'Bảng giá bán', module: 'catalog', purpose: 'Bảng giá: đúng một bảng giá công ty (is_company) + các bảng giá chi nhánh / kênh.' },
  price_list_branches: { group: 'catalog', label: 'Chi nhánh áp bảng giá', module: 'catalog', purpose: 'Chi nhánh nào áp bảng giá nào (mỗi chi nhánh một bảng giá); chưa gán = bảng giá công ty.' },
  product_prices: { group: 'catalog', label: 'Giá bán theo ĐVT', module: 'catalog', purpose: 'Giá (đã gồm thuế) theo bảng giá × mặt hàng × đơn vị tính; trống = chưa khai giá.' },
  catalog_tombstones: { group: 'catalog', label: 'Mục danh mục hàng đã xoá', module: 'catalog', purpose: 'Dấu xoá (mặt hàng, ĐVT, dòng giá, bảng giá) để hệ thống bán hàng kéo thay đổi biết mà xoá theo.' },
  tax_codes: { group: 'catalog', label: 'Loại thuế', term: 'Thuế suất GTGT', module: 'tax-codes', purpose: 'Thuế suất, tài khoản thuế, nhóm trên bảng kê.' },
  payment_methods: { group: 'catalog', label: 'Hình thức thanh toán', module: 'posting-config', purpose: 'Tiền mặt, chuyển khoản, thẻ, QR… và tài khoản tiền tương ứng (111, 112, 113).' },
  dimensions: { group: 'catalog', label: 'Chiều phân tích', term: 'Khoản mục, bộ phận', module: 'dimensions', purpose: 'Các chiều gắn thêm vào dòng sổ (cột dims) để phân tích chi phí mà không phải sửa bảng.' },

  // Nền tảng
  tenants: { group: 'platform', label: 'Đơn vị sử dụng', module: 'access', purpose: 'Mỗi công ty dùng phần mềm là một đơn vị; mọi dữ liệu đều có tenant_id.' },
  users: { group: 'platform', label: 'Người dùng', module: 'access', purpose: 'Tài khoản đăng nhập và vai trò.' },
  print_template_settings: { group: 'platform', label: 'Cấu hình mẫu in', term: 'Mẫu in', module: 'print-templates', purpose: 'Bật / tắt mẫu in, mẫu mặc định, chỉnh tiêu đề, số liên, chức danh ký… theo đơn vị, chi nhánh hoặc người dùng (màn HT05). Chỉ lưu phần khác mặc định; bố cục mẫu nằm trong code giao diện.' },
  api_keys: { group: 'platform', label: 'Khoá API', module: 'access', purpose: 'Khoá cho hệ thống khác gửi sự kiện vào (chỉ lưu bản băm).' },
  accounting_units: { group: 'platform', label: 'Đơn vị hạch toán', module: 'branches', purpose: 'Pháp nhân / đơn vị lập báo cáo; chi nhánh thuộc một đơn vị hạch toán.' },
  branches: { group: 'platform', label: 'Chi nhánh / cửa hàng', module: 'branches', purpose: 'Mỗi cửa hàng là một chi nhánh; code là mã cửa hàng dùng để đối chiếu với hệ thống bán hàng.' },
  warehouses: { group: 'platform', label: 'Kho của chi nhánh', module: 'warehouses', purpose: 'Danh mục kho (DM12): mỗi kho thuộc một chi nhánh; mã kho đối chiếu dòng nhập xuất; kho mặc định nhận dòng không ghi mã kho.' },
  audit_logs: { group: 'platform', label: 'Nhật ký thao tác', module: 'access', purpose: 'Ai làm gì, lúc nào, dữ liệu trước / sau.' },
  mcp_confirm_tokens: { group: 'platform', label: 'Xác nhận thao tác của trợ lý AI', term: 'MCP xác nhận', module: 'system', purpose: 'Trợ lý AI (MCP) muốn ghi gì cũng phải xem trước rồi người dùng đồng ý: mỗi lần xem trước một token dùng một lần, 15 phút, gắn công cụ, người gọi, tham số.' },
  event_outbox: { group: 'platform', label: 'Sự kiện miền (outbox)', term: 'Outbox', module: 'system', purpose: 'Việc đã xảy ra (đã ghi sổ, đã khoá kỳ, danh mục đổi…) ghi cùng giao dịch với dữ liệu; sau commit mới giao cho các phần khác. Chỉ thêm, giữ 90 ngày.' },
  event_deliveries: { group: 'platform', label: 'Giao sự kiện', term: 'Delivery', module: 'system', purpose: 'Mỗi (nơi nhận, sự kiện) một dòng: chờ giao, đã xử lý, hoặc hết lượt thử (dead) — hiện ở tự chẩn đoán.' },
  event_consumptions: { group: 'platform', label: 'Sự kiện đã xử lý', term: 'Idempotent consumer', module: 'system', purpose: 'Dấu nơi nhận đã xử lý sự kiện: giao lại lần hai không làm lại việc.' },
  action_requests: { group: 'platform', label: 'Chống gửi lặp thao tác', term: 'Idempotency', module: 'system', purpose: 'Mỗi lần gọi action ghi kèm Idempotency-Key một dòng: băm nội dung + phản hồi. Gửi lại cùng khoá, cùng nội dung → trả đúng phản hồi cũ, không tạo trùng; khác nội dung → báo lỗi. Giữ 7 ngày.' },
  diagnostic_runs: { group: 'platform', label: 'Kết quả tự chẩn đoán', term: 'Chẩn đoán', module: 'system', purpose: 'Mỗi lần tự chẩn đoán (L1 sẵn sàng, L3 toàn vẹn sổ) một dòng: mã kiểm, mức, số chỗ sai, mẫu khoá chứng từ. Chạy khi gọi GET /system/diagnostics và trước khi khoá kỳ. Chỉ thêm, giữ 90 ngày.' },
  schema_migrations: { group: 'other', label: 'Lịch sử migration', purpose: 'Các tệp migrations/NNNN_*.sql đã áp vào cơ sở dữ liệu.' },
};

/** Giải thích trigger theo tên hàm trigger. */
export const TRIGGER_NOTES: Record<string, string> = {
  assert_entry_balanced: 'Kiểm lúc kết thúc giao dịch: tổng Nợ phải bằng tổng Có của bút toán, lệch một đồng là huỷ cả giao dịch.',
  forbid_ledger_mutation: 'Sổ cái chỉ được thêm: chặn sửa, xoá dòng đã ghi. Sai thì ghi số âm rồi ghi lại.',
  assert_negative_only_on_reversal: 'Số tiền âm chỉ được ghi trong bút toán ghi số âm (is_reversal = true).',
  forbid_ledger_truncate: 'Chặn xoá sạch bảng sổ cái bằng TRUNCATE.',
  forbid_diagnostic_run_update: 'Kết quả chẩn đoán chỉ được thêm: chặn sửa dòng đã ghi (R-DIAG-5).',
  unit_names_autoadd: 'Khai ĐVT ở mặt hàng (bất kỳ đường ghi nào: form, Excel, đồng bộ, dữ liệu mẫu) mà tên chưa có thì tự thêm vào Danh mục đơn vị tính (unit_names, nguồn auto).',
  unit_names_seed_tenant: 'Tạo đơn vị (tenant) mới thì tự có sẵn danh sách ĐVT thông dụng (Hộp, Lốc, Lốc_4, Thùng…).',
  guard_ledger_line_mutation: 'Sổ cái chỉ được thêm: chặn sửa, xoá dòng đã ghi. Ngoại lệ duy nhất: tính giá vốn ghi đè số tiền dòng chờ giá vốn (cost_fill) của bút toán còn hiệu lực, không đảo bút toán.',
};

/**
 * Giải thích mặc định cho các cột lặp lại ở nhiều bảng. Cột có COMMENT riêng trong cơ sở dữ liệu
 * thì dùng COMMENT đó; không có thì dùng câu ở đây.
 */
export const COLUMN_NOTES: Record<string, string> = {
  id: 'Khoá chính, số tự tăng. Chỉ dùng nội bộ; hệ thống khác đối chiếu qua cột mã (code, doc_key, sku…).',
  tenant_id: 'Đơn vị sử dụng (công ty) sở hữu dòng này. Mọi truy vấn đều lọc theo cột này.',
  branch_id: 'Chi nhánh / cửa hàng.',
  partner_id: 'Đối tượng công nợ (khách hàng, nhà cung cấp…).',
  period_id: 'Kỳ kế toán chứa ngày ghi sổ.',
  event_id: 'Sự kiện kế toán (chứng từ gốc) sinh ra dòng này.',
  entry_id: 'Bút toán chứa dòng này.',
  account_code: 'Mã tài khoản kế toán (111, 131, 511…).',
  parent_code: 'Mã tài khoản cấp cha.',
  revenue_account: 'Tài khoản doanh thu.',
  debit: 'Số tiền bên Nợ (cột trái).',
  credit: 'Số tiền bên Có (cột phải).',
  total: 'Tổng tiền.',
  amount: 'Số tiền.',
  amount_before_tax: 'Tiền hàng chưa thuế.',
  tax_amount: 'Tiền thuế GTGT.',
  tax_code: 'Mã loại thuế (thuế suất).',
  qty: 'Số lượng.',
  unit: 'Đơn vị tính.',
  sku: 'Mã hàng.',
  sign: '1 = bán / tăng; −1 = trả lại / điều chỉnh giảm.',
  direction: 'out = bán ra; in = mua vào.',
  doc_type: 'Loại chứng từ: sale (bán), sale_return (trả lại), receipt / payment (thu / chi tiền mặt), bank_receipt / bank_payment (báo có / báo nợ), manual (phiếu kế toán), opening (số dư đầu kỳ), closing (kết chuyển).',
  doc_no: 'Số chứng từ (số phiếu) in trên giấy.',
  doc_date: 'Ngày chứng từ.',
  posting_date: 'Ngày ghi sổ (quyết định kỳ kế toán).',
  invoice_no: 'Số hoá đơn.',
  line_no: 'Số thứ tự dòng.',
  year: 'Năm.',
  last_no: 'Số đã cấp gần nhất.',
  status: 'Trạng thái.',
  kind: 'Phân loại.',
  code: 'Mã (do người dùng đặt, duy nhất trong đơn vị).',
  name: 'Tên.',
  description: 'Diễn giải.',
  payload: 'Nội dung JSON gốc đúng như đã gửi.',
  is_active: 'Còn dùng hay đã ngừng.',
  received_at: 'Thời điểm nhận.',
  created_at: 'Thời điểm tạo.',
  updated_at: 'Thời điểm sửa gần nhất.',
  created_by: 'Người / khoá API tạo.',
  address: 'Địa chỉ.',
  phone: 'Điện thoại.',
  email: 'Email.',
  note: 'Ghi chú.',
  is_demo: 'Dữ liệu mẫu (nạp ở bản thử) — xoá được bằng "Xoá dữ liệu tình huống".',
  updated_by: 'Người sửa gần nhất.',
  created_by_name: 'Tên người tạo.',
  valid_from: 'Hiệu lực từ ngày (trống = không giới hạn).',
  valid_to: 'Hiệu lực đến ngày (trống = không giới hạn).',
  price_includes_vat: 'Giá đã gồm thuế GTGT (false = giá chưa thuế).',
  ncc_sku: 'Mã hàng bên nhà cung cấp (in trên báo giá / hoá đơn của họ) để đối chiếu.',
  approved_at: 'Thời điểm duyệt gần nhất.',
  uploaded_by: 'Người gửi tệp.',
  mime: 'Kiểu tệp (image/png, application/pdf…).',
  size: 'Dung lượng tệp (byte).',
  file_name: 'Tên tệp gốc.',
  owner_id: 'Mã đối tượng tệp gắn vào (mã NCC / id chứng từ / mã chính sách).',
  source: 'Nguồn tạo bản ghi.',
  ratio: 'Tỉ lệ quy đổi về ĐVT nhỏ nhất.',
  weight_kg: 'Khối lượng (kg).',
};
