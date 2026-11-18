# NT-BH-029 · Tạo khách riêng trên máy bán (không kèm đơn) đi module thật
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-029 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`; máy bán React) |
| Mục được giao | Kiểm soát tại quầy: "tạo khách riêng (ngoài đơn) đi module thật" |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | Máy bán React: nút "Tạo khách" riêng còn chạy giả (`POST /pos/customers`); khách tạo kèm đơn đã đi thật |

## 1. Cách làm
- Nút "Tạo khách" trên máy bán gọi action mới của module `pos`, tạo khách vào **danh mục đối tượng của kế toán**, cùng đường với khách tạo kèm đơn (không tạo bảng khách riêng).
- **Trùng SĐT** (Q1): SĐT đã có → không tạo mới, báo "SĐT đã thuộc khách …" và mở khách đó trên màn bán.
- Kiểm SĐT đúng dạng Việt Nam; tên bắt buộc.

## 2. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Tạo "Chị Lan" với SĐT mới | Có trong danh mục đối tượng, máy bán chọn được ngay, đơn sau gắn đúng khách |
| Tạo lại cùng SĐT | Không tạo trùng; báo và mở khách cũ |
| SĐT sai dạng | Báo lỗi, không tạo |

## 3. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Tạo khách riêng | Đi module thật; trùng SĐT thì báo, mở khách cũ |

## 4. Kết quả chạy
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — kết quả chạy (đóng góp) -->
| | |
|---|---|
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | nhánh `feat/nt-bh-027-029-quay` |
| Test tự động | `apps/api/test/nt-bh-029-tao-khach.test.ts` (3/3) |

Action mới `pos.customer.check` (`GET /api/v1/m/pos/customers/check?phone&name`): kiểm SĐT (10 số, bắt đầu 0; +84 tự đổi), tên bắt buộc, tra danh mục đối tượng theo SĐT.

| Mục | Mong đợi | Phần mềm (test) |
|---|---|---|
| Tạo "Chị Lan" SĐT mới | có trong danh mục, chọn được ngay, đơn sau gắn đúng khách | **đạt một phần**: trả `new` + khách (mã = SĐT) để máy chọn ngay; đơn đầu gắn đúng khách và khách **vào danh mục đối tượng cùng đơn đó** (cửa nạp tạo theo `partner`). Chưa có đơn thì chưa có trong danh mục (xem dưới) |
| Tạo lại cùng SĐT | không trùng; báo, mở khách cũ | đạt: `exists` + "SĐT … đã thuộc khách Anh Cũ (…) — không tạo mới, mở khách này"; dạng +84 cũng nhận ra; danh mục giữ một đối tượng |
| SĐT sai dạng | báo lỗi, không tạo | đạt: `POS_BAD_PHONE` (`field: phone`); thiếu tên `POS_MISSING_NAME` |

**Phần dừng vì thiếu năng lực lõi:** module không ghi được danh mục đối tượng khi chưa có chứng từ — `ctx.actions.call` chỉ gọi action đọc (`callAction` từ chối action ghi), nên không gọi được `core.partner.create`; không có loại chứng từ nào chỉ mang đối tượng. Theo chỉ đạo, dùng đúng đường khách kèm đơn (NT-BH-019 Q1). Đề xuất bậc 4: cho module gọi `core.partner.create` / `upsert` (năng lực `masterdata.write` từ module, quyền của người gọi) — khi có thì action này tạo luôn, máy bán không đổi.

## 5. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1 |
| 18/11/2026 | Code module pos + test; điền kết quả chạy; ghi phần chờ năng lực lõi (tạo khách khi chưa có đơn) |
