# NT-KHO-002 · Kiểm kê kho: biên bản kiểm kê → biên bản xác minh → quyết định xử lý chênh lệch
<!-- [2026-11-12 kiennt] NGHIEM-THU — tạo phiếu. -->
<!-- [2026-11-12 kiennt] NGHIEM-THU — sửa theo tài liệu "Mô tả chi tiết nghiệp vụ mua bán hàng hoá thương mại" (phân hệ Kho bước 7–8, bảng hạch toán kho dòng 9, 20, 24–28): ba chứng từ, đếm theo lô / HSD, hàng kém phẩm chất chuyển kho cách ly, tất toán 1381 / 3381 theo quyết định. -->

| | |
|---|---|
| Phân hệ | kho |
| Màn hình | KHO02 (Kiểm kê kho) — mới |
| Bộ phận yêu cầu | Kho / Phòng kế toán |
| Ngày tạo | 12/11/2026 |
| Trạng thái | Đã chốt (12/11/2026, kiennt — bản sửa theo tài liệu nghiệp vụ) · Chờ nghiệm thu (còn lệch: HSD lô, in 05-VT) |
| Căn cứ nghiệp vụ | Tài liệu "Mô tả chi tiết nghiệp vụ mua bán hàng hoá thương mại", mục 4 Phân hệ Kho (bước 7 Kiểm kê, bước 8 Xử lý chênh lệch) và bảng hạch toán nghiệp vụ kho dòng 9, 20, 24–28 |

## 1. Mục đích quản trị
Đếm thực tế một kho tại một ngày **theo từng lô / hạn dùng**, so với sổ, rồi xử lý chênh lệch đúng ba bước của tài liệu nghiệp vụ:
**Biên bản kiểm kê → Biên bản xác minh → Quyết định xử lý**, dữ liệu ba chứng từ đồng bộ với nhau.

- Bước 1 chỉ ghi nhận chênh lệch **chưa rõ nguyên nhân** vào 1381 / 3381 — **không ghi ngay vào chi phí**.
- Hàng kém / mất phẩm chất **không ghi giảm 156**: chuyển sang kho cách ly để theo dõi (dòng 20 của tài liệu).
- Bước 3 tất toán 1381 / 3381 theo quyết định: bồi thường, tính vào chi phí, thuộc doanh nghiệp, hoặc do ghi thiếu phiếu nhập.
- Kiểm kê cập nhật lại hạn dùng thực tế của lô → báo cáo hàng cận date chính xác hơn.

Làm ngoài lõi: biên bản ở phân hệ Kho; chứng từ sổ dùng loại có sẵn — phiếu điều chỉnh tồn (`stock_adjustment`), phiếu chuyển kho
(`transfer`), phiếu kế toán (`manual_journal`). Khi lõi có loại chứng từ kiểm kê (S032-19) thì chuyển sang, biên bản giữ nguyên.

**Ngoài phạm vi phiếu này** (phiếu riêng sau khi chốt Q06 của tài liệu): kế hoạch kiểm kê và phân công việc; 12 loại kho theo công
dụng; tiêu huỷ hàng hỏng / hết hạn theo quyết định; KPI tỷ lệ chênh lệch kiểm kê.

## 2. Khai báo trước
- Chi nhánh CN-A: kho `KA-1` (mặc định, hàng kinh doanh), kho `KA-CL` (kho cách ly — kho thường, đơn vị tự đặt tên).
- Mặt hàng `HANG01` (Hộp, quản lý lô), `HANG02` (Gói, quản lý lô), `HANG03` (Chai, không lô).
- Danh mục lý do (ACC18) có sẵn: `NDC` kiểm kê thừa (TK 3381), `XDC` kiểm kê thiếu (TK 1381).
- Đơn vị khai thêm 4 lý do phiếu kế toán dùng cho quyết định xử lý (dữ liệu của đơn vị, không cài cứng):

| Mã gợi ý | Tên | Nợ | Có |
|---|---|---|---|
| `KKBT` | Thiếu kiểm kê — cá nhân bồi thường | 1388 | 1381 |
| `KKCP` | Thiếu kiểm kê — tính vào chi phí | 632 | 1381 |
| `KKTN` | Thừa kiểm kê — thuộc doanh nghiệp | 3381 | 711 |
| `KKTH` | Thu tiền bồi thường | 111 | 1388 |

- Màn Kiểm kê có ô cài đặt: kho cách ly mặc định của chi nhánh (CN-A → `KA-CL`); bốn lý do trên dùng cho hướng xử lý nào.

## 3. Các bước thao tác

**Bước 1 — Biên bản kiểm kê**
1. Kho → Kiểm kê kho → Thêm. Chi nhánh CN-A, kho `KA-1`, ngày kiểm kê 30/11/2026, mục đích "Kiểm kê cuối tháng 11".
2. **Lấy số tồn**: phần mềm điền mọi mặt hàng × lô có tồn hoặc có phát sinh ở `KA-1` đến hết 30/11 (mã, tên, lô, HSD trên sổ, *Theo sổ*).
3. Nhập *Theo kiểm kê* và phẩm chất (Còn tốt / Kém phẩm chất / Mất phẩm chất) từng lô; sửa *HSD thực tế* nếu khác nhãn;
   thêm lô đếm được mà sổ không có. Gõ tay hoặc **Nhập kết quả từ Excel** (Mã hàng, Số lô, HSD, Số lượng, Phẩm chất, Ghi chú).
4. Thành viên tham gia (Họ tên, Chức danh, Đại diện), kết luận; đính kèm ảnh biên bản ký tay (NT-QUY-001). **Ghi** (chưa đụng sổ).
5. **Ghi nhận chênh lệch**: phần mềm sinh (a) phiếu điều chỉnh tồn cho chênh lệch số lượng; (b) phiếu chuyển kho `KA-1` → `KA-CL`
   cho hàng kém / mất phẩm chất. Biên bản → *Đã ghi nhận chênh lệch*.

**Bước 2 — Biên bản xác minh**
6. Từ biên bản kiểm kê bấm **Lập biên bản xác minh**: mỗi dòng chênh lệch chọn nguyên nhân — Chưa rõ · Cá nhân bồi thường
   (người, số lượng) · Hao hụt được tính vào chi phí · Thừa thuộc doanh nghiệp · Do ghi thiếu phiếu nhập (số phiếu nhập) — và ghi chú.
   Một dòng tách được nhiều nguyên nhân, tổng số lượng = chênh lệch. Đính kèm hồ sơ xác minh. Ghi.

**Bước 3 — Quyết định xử lý chênh lệch**
7. Từ biên bản xác minh bấm **Lập quyết định xử lý**: số quyết định, ngày, người ký; các dòng lấy từ xác minh (sửa được trước khi ghi).
8. **Ghi quyết định** → phần mềm sinh phiếu kế toán tất toán 1381 / 3381 theo lý do của từng hướng. Ba chứng từ trỏ qua lại nhau.

## 4. Số liệu đầu vào

Thẻ kho `KA-1` đến 30/11/2026; đơn giá bình quân tháng 11/2026 (sau tính giá vốn): HANG01 = 10.000 đ, HANG02 = 5.000 đ.

| Mã hàng | Lô | HSD trên sổ | Theo sổ | Theo kiểm kê | Phẩm chất | HSD thực tế |
|---|---|---|---|---|---|---|
| HANG01 | L01 | 31/03/2027 | 80 | 80 | Còn tốt 78, kém phẩm chất 2 | 31/03/2027 |
| HANG01 | L02 | 31/12/2026 | 40 | 38 | Còn tốt 38 | 15/12/2026 |
| HANG02 | M01 | 30/06/2027 | 50 | 53 | Còn tốt 53 | 30/06/2027 |
| HANG03 | — | — | 10 | 10 | Còn tốt 10 | — |

Biên bản xác minh: HANG01 thiếu 2 → 1 do thủ kho Nguyễn Văn A làm vỡ (bồi thường), 1 hao hụt được tính vào chi phí.
HANG02 thừa 3 → thuộc doanh nghiệp. Quyết định QĐ-KK-01 ngày 05/12/2026 duyệt đúng như xác minh.

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:**

| Mục | Mong đợi |
|---|---|
| Chênh lệch theo lô | HANG01/L01 0 · HANG01/L02 −2 · HANG02/M01 +3 · HANG03 0 |
| Dòng tổng biên bản | Theo sổ 180, kiểm kê 181, chênh lệch +1 |
| Ghi nhận chênh lệch (a) | **Một** phiếu điều chỉnh tồn `mixed`, ngày 30/11, kho `KA-1`: HANG01 lô L02 −2 (lý do XDC), HANG02 lô M01 +3 (lý do NDC) |
| Ghi nhận chênh lệch (b) | **Một** phiếu chuyển kho `KA-1` → `KA-CL` ngày 30/11: HANG01 lô L01 × 2 (kém phẩm chất) |
| HSD thực tế khác sổ | HANG01/L02 cập nhật HSD 15/12/2026 trên lô, ghi lịch sử (ai, khi nào, theo biên bản nào) |
| BC nhập xuất tồn (ACC83) tháng 11 | KA-1: HANG01 = 116, HANG02 = 53, HANG03 = 10 · KA-CL: HANG01 = 2 |
| Tồn theo lô (KHO05) | KA-1: HANG01/L01 = 78, HANG01/L02 = 38 · KA-CL: HANG01/L01 = 2 |
| Biên bản xác minh | Dòng HANG01 tách 2 nguyên nhân (1 + 1); dòng HANG02 1 nguyên nhân; tổng mỗi dòng = chênh lệch |
| Quyết định QĐ-KK-01 | Sinh **một** phiếu kế toán ngày 05/12/2026, 3 dòng như bảng bút toán bước 3 |
| Liên kết | Biên bản kiểm kê ↔ xác minh ↔ quyết định ↔ phiếu điều chỉnh / chuyển kho / phiếu kế toán mở được qua lại |
| Trạng thái | Biên bản: Nháp → Đã ghi nhận chênh lệch → Đã xác minh → Đã xử lý |
| In | Biên bản kiểm kê vật tư, hàng hoá (mẫu 05-VT; kế toán trưởng xác nhận mẫu theo chế độ đang áp), biên bản xác minh, quyết định xử lý |

**Bút toán bước 1** (giá trị theo giá vốn bình quân tháng 11, sau khi tính giá vốn):

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 1381 | 156 | 20.000 | HANG01/L02 thiếu 2 × 10.000 (XDC) — chưa rõ nguyên nhân, chưa vào chi phí |
| 156 | 3381 | 15.000 | HANG02/M01 thừa 3 × 5.000 (NDC) — chưa rõ nguyên nhân |
| 156 (KA-CL) | 156 (KA-1) | 20.000 | HANG01/L01 kém phẩm chất chuyển kho cách ly (cùng tài khoản thì chỉ đổi kho, không phát sinh số dư) |

**Bút toán bước 3** (quyết định QĐ-KK-01, ngày 05/12/2026):

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 1388 (đối tượng: Nguyễn Văn A) | 1381 | 10.000 | Bồi thường 1 hộp (KKBT) |
| 632 | 1381 | 10.000 | Hao hụt tính vào chi phí 1 hộp (KKCP) |
| 3381 | 711 | 15.000 | Thừa thuộc doanh nghiệp (KKTN) |

Sau bước 3: số dư 1381 và 3381 của biên bản này = 0.

**Báo cáo phải thấy:** Sổ chi tiết hàng hoá HANG01 tháng 11 có dòng xuất 2 (lô L02) theo số phiếu điều chỉnh và dòng chuyển 2 (lô L01)
sang KA-CL; sổ chi tiết 1388 có công nợ Nguyễn Văn A 10.000.

**Sai số làm tròn chấp nhận:** 0 (số lượng); giá trị ≤ 1 đ mỗi dòng.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Mọi dòng chênh lệch = 0, không có hàng kém phẩm chất | Ghi nhận chênh lệch không sinh chứng từ, báo "Không có chênh lệch"; biên bản → Đã xử lý (bỏ qua xác minh / quyết định) |
| 2 | Nhập số kiểm kê âm / để trống | Chặn ghi, tô ô lỗi ("số kiểm kê ≥ 0") |
| 3 | Kỳ 11/2026 đã khoá rồi bấm Ghi nhận chênh lệch | Không sinh chứng từ, báo kỳ đã khoá (giữ nguyên biên bản) |
| 4 | Sau khi lập biên bản có chứng từ ghi lùi vào KA-1 trước 30/11 | Biên bản nhắc "Số theo sổ đã đổi", có nút Lấy lại số tồn; không tự đổi số kiểm kê |
| 5 | Excel có mã hàng / lô không có trong danh mục | Mã hàng lạ: báo dòng lỗi, không thêm. Lô lạ của mã có quản lý lô: thêm dòng *lô mới*, theo sổ = 0 (thừa) |
| 6 | Có hàng kém phẩm chất nhưng chi nhánh chưa đặt kho cách ly | Không cho Ghi nhận chênh lệch, báo "Đặt kho cách ly cho CN-A ở cài đặt Kiểm kê" |
| 7 | Lập quyết định khi tháng 11 chưa tính giá vốn | Không cho ghi quyết định, báo "Tính giá vốn tháng 11/2026 trước" (số tiền tất toán phải bằng số đã ghi 1381 / 3381) |
| 8 | Xác minh: tổng số lượng các nguyên nhân ≠ chênh lệch của dòng | Chặn ghi biên bản xác minh, chỉ đúng dòng lệch |
| 9 | Nguyên nhân "Do ghi thiếu phiếu nhập" (thừa) | **Không ghi 711.** Quyết định yêu cầu số phiếu nhập đã bổ sung; phần mềm **đảo dòng thừa** tương ứng trong phiếu điều chỉnh (tránh tồn tăng hai lần); thiếu số phiếu nhập thì không cho ghi |
| 10 | Nguyên nhân "Chưa rõ" giữ đến khi lập quyết định | Dòng đó không sinh bút toán tất toán; 1381 / 3381 còn số dư, biên bản ở *Đã xác minh*, Việc hôm nay nhắc "Chênh lệch kiểm kê chưa xử lý" |
| 11 | Bỏ ghi nhận chênh lệch / huỷ quyết định | Huỷ chứng từ đã sinh (bút toán đảo, không xoá) theo thứ tự ngược: quyết định trước, ghi nhận sau |
| 12 | Thu tiền bồi thường của Nguyễn Văn A | Làm ở Phiếu thu (lý do KKTH, Nợ 111 / Có 1388) — ngoài màn Kiểm kê |

## 7. Kết quả chạy
<!-- [2026-11-12 03:30 PM kiennt] NT-KHO-002 — kết quả chạy -->

| | |
|---|---|
| Ngày chạy | 12/11/2026 |
| Bản code (commit) | nhánh `feat/kho-kiem-ke` |
| Test tự động | `apps/api/test/kiem-ke-kho.test.ts` — 13 / 13 đạt |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| Lấy số tồn | 4 dòng theo lô: L02 40, L01 80, M01 50, HANG03 10 | Đúng | 0 | |
| Chênh lệch theo lô | −2 / 0 / +3 / 0; tổng sổ 180, kiểm kê 181, +1 | Đúng | 0 | |
| Phiếu điều chỉnh tồn | Một phiếu mixed: L02 −2, M01 +3 | Đúng (`erp:kk:<id>:dc`) | 0 | |
| Chuyển kho cách ly | L01 × 2 sang KA-CL, không bút toán | Đúng (`erp:kk:<id>:cl`), không bút toán | 0 | |
| ACC83 / KHO05 | KA-1 HANG01 116 (L01 78, L02 38), HANG02 53, HANG03 10; KA-CL L01 2 | Đúng | 0 | |
| Bút toán bước 1 | Nợ 1381 20.000 / Có 156; Nợ 156 / Có 3381 15.000 | Đúng số; nằm ở **phiếu giá vốn tháng** `cogs:CN01:2026-11`, đối tượng `CN-CN01` | vị trí | Lõi định giá chứng từ điều chỉnh khi tính giá vốn tháng |
| Bút toán bước 3 | 1388[NV-A] / 1381 10.000; 632 / 1381 10.000; 3381 / 711 15.000 | 13888[NV-A] / 1381[NV-A] 10.000; 6328 / 1381[CN-CN01] 10.000; 3381[CN-CN01] / 7118 15.000 | TK chi tiết | Hệ thống tài khoản mẫu chỉ cho hạch toán TK chi tiết (13888, 6328, 7118) |
| 1381 / 3381 sau bước 3 | Về 0 | Về 0 (theo tài khoản) | 0 | Theo đối tượng: 1381 CN-CN01 +10.000 / NV-A −10.000 — phiếu kế toán chỉ có một đối tượng cho cả Nợ và Có |
| Huỷ quyết định / bỏ ghi nhận | Bút toán đảo; tồn trở lại 120 | Đúng | 0 | |
| Lệch chuẩn 1 (không chênh lệch) | Không sinh chứng từ, Đã xử lý | Đúng | 0 | |
| Lệch chuẩn 2 (số âm) | Chặn | 400 | 0 | |
| Lệch chuẩn 6 (chưa có kho cách ly) | Chặn | 400 | 0 | |
| Lệch chuẩn 7 (chưa tính giá vốn) | Báo tính giá vốn tháng trước | 409 "Tính giá vốn tháng 12/2026 trước" | 0 | |
| Lệch chuẩn 8 (tổng nguyên nhân ≠ chênh lệch) | Chặn | 400 | 0 | Sai hướng (thừa thuộc DN cho hàng thiếu) cũng chặn |
| Lệch chuẩn 9 (ghi thiếu phiếu nhập) | Không 711, đảo phần thừa | Không phiếu kế toán; tồn HANG03 về 10 | 0 | |
| HSD thực tế khác sổ | Cập nhật HSD trên lô, ghi lịch sử | **Chỉ ghi trên biên bản + đánh dấu**, HSD của lô trong sổ chưa đổi | **lệch** | Lõi chưa có thao tác sửa HSD lô (HSD là một phần khoá của lô) — cần việc lõi |
| Kho cách ly / 4 lý do "cài đặt" | Ô cài đặt trên màn Kiểm kê | Chọn trên từng biên bản (gợi ý KKBT / KKCP / KKTN) | khác cách | Khoá cài đặt mới phải sửa registry — ngoài phạm vi giữ chỗ |
| In 05-VT | In biên bản | **Chưa làm** | **thiếu** | Đăng ký mẫu in ở `printCatalog.ts` — ngoài phạm vi giữ chỗ |
| Lệch chuẩn 3 (kỳ khoá) | Chặn | 409 "Kỳ 10/2026 đã khoá", biên bản giữ nháp | 0 | |

Bốn lệnh kiểm (12/11/2026): `npm run typecheck` 0 lỗi · `bash scripts/kiem-chuan.sh` ĐẠT · `selfcheck` không thêm mục mới so với `main`
(SC-SEC-1 chỉ do tệp `.env` cục bộ) · `nhan-viec kiem` ĐẠT.
`npm test` (CSDL test mới): 2007 đạt, 3 hỏng — `default-data.test.ts` (2) hỏng cả trên `main`;
`db-rules.test.ts` (1): bảng `stock_counts` chưa khai nhóm trong `schema-catalog.ts` — **đã được khai trên `main`** (13/11/2026), `db-rules` đạt 19 / 19.
