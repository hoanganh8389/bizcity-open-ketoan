# NT-BH-033 · Đưa chứng từ bán hàng vào sổ chứng từ chung (Document Kernel)
<!-- [2026-11-19 Võ Hoàng] NGHIEM-THU — chốt NT-BH-033 (anh Hoàng, 19/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, `phieu-ban`, `voucher`, `loyalty`) |
| Màn hình | HT18 Sổ chứng từ (lõi) — chỉ thấy thêm loại chứng từ bán |
| Mục được giao | Bán hàng: phần bán của sổ chứng từ chung, theo `docs/nghiep-vu/26-so-chung-tu-quy-chuan.md` §6 |
| Ngày tạo | 19/11/2026 |
| Trạng thái | **Đã chốt 19/11/2026** (Võ Hoàng) |
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
| Q3 | Ai sửa quyền ở lõi | Anh Hoàng 19/11: **chủ động sửa luôn** trong đợt này (§5) |

## 5. Sửa lõi kèm theo (Q3 — thiết kế)
<!-- [2026-11-19 Võ Hoàng] NGHIEM-THU — Q3: sửa quyền sổ chứng từ chung trong đợt NT-BH-033 (đóng góp) -->
- **Vấn đề (kiểm 19/11 trên CSDL thử):** lúc chạy, module dùng vai trò `mod_<key>_rw`; vai trò này gọi được `bizcity_doc_put` nhưng không có quyền INSERT / UPDATE `business_documents`, `document_versions`, `document_links`; hàm chạy quyền người gọi → trigger của module báo "permission denied" và huỷ cả giao dịch lưu đơn.
- **Sửa (migration lõi `0167`):** `bizcity_doc_put`, `bizcity_doc_link` (và hàm ghi phiên bản / liên kết đi kèm nếu có) đặt `SECURITY DEFINER`, ghim `search_path` (`pg_catalog, public`), chủ hàm là vai trò lõi đang có quyền ghi. **Kiểm đơn vị trong hàm:** `p_tenant` phải bằng đơn vị của phiên (`current_setting('app.tenant_id')` — theo cách RLS lõi đang dùng); sai → báo lỗi. Không cấp quyền ghi bảng lõi cho vai trò module. Không đổi chữ ký hàm, không đổi dữ liệu.
- **Màn HT18:** thêm tên loại `sales.order`, `sales.invoice`, `sales.return`, `pricing.voucher`, `pricing.loyalty` vào `SoChungTuPage.tsx` (`TYPES`) và tên liên kết ở `doc-ref.routes.ts`; ca kiểm ở `so-chung-tu.test.ts`; cập nhật bảng "Đang có trong sổ" ở doc 26 §3.
- **Kiểm:** module ghi được sổ qua hàm; gọi hàm với tenant khác phiên → lỗi; luồng cũ (mua, kho, tiền) vẫn đạt `so-chung-tu.test.ts`.

## 6. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 19/11/2026 |
| Bản code (commit) | nhánh `feat/nt-bh-033-so-chung-tu-ban` (commit đầu tiên của nhánh) |
| Test tự động | `apps/api/test/nt-bh-033-so-chung-tu-ban.test.ts` — 7/7 đạt (đủ 7 dòng §3); `apps/api/test/so-chung-tu.test.ts` — 11/11 đạt (8 ca cũ mua / kho / tiền / chính sách + 3 ca quyền 0167) |
| Migration | lõi `0167_so_chung_tu_quyen_module.sql`; module `pos/0012_so_chung_tu.sql`, `phieu-ban/0004_so_chung_tu.sql`, `voucher/0002_so_chung_tu.sql`, `loyalty/0003_so_chung_tu.sql` (chạy lại nhiều lần được) |
| Quyền (CSDL thử) | Trước 0167: `mod_pos_rw` gọi `bizcity_doc_put` → `permission denied for table document_versions`. Sau: ghi được (đầu phiếu, phiên bản, liên kết); `p_tenant` khác `bizcity.tenant_id` của phiên → lỗi 42501; INSERT thẳng `business_documents` vẫn `permission denied` |
| §3 từng dòng | 1 đạt (`pos.order` done v1 + ledger) · 2 đạt (in_progress → done, v1) · 3 đạt (`sales.return` + source + ledger, HT18 tên liên kết) · 4 đạt (draft v1 → sửa v2 → approved → in_progress → done, v2) · 5 đạt (`sales.invoice` source → đơn; duyệt → done + ledger) · 6 đạt (voucher in_progress → cancelled; tích điểm bản mới in_progress, bản cũ done) · 7 đạt (mọi dòng nguồn mọi đơn vị có trong sổ; nạp lại không thêm phiên bản) |
| Khác thiết kế §5 | Biến phiên RLS lõi thật là `bizcity.tenant_id` (0041), không phải `app.tenant_id` — hàm kiểm dùng biến này; phiên chưa gắn đơn vị (migration, nạp dữ liệu cũ, việc nền) thì cho qua như RLS. `search_path` ghim `pg_catalog, public, pg_temp` (pg_temp đặt cuối để người gọi không chen bảng tạm). Phiếu trả máy bán `doc_status = pending` (chờ duyệt ACC14) → `pending` |
| Chưa làm | Liên kết `applies` tới chương trình bán BH12 — chờ `sale_programs` vào sổ (doc 26 §6) |

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 19/11/2026 | Tạo phiếu, chốt Q1–Q2 |
| 19/11/2026 | Q3: tự sửa quyền lõi (0167) trong đợt này; mở rộng giữ chỗ |
| 19/11/2026 | Code xong: 0167 + trigger 4 module + HT18; §6 điền kết quả chạy (Võ Hoàng) |
