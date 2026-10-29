# Cổng kết nối: đưa phiếu từ hệ thống bán hàng vào phần mềm kế toán

Tài liệu cho đội làm hệ thống bán hàng (multisite WordPress) và các hệ thống khác muốn đưa phiếu vào kế toán.

## 1. Mô hình

- Phiếu **mua, bán, trả lại, chuyển kho, điều chỉnh kho, thu chi theo đơn** lập ở hệ thống bán hàng. Phần mềm kế toán **không** có màn lập các phiếu đó.
- Phần mềm kế toán **không** lưu bảng riêng cho từng loại phiếu. Mỗi phiếu là một dòng chứng từ (`accounting_events`), toàn bộ nội dung nằm trong JSON (`payload`), có nguồn (`source_system`), phiên bản và vết định khoản.
- Phiếu vào trạm **Định khoản tự động (ACC14)** ở trạng thái **Chờ định khoản**. Kế toán bấm từng dòng, **xem trước** các bút toán sẽ ghi, thấy đúng mới định khoản (theo lô được). Phiếu đã định khoản thì định khoản lại được (bút toán cũ ghi số âm, không xoá).
- Danh mục kế toán (chi nhánh, lý do, loại thuế, hình thức thanh toán, mặt hàng, đối tượng) lấy qua API của phần mềm kế toán, để hệ thống bán hàng gửi **đúng mã**.

Có hai đường đưa phiếu vào, dùng đường nào cũng được (cùng một khuôn chứng từ):

| Đường | Ai gọi | Khi nào dùng |
|---|---|---|
| **Kéo** (ưu tiên) | Trạm ACC14 gọi đường dẫn của hệ thống bán hàng (cấu hình ở nút **Kết nối**) | Kế toán chủ động; tự kéo khi mở màn; kéo lại an toàn |
| **Đẩy** vào cổng chờ | Hệ thống bán hàng gọi `POST /api/v1/documents` (hoặc `/batch`, tối đa 200 phiếu) bằng khoá API | Đẩy ngay khi phiếu chốt |

## 1b. Đẩy tức thời (đường chính)

Hệ thống bán hàng gửi từng phiếu NGAY khi lưu / sửa / duyệt / xoá (multisite: `TGS_Acc_Events` trong cầu nối) bằng khoá API:
`POST /api/v1/documents/batch` (phiếu mới / phiên bản mới), `POST /api/v1/documents/cancel` (phiếu không còn).

- Chứng từ đẩy vào được chuẩn hoá như chứng từ kéo của kết nối cùng mã nguồn (`sourceSystem` = mã kết nối): áp cột "Đổi hình thức".
- **Chế độ định khoản** từng loại chứng từ (nút "Chế độ định khoản" ở ACC14):
  - *Tự động định khoản*: vào sổ luôn; phiên bản mới thì định khoản lại phần thay đổi; nguồn báo xoá thì tự huỷ (ghi số âm).
  - *Vào cổng chờ* (mặc định): lưu, chờ kế toán định khoản ở trạm; nguồn báo xoá thì vào "Chờ huỷ".
- Thẻ **Tự động định khoản** ở ACC14 (`GET /api/v1/documents?status=auto`): chứng từ có phiên bản đang trong sổ do khoá API tự ghi.
- Sổ thuế (BOOK_MODE=tax) cũng nhận đẩy tức thời từ cùng hệ thống nguồn (khoá API riêng): chỉ phiếu bán / hoàn có số hoá đơn; phiếu khác gửi nhầm sang thì bỏ qua (trả unchanged).
- Mở ACC14 KHÔNG tự kéo; nút **Kéo chứng từ** chỉ để lấy phiếu cũ / bù phiếu sót (phiếu kéo về luôn vào cổng chờ).

## 2. Đầu chuẩn (đường Kéo) — việc hệ thống bán hàng phải dựng

```
GET <đường dẫn cổng>?from=YYYY-MM-DD&to=YYYY-MM-DD[&cursor=…]
Authorization: Bearer <khoá>
```

Trả về:

```json
{
  "documents": [ { …chứng từ theo khuôn ở mục 4… } ],
  "cancelled": [ { "docKey": "btsoft:3:receipt:672", "reason": "Phiếu đã xoá ở hệ thống bán hàng" } ],
  "nextCursor": "chuỗi để lấy trang sau, hoặc null"
}
```

`cancelled` (không bắt buộc): phiếu đã gửi trước đây nay đã xoá ở nguồn → phần mềm **không tự huỷ**: chứng từ về cổng chờ ACC14 ở trạng thái **Chờ huỷ** (sổ giữ nguyên); kế toán xem trước rồi định khoản thì mới huỷ (bút toán ghi số âm, bỏ khỏi kho, sổ hoá đơn, gỡ công nợ đã ghép). Nguồn gửi lại phiếu (phiên bản mới) thì bỏ trạng thái Chờ huỷ. `POST /api/v1/documents/cancel` gọi bằng khoá API cũng chỉ đưa về Chờ huỷ.

- Trả các phiếu **đang chờ đẩy sang kế toán**: ngày phiếu trong khoảng `from`–`to`, **cộng phiếu bị sửa trong khoảng** dù thuộc ngày trước (với `version` mới).
- Mỗi trang tối đa vài trăm phiếu; còn thì trả `nextCursor`, phần mềm gọi tiếp với `&cursor=…`.
- Bọc `{ "data": { "documents": …, "nextCursor": … } }` cũng được.
- Sai khoá trả 401; lỗi khác trả mã HTTP lỗi kèm nội dung — kế toán thấy nguyên văn lời báo.

**Báo nhận.** Sau mỗi trang, phần mềm gọi lại **cùng đường dẫn** bằng `POST`:

```json
{
  "received": [ { "docKey": "wp:26001:10:501", "version": 3, "status": "received" } ],
  "rejected": [ { "docKey": "wp:26001:10:bad", "message": "Sai khuôn: lines: Required" } ],
  "cancelled": [ { "docKey": "btsoft:3:receipt:672" } ]
}
```

`status` là `received` (đã lưu, chờ định khoản) hoặc `unchanged` (đã có đúng phiên bản này). Hệ thống bán hàng dùng để đánh dấu phiếu đã vào cổng chờ, và hiện lý do phiếu bị từ chối. Không cần thì trả 404/405, phần mềm bỏ qua.

**Đã có sẵn ở tgs_wordpress**: plugin `tgs_accounting_bridge` (lớp `TGS_Acc_Gate`) dựng đường dẫn `/wp-json/tgs-acc/v1/pending` theo đúng đầu chuẩn này — mỗi trang một shop, hiện trả phiếu bán (kể cả bill Z), phiếu hoàn, phiếu thu / phiếu chi trả khách (mỗi phiếu một chứng từ thanh toán riêng), phiếu bị sửa sau ngày của nó, danh sách phiếu đã xoá; báo nhận ghi vào nhật ký gửi của plugin. Đường dẫn và khoá xem ở WordPress: Quản trị → Kế toán → Cổng kế toán → Cài đặt. Loại phiếu khác thêm vào `TGS_Acc_Pusher::build()`.

**Máy local** (ERP chạy Docker, WordPress chạy XAMPP cùng máy): đường dẫn dùng `http://host.docker.internal/tgs_wordpress/wp-json/tgs-acc/v1/pending` (trong container, `localhost` là chính container); wp-config.php local có 2 dòng coi `host.docker.internal` như `localhost` vì multisite chỉ nhận tên miền đã khai.

## 3. Danh mục kế toán (để gửi đúng mã)

Gọi bằng khoá API (`Authorization: Bearer <khoá API của phần mềm kế toán>`):

| Danh mục | API |
|---|---|
| Chi nhánh | `GET /api/v1/branches` |
| Lý do | `GET /api/v1/posting/reasons` |
| Loại thuế | `GET /api/v1/tax-codes` |
| Hình thức thanh toán | `GET /api/v1/posting/payment-methods` |
| Mặt hàng | `GET /api/v1/products` |
| Đối tượng | `GET /api/v1/partners` |

Mã chưa có thì phiếu vẫn vào cổng chờ nhưng **xem trước báo lỗi** (ví dụ "Hình thức thanh toán … chưa khai báo"); kế toán khai bổ sung rồi định khoản.

**Hình thức thanh toán chi tiết.** Mỗi hình thức gắn một tài khoản ngân hàng (QR, quẹt thẻ, chuyển khoản từng ngân hàng), nên phiếu thu phải gửi đúng hình thức chứ không gộp "chuyển khoản". Hệ thống bán hàng lấy **tên hình thức** trên phiếu thu, bỏ dấu, IN HOA, khoảng trắng thành `-`: `QR VTB CT` → `QR-VTB-CT`, `VietQR MBB CT-Z` → `VIETQR-MBB-CT-Z`, `POS AGR CT` → `POS-AGR-CT`; `Tiền mặt` → `TM`, `Chuyển khoản` → `CK`. Bên nguồn đặt tên khác danh mục thì khai ở cột **Đổi hình thức** của kết nối (ACC14 → Kết nối), mỗi dòng `MÃ NGUỒN=MÃ HÌNH THỨC` (ví dụ `QR-DI-BIDB=QR-VTB-CT`); áp cho mã hình thức của phiếu thanh toán và từng khoản thu kèm phiếu khi kéo về.

## 4. Khuôn chứng từ (`IngestDocument`)

Định nghĩa đầy đủ: `packages/contracts/src/documents.ts`. Phần chung:

| Trường | Ý nghĩa |
|---|---|
| `docType` | `sale`, `sale_return`, `purchase`, `purchase_return`, `transfer`, `stock_adjustment`, `cash_transfer`, `customer_payment`, `supplier_payment` |
| `docKey` | Khoá **duy nhất, ổn định** của phiếu ở nguồn. Gợi ý: `wp:<mã shop>:<loại phiếu>:<id phiếu>` |
| `version` | Tăng mỗi lần phiếu sửa. Cùng `version` gửi lại → bỏ qua. `version` mới → chờ định khoản lại |
| `branchCode`, `docNo`, `docDate` | Chi nhánh (mã ở kế toán), số phiếu, ngày phiếu |
| `partner`, `employee`, `invoice` | Đối tượng, nhân viên, hoá đơn đã phát hành (có thì lên sổ hoá đơn, bảng kê) |
| `internalOnly` | Phiếu nội bộ: không lên sổ hoá đơn, không chuyển sang cơ sở dữ liệu thuế |
| `sourceRef` | **Đánh dấu phiếu gốc**: `{ "type": "sale_order", "id": "501", "label": "Phiếu bán hàng", "url": "https://…/phieu/501" }` — kế toán lọc theo loại phiếu nguồn, bấm mở phiếu gốc |
| `lines`, `payments`, `totals` | Dòng hàng (tiền đã chốt, đúng như hoá đơn), khoản thu / trả kèm phiếu, tổng |

Số tiền là số **đã chốt** ở nguồn; kế toán không tính lại thuế, chỉ kiểm tổng và định khoản theo cấu hình.

## 5. Phiếu của multisite → loại chứng từ

`local_ledger_type` theo `tgs_shop_management/includes/class-tgs-constants.php`:

**Kéo theo chi nhánh:** ACC14 gửi `shops=<mã chi nhánh,…>` (mã tham chiếu của chi nhánh, không có thì mã chi nhánh) — cổng chỉ quét đúng các cửa hàng đó (mã site; mã có đuôi chữ như 08016Plus khớp site 08016; hoặc tên site). Chưa chọn chi nhánh thì ACC14 không tự kéo.

**Chỉ phiếu đã duyệt** (`local_ledger_approver_status = 1`) mới vào cổng chờ — mọi loại phiếu (bán, hoàn, thu, chi, nhập mua, trả NCC, điều chỉnh…); phiếu chuyển kho theo trạng thái duyệt xuất / duyệt nhận của từng đầu; phiếu thu / chi còn đòi phiếu cha đã duyệt. Phiếu đã gửi mà sau đó bị xoá **hoặc bị bỏ duyệt** → báo huỷ (ERP để ở trạng thái Chờ huỷ).

| Phiếu multisite | `docType` | Ghi chú |
|---|---|---|
| 10 Phiếu bán hàng (+ 2 phiếu xuất ngầm) | `sale` | **Không kèm tiền thu** (`payments: []`). Bill Z → `internalOnly: true` |
| Đổi trả: đơn bán (10) có dòng `payment_receipts` **offset_netting** (đối trừ với phiếu hoàn) | `sale` + `offsets: [{ docKey: phiếu hoàn, amount }]` | **Không phải tiền thật**: phiếu thu kỹ thuật `doi_tru` KHÔNG gửi thành chứng từ thu tiền; kế toán chỉ đối trừ công nợ giữa phiếu hoàn và đơn mới. Phần khách trả thêm là phiếu thu thật |
| 7 Phiếu thu của đơn (cha = 10) | `customer_payment` | **Mỗi phiếu thu một chứng từ riêng**, ngày = ngày thu, số = mã phiếu thu, `lines[{ amount, invoiceDocKey: docKey phiếu bán }]` → công nợ tự đối trừ đúng hoá đơn |
| 11 Phiếu hoàn hàng từ khách | `sale_return` | `originalDocKey` = `docKey` phiếu bán gốc. Không kèm tiền trả |
| 8 Phiếu chi trả khách (cha = 11) | `customer_payment` + `direction: "out"` | Chứng từ riêng, `invoiceDocKey` = docKey phiếu hoàn |
| 1 Phiếu nhập kho mua của NCC — **không có phiếu cha** (màn "Tạo phiếu nhập kho", mã NK-…) | `purchase` (docKey `btsoft:{blog}:purchase:{id}`) | Đã gửi. Chỉ phiếu đã duyệt. Nhà cung cấp = mã NCC (danh mục NCC chung; trống → NCC lẻ); lý do = `advance_meta.import_reason.code` (NMH1); số hoá đơn = `code_source`, ký hiệu / ngày ở `advance_meta.invoice`; hạn thanh toán = `payment_due_date`. Tiền dòng: số lượng (ĐVCB) × đơn giá − chiết khấu dòng, thuế = tiền thuế của dòng, tròn đồng từng dòng. Phiếu nhập có phiếu cha (nhập ngầm của phiếu mua) và phiếu giả lập tồn (DCTEST…) không gửi |
| 16 Phiếu trả hàng NCC (màn "Tạo phiếu trả hàng NCC", mã PRN-…) | `purchase_return` (docKey `btsoft:{blog}:supplier-return:{id}`) | Đã gửi. Lý do XTR1; dòng hàng của chính phiếu, không có thì lấy ở phiếu xuất kho con; phiếu cha là phiếu nhập kho đã gửi thì `originalDocKey` trỏ về nó. Tiền NCC hoàn lại (phiếu thu con) chưa gửi |
| 9 Phiếu mua hàng (+ 1 phiếu nhập ngầm) | `purchase` | Chưa gửi. Hoá đơn đầu vào → `invoice` |
| Phiếu chuyển kho (bảng global `wp_global_transfer`: MỘT phiếu cho hai đầu, kho / phân kho đi → website / chi nhánh / phân kho đến) — **đầu xuất** | `transfer` + `leg: "out"` (docKey `btsoft:{blog đi}:gt-out:{transfer_id}`) | Đã gửi khi bên đi **duyệt xuất** (ngày phiếu). Shop xuất ghi Nợ 1579 / Có 156, thẻ kho −SL. `branchCode` = chi nhánh của đầu đi ghi trên phiếu, `toBranchCode` = chi nhánh đầu đến; mã kho từng dòng = phân kho đi. `extra.transferGroup` = mã phiếu chuyển kho (ghép hai đầu ở Bảng kê chuyển kho). Bỏ duyệt xuất / xoá phiếu / bên nhận từ chối → huỷ chứng từ |
| Phiếu chuyển kho — **đầu nhận** | `transfer` + `leg: "in"` (docKey `btsoft:{blog đến}:gt-in:{transfer_id}`) | Đã gửi khi bên đến **duyệt nhận** (ngày duyệt nhận; SL = SL thực nhận). Shop nhận ghi Nợ 156 / Có 1579, thẻ kho +SL; `fromBranchCode` = chi nhánh đầu đi; mã kho từng dòng = phân kho đến. Chỉ gửi **số lượng** (`amount: 0`): tính giá vốn tháng định giá đầu nhận theo bên gửi → 1579 về 0. Đã xuất mà chưa có đầu nhận = hàng đang đi đường. Bỏ duyệt nhận / xoá → huỷ chứng từ. Chưa có lý do chuyển kho (dùng lý do mặc định) |
| 21 Phiếu điều chỉnh (màn "Phiếu điều chỉnh mới", loại = Điều chỉnh tồn kho, meta `edit_type = "inventory"`) | `stock_adjustment` (docKey `btsoft:{blog}:adjust:{id}`) | Đã gửi. Mỗi dòng = chênh lệch số lượng **có dấu** (+ thừa / − thiếu); cùng dấu → `direction` increase / decrease, lẫn lộn → `mixed` (dấu từng dòng quyết định: + Nợ 156 / Có 3381, − Nợ 1381 / Có 156). Chỉ gửi số lượng, giá trị định khi tính giá vốn tháng. Điều chỉnh giá, công nợ, doanh thu không gửi. Chưa có lý do (dùng mặc định) |
| 2 Phiếu xuất KHÔNG có phiếu cha (màn "Tạo phiếu xuất" mã XSD-…; POS "Phiếu xuất điều chỉnh") | `sale` nội bộ (`internalOnly: true`, docKey `btsoft:{blog}:export-adjust:{id}`, `extra.exportAdjust`) | Đã gửi. Xuất dùng nội bộ, tặng, dùng thử, huỷ hỏng… (bill giấy, không hoá đơn điện tử). `reasonCode` = lý do xuất (advance_meta `import_reason.code`; phiếu POS lấy từ ghi chú đề nghị `wp_global_po_adjustment`). Lý do quyết định đối ứng / chi phí (XSD1 → 64128, XMKT1 → 64184, XHH01 → 6328). Đơn giá thường 0: chỉ có giá vốn khi tính giá vốn tháng (Nợ TK chi phí của lý do / Có kho). Phiếu xuất ngầm của đơn bán luôn có phiếu cha nên không lấy. Không tính vào báo cáo bán hàng (lọc `extra.exportAdjust`); xem ở màn Phiếu xuất điều chỉnh (BH06, phân hệ Bán hàng) |
| 5 Kiểm kê, 6 Hàng hỏng | `stock_adjustment` | Chưa gửi (chưa thấy dữ liệu) |
| 7 / 8 Thu / chi độc lập (không thuộc đơn) | `customer_payment` / `supplier_payment` | Thu nợ khách, trả nợ nhà cung cấp (không có `invoiceDocKey` thì phần mềm tự đối trừ theo hạn cũ trước) |
| 20 Sinh mã định danh | — | Không đưa sang kế toán |

## 6. WooCommerce

Kiểu kết nối **WooCommerce**: địa chỉ cửa hàng + consumer key / secret (REST API v3), chi nhánh nhận đơn, loại thuế mặc định. Đơn `processing`, `completed`, `on-hold` thành hoá đơn bán (`docKey` `woo:<mã kết nối>:<id đơn>`, phí giao hàng một dòng, đơn đã thanh toán có khoản thu theo cổng thanh toán). Đơn huỷ, hoàn tiền, thất bại không kéo. Hoàn tiền một phần chưa hỗ trợ.

## 7. Cơ sở dữ liệu thuế (VAT) riêng

Cơ sở dữ liệu thuế là một bản phần mềm kế toán độc lập. Cổng sang bên đó chỉ đưa **phiếu bán, phiếu trả lại có hoá đơn** (`invoice` có số, `internalOnly = false`), cùng khuôn chứng từ ở trên.

## Sổ thuế (BOOK_MODE=tax)

Một bản cài riêng (thư mục, Docker, cơ sở dữ liệu riêng) đặt `BOOK_MODE=tax` trong `.env`:

- Kéo cổng chờ kèm `consumer=tax` (cả lúc kéo và lúc báo nhận). Nguồn giữ **nhật ký gửi riêng** cho sổ thuế
  (`{base_prefix}tgs_acc_push_log_tax`), nên sổ thuế báo nhận không làm sổ nội bộ mất chứng từ và ngược lại.
- Cổng chờ chỉ trả **phiếu bán / hoàn có số hoá đơn điện tử**, không phải phiếu nội bộ, hoá đơn chưa huỷ. ERP lọc lại
  một lần nữa. Kết nối WooCommerce không kéo.
- Thanh trên cùng hiện nhãn **SỔ THUẾ**; `GET /api/v1/system/health` trả `bookMode`.
- Bắt đầu lại từ đầu: `bash ./scripts/xoa-chung-tu.sh` (chỉ chạy khi `BOOK_MODE=tax`; sao lưu trước, xoá chứng từ, sổ,
  thẻ kho, công nợ, giá vốn, tờ khai, khoá sổ; giữ danh mục, kết nối, người dùng).
- Bản plugin WordPress phải có cổng chờ hỗ trợ `consumer` **trước khi** sổ thuế kéo; bản cũ bỏ qua tham số này và sổ
  thuế sẽ báo nhận vào nhật ký của sổ nội bộ.
