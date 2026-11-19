# NT-BH-033 · Đưa chứng từ bán hàng vào sổ chứng từ chung (Document Kernel)
<!-- [2026-11-19 Võ Hoàng] NGHIEM-THU — chốt NT-BH-033 (anh Hoàng, 19/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, `phieu-ban`, `voucher`, `loyalty`) |
| Màn hình | HT18 Sổ chứng từ (lõi) — chỉ thấy thêm loại chứng từ bán |
| Mục được giao | Bán hàng: phần bán của sổ chứng từ chung, theo `docs/nghiep-vu/26-so-chung-tu-quy-chuan.md` §6 |
| Ngày tạo | 19/11/2026 |
| Trạng thái | **Đã chốt 19/11/2026** (Võ Hoàng) — **code khi lõi sửa xong quyền ghi sổ chứng từ chung (xem §5)** |
| Căn cứ | Doc 26 (migration 0158–0166, Thủy); `tong-hop-bang-erp-19-11-2026` mục 5–6 |

## 1. Hiện trạng
Sổ chứng từ chung đã có chứng từ mua, kho, tiền. Phần bán chưa có: đơn máy bán, phiếu trả, đơn đặt hàng, phiếu bán, voucher, tích điểm chỉ nằm ở bảng riêng của module.

## 2. Cách làm (theo doc 26 — không thêm bảng, không đổi `accounting_events`)
Mỗi bảng nguồn có **trigger trong migration của module** gọi `public.bizcity_doc_put` / `public.bizcity_doc_link`; nạp lại dữ liệu cũ một lần.

| Chứng từ | Bảng nguồn | `doc_ref` | `doc_type` | `status_raw` → `status` |
|---|---|---|---|---|
| Đơn máy bán (Q1) | `mod_pos.orders` | `pos.order:<order_id>` | `sales.order` | `awaiting_payment` → in_progress · `completed` → done · `cancelled` → cancelled |
| Phiếu trả máy bán | `mod_pos.returns` | `pos.return:<id>` | `sales.return` | ghi sổ → done · huỷ → cancelled |
| Đơn đặt hàng BH20 | `mod_phieu_ban.orders` | `phieu-ban.order:<id>` | `sales.order` | `draft` → draft · `pending` → pending · `open` chưa giao → approved, đã giao một phần → in_progress · `closed` → done · `cancelled` → cancelled |
| Phiếu bán BH10 | `mod_phieu_ban.docs` (kind `sale`) | `phieu-ban.doc:<id>` | `sales.invoice` | `draft` → draft · `approved` → done |
| Phiếu trả BH11 | `mod_phieu_ban.docs` (kind `sale_return`) | `phieu-ban.doc:<id>` | `sales.return` | `draft` → draft · `approved` → done |
| Chiến dịch voucher | `mod_voucher.campaigns` | `voucher.campaign:<id>` | `pricing.voucher` | `active` → in_progress (quá hạn → done) · `stopped` → cancelled |
| Chương trình tích điểm | `mod_loyalty.programs` | `loyalty.program:<chi nhánh>:<bản>` | `pricing.loyalty` | bản đang dùng → in_progress · bản cũ → done |

**Liên kết** (`document_links`):
- `ledger`: chứng từ đã ghi sổ → sự việc kế toán (`doc_key` hiện có, vd `pos:CN01:sale:<uuid>`). `doc_ref` không dùng `doc_key` vì `doc_key` của máy bán không đúng dạng `<module>.<loại>:<id>` của doc 26.
- `source`: phiếu trả → đơn / phiếu gốc; phiếu bán BH10 → đơn đặt hàng BH20 (giao hàng); đơn copy → đơn gốc.
- `applies`: đơn / phiếu → chương trình đã áp **khi chương trình đã có trong sổ** (chương trình bán BH12 `sale_programs` là bảng lõi — Thủy đưa vào sổ).

Không đưa đợt này: yêu cầu trả quá hạn, nháp khuyến mại, chuyến giao (thuộc đơn), danh mục kênh — làm sau nếu cần.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Bán một đơn máy bán | Sổ chứng từ có `pos.order:…` loại `sales.order`, trạng thái Hoàn tất, phiên bản 1, liên kết `ledger` tới sự việc kế toán |
| Đơn chờ QR rồi được xác nhận | Đang thực hiện → Hoàn tất; phiên bản không tăng |
| Trả hàng | `sales.return` liên kết `source` tới đơn gốc |
| Đơn đặt hàng: nháp → gửi → giao một phần → đóng | Nháp → Đã duyệt → Đang thực hiện → Hoàn tất; đổi nội dung đơn thì phiên bản tăng |
| Phiếu bán BH10 từ chuyến giao | `sales.invoice` liên kết `source` tới đơn đặt hàng |
| Ngừng chiến dịch voucher | `pricing.voucher` → Huỷ |
| Dữ liệu cũ | Có đủ trong sổ sau khi chạy migration |

## 4. Đã chốt (19/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Loại của đơn máy bán | `sales.order` (theo tài liệu tổng hợp 19/11) |
| Q2 | Thời điểm | Chốt phiếu ngay; code khi lõi sửa xong quyền ghi |

## 5. Phụ thuộc lõi (chưa làm được)
- Vai trò CSDL của module gọi được `bizcity_doc_put` nhưng **không có quyền ghi** `business_documents`, hàm không chạy quyền chủ → trigger của module báo "permission denied" (đã kiểm trên CSDL thử 19/11). Cần lõi sửa (Thủy).
- Màn HT18 (`SoChungTuPage.tsx`) và `so-chung-tu.test.ts` là tệp lõi: thêm tên loại chứng từ bán ở đó do Thủy làm hoặc giữ chỗ chung.

## 6. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-033-so-chung-tu-ban.test.ts` (chưa tách — tạo khi code) |

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 19/11/2026 | Tạo phiếu, chốt Q1–Q2 |
