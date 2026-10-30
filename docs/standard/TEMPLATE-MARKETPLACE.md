# Thư viện gói định khoản (marketplace)
<!-- [2026-10-29 10:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — chuẩn MCP, gói định khoản theo ngành, kết nối Cell. -->

> **Hợp đồng gói:** [bizcity_posting_template@1](../contracts/BIZCITY-POSTING-TEMPLATE-v1.md) · **Kiểm:** SC-TPL-1 ([tests/conformance](../../tests/conformance/README.md)) · **AI dùng gói:** [bizcity_mcp@1](../contracts/BIZCITY-MCP-v1.md) §5
> **Mục tiêu:** chủ doanh nghiệp **không cần biết định khoản** vẫn có sổ đúng. Họ chọn ngành, tải gói, rồi để trợ lý AI chọn lý do cho từng nghiệp vụ. Kế toán dịch vụ và cộng đồng chia sẻ gói đã kiểm cho nhau.

## 1. Ba loại gói theo độ tin cậy

| Loại | Ai phát hành | Duyệt | Hiện ở đâu |
|---|---|---|---|
| **official** | Bizcity | nhóm Lõi + kế toán trưởng có chứng chỉ | mặc định, gợi ý khi tạo đơn vị |
| **verified** | đối tác (công ty kế toán dịch vụ, hội nghề nghiệp) | kiểm tự động + một người duyệt có chứng chỉ kế toán | tìm được, có huy hiệu |
| **community** | ai cũng được (kể cả gói do AI soạn) | chỉ kiểm tự động | tìm được, cảnh báo "chưa thẩm định" |

`trust` do registry gán khi duyệt. Gói tự khai `trust` thì bị bỏ qua.

## 2. Registry

Một kho git công khai, ví dụ `bizcity/posting-packs`. Mỗi gói một thư mục `packs/<id>/<version>/posting-pack.json`. Chỉ mục máy đọc nằm ở `index.json` (`bizcity_template_registry@1`):

```json
{ "contract": "bizcity_template_registry@1", "updated": "2026-11-01",
  "packs": [ { "id": "bizcity.vn-tt99.thuong-mai", "version": "1.2.0", "regime": "vn-tt99-2025",
               "industries": ["thuong-mai", "ban-le"], "trust": "official",
               "url": "packs/bizcity.vn-tt99.thuong-mai/1.2.0/posting-pack.json",
               "sha256": "…", "signature": "ed25519:…", "requires": { "docTypes": ["sale", "purchase"] } } ] }
```

Core tải `index.json` (cấu hình `bizcity.templates.registry_url`). Core kiểm `sha256` và chữ ký trước khi cho xem trước. Bản cài offline nhập gói bằng tệp.

## 3. Phát hành một gói

```text
PR vào registry ──► CI: node tests/conformance/selfcheck.mjs --module <thư mục gói>   (SC-TPL-1: schema, tài khoản, lý do mặc định, tình huống mẫu)
                 ──► CI: lane runtime (Phase 4): cài vào đơn vị tạm, chạy mọi tình huống mẫu qua Kernel thật, so cặp Nợ / Có
                 ──► duyệt người (verified / official)
                 ──► ký, cập nhật index.json
```

| Phiên bản | Khi |
|---|---|
| patch | sửa tên, mô tả, gợi ý AI (`ai.*`), thêm tình huống mẫu |
| minor | thêm lý do, tài khoản con, hình thức thanh toán, loại thuế |
| **major** | đổi tài khoản của một mã lý do đã có, đổi nghĩa mã, bỏ mã. Đơn vị đang dùng phải tự chọn nâng cấp và xem trước từng thay đổi |

## 4. Cài trong Core

```text
Hệ thống → Gói định khoản → chọn ngành → xem gói (lý do, tình huống mẫu bằng lời)
  → "Xem trước khi cài": bảng thêm / đổi / giữ so với cấu hình hiện tại (dry-run, STD-TPL-5)
  → người có settings:write xác nhận → ghi một giao dịch + bằng chứng core.template.install
```

- Trợ lý AI chỉ được gọi `ketoan.templates.install_preview` (xem trước). Cài thật luôn do người bấm (STD-MCP-6).
- Đơn vị mới: màn tạo đơn vị hỏi "Doanh nghiệp bạn làm gì?" rồi gợi ý gói nền + gói ngành.

## 5. AI soạn gói

Cell có thể soạn **bản nháp** gói cho một mô tả doanh nghiệp, ví dụ "xưởng mộc 15 người, bán cho đại lý, có xuất khẩu". Bản nháp phải:
- qua SC-TPL-1;
- chỉ dùng tài khoản trong hệ thống của `regime`;
- vào registry ở loại **community** cho tới khi người có chứng chỉ duyệt.

AI không bao giờ cài thẳng gói do nó soạn vào đơn vị.

## 6. Gói đầu tiên

| Gói | Nguồn | Khi nào |
|---|---|---|
| `bizcity.vn-tt99.nen` | tách phần chung từ `db/seeds/` (hệ thống TK, ngầm định, thuế, hình thức TT chung) | Phase 3 |
| `bizcity.vn-tt99.thuong-mai` | mở rộng [ví dụ](examples/vn-tt99-thuong-mai.posting-pack.json) | Phase 3 |
| Gói riêng của đơn vị gốc (bán lẻ sữa, chuỗi cửa hàng) | xuất từ cấu hình đang chạy (`bizcity pack export`, Phase 4) — `db/seeds/ly-do.jsonl` hiện là gói này ở dạng chưa chuẩn | Phase 4 |
| `dich-vu`, `fnb`, `ban-le` | soạn mới | Phase 5 |
| `xuat-nhap-khau`, `san-xuat`, `xay-dung`, `nhan-su-luong` | cần `docType` Kernel mới ([POSTING-TEMPLATE §8](../contracts/BIZCITY-POSTING-TEMPLATE-v1.md#8-phạm-vi-theo-ngành-thật-thà-về-kernel-hiện-tại)) | sau khi Kernel có năng lực |

## 7. Việc phải làm

| Phase | Việc |
|---|---|
| 3 | Bảng `config_packs` (gói đã cài, phiên bản, mục nào do gói / do người sửa); API xem trước + cài; màn Gói định khoản; `posting.reason.suggest` tất định |
| 4 | Lane runtime chạy tình huống mẫu qua Kernel thật; `bizcity pack export` (SC-TPL-1 tĩnh đã có từ 2026-10-29) |
| 5 | Registry công khai, chữ ký; AI soạn gói (Cell); MCP `ketoan.templates.install_preview` |
