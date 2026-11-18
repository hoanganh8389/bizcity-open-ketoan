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
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-029-tao-khach.test.ts` (tạo khi code) |

## 5. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1 |
