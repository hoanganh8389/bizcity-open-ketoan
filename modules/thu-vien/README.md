# Module `thu-vien` — Kho thư viện (HT14)

Màn xem các **thư viện dùng chung** `bizcity_library@1` ([hợp đồng](../../docs/contracts/BIZCITY-LIBRARY-v1.md), [ADR-0032](../../docs/adr/ADR-0032-thu-vien-dung-chung-bizcity-library.md), thiết kế [PHASE-030 · 26](../../docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/26-KHO-THU-VIEN.md)).

**Chỉ giao diện** (như `phan-quyen`): không action, không bảng, không quyền riêng. Đọc API Core `core.library.list / get / items / validate` ([docs/api/16-thu-vien.md](../../docs/api/16-thu-vien.md)), quyền `catalog:read`.

## Bản B1 (S030-47)

| Thẻ | Cho thấy |
|---|---|
| Tổng quan | số thư viện, số mục, % mục đã duyệt, thư viện còn mục chưa duyệt, độ tươi; bảng thư viện cần chú ý. **Chưa có số lượt dùng** (B2, `library_usage_daily`) |
| Danh sách | thẻ từng thư viện: loại, bản, ngày phát hành, chủ duyệt, băm |
| Chi tiết | Mục (ô chọn `LibraryPicker` thật, giá trị tại ngày, lọc) · Phiên bản (changelog, băm) · Luật (điều kiện đọc bằng lời) · Kiểm thử (bộ kiểm của máy chủ, gợi ý bấm được) · README của thư viện |

Sau này: Căn cứ, Cấu hình, Đề xuất cập nhật (B3), số liệu sử dụng và kết luận theo module (B2).

## Tệp

| Tệp | Việc |
|---|---|
| `web/index.tsx` | menu HT14 `/app/thu-vien/kho` |
| `web/screens/*.tsx` | `KhoThuVienPage` (ba thẻ), `OverviewTab`, `ListTab`, `DetailView` |
| `web/lib/thu-vien.ts` | logic thuần: điều kiện đọc bằng lời, độ tươi, sức khoẻ, dựng input kiểm thử — test ở `test/` |

Ô chọn `LibraryPicker` nằm ở `@bizcity/ui-kit` để mọi module dùng chung.
