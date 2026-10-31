# Phiên bản của Standard, hợp đồng và Kernel
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán. -->

> Mục tiêu: **nâng cấp chuẩn hay nâng cấp Kernel mà module đã cài không gãy.** Module chỉ hứa với *Standard* và *năng lực*, không bao giờ hứa với phiên bản Kernel.
> Tệp này nói **đánh số thế nào**. Còn **phát hành thế nào** (cổng chặn, kênh stable / LTS, CHANGELOG, vá bảo mật, quay lui): [../rules/RULE-RELEASE.md](../rules/RULE-RELEASE.md), [../ops/RELEASE.md](../ops/RELEASE.md). Mức thay đổi Kernel K0–K3: [../rules/RULE-KERNEL.md](../rules/RULE-KERNEL.md).

## 1. Bốn trục phiên bản, độc lập nhau

| Trục | Ví dụ | Ai tăng | Module khai ở đâu |
|---|---|---|---|
| **Standard** `bizcity_standard@MAJOR` + SemVer | `1.0.0`, `1.1.0` | nhóm Lõi, khi thêm / đổi hợp đồng hoặc năng lực | `manifest.standard: "^1.0"` |
| **Hợp đồng** `bizcity_<tên>@MAJOR` + SemVer trong tệp | `bizcity_document@1` bản `1.2.0` | nhóm Lõi | không khai riêng: Standard đã ghim bản hợp đồng |
| **Năng lực** (capability) | `documents.attachments`, `ledger.submit` | thêm khi có tính năng mới ở Platform / Kernel | `manifest.requires.capabilities[]` |
| **Gói / Kernel** SemVer npm | `@bizcity/kernel@1.7.3` | nhóm Lõi, mỗi bản phát hành | **không khai** |

Bản máy đọc của trục 1–3: [bizcity-standard.json](bizcity-standard.json). Core trả cùng nội dung ở `GET /api/v1/system/capabilities` (Phase 2).

Vì sao module không khai phiên bản Kernel: Kernel đổi bên trong (tối ưu truy vấn, tách bảng theo năm, đổi cách tính giá vốn) thì tăng SemVer của gói, **không** đổi hợp đồng, nên không module nào phải sửa. Đây là cách "bump version mà không ảnh hưởng kernel" và ngược lại.

## 2. Khi nào tăng gì

| Thay đổi | Ví dụ | Standard | Hợp đồng | Kernel |
|---|---|---|---|---|
| Sửa lỗi bên trong, không đổi hành vi đã hứa | sửa truy vấn số dư | — | — | patch |
| Thêm năng lực, thêm trường tuỳ chọn, thêm `docType`, thêm mã lỗi, thêm slot UI | thêm `documents.attachments` | **minor** (1.0 → 1.1) | minor | minor |
| Đổi nghĩa / bỏ trường, trường tuỳ chọn thành bắt buộc, siết luật Tier 0/1 | bắt buộc RLS cho bảng module | **major** (@1 → @2) | major, tệp `*-v2.md` | major |
| Sửa câu chữ tài liệu | — | — | — | — |

Luật tăng phiên bản:

- **VER-1 (Tier 0).** Hợp đồng đã phát hành chỉ được đổi theo hướng tương thích trong cùng major. Bên nhận phải bỏ qua trường lạ.
- **VER-2 (Tier 0).** Kernel không được đổi hành vi một hợp đồng nếu Standard không đổi. CI chạy bộ tương thích ([CONFORMANCE.md](CONFORMANCE.md)) của **mọi module đã đăng ký** trên mỗi PR vào Kernel.
- **VER-3 (Tier 1).** Major mới chạy song song major cũ ít nhất **2 bản phát hành hoặc 6 tháng**, lấy mốc dài hơn. Trong thời gian đó Core nhận cả hai.
- **VER-4 (Tier 1).** Năng lực bị bỏ thì trước hết đánh `deprecated` trong `bizcity-standard.json`; Core cảnh báo khi khởi động module còn dùng; chỉ xoá ở major sau.
- **VER-5 (Tier 1).** Mỗi bản phát hành Core có `CHANGELOG.md` chia ba mục: Standard, hợp đồng, Kernel.

## 3. Năng lực (capabilities)

Năng lực là đơn vị nhỏ nhất module được phép phụ thuộc. Mỗi năng lực có mã `<nhóm>.<tên>`, phiên bản Standard có nó (`since`), trạng thái (`available` / `planned` / `deprecated`) và hợp đồng định nghĩa nó.

```json
"requires": {
  "standard": "^1.0",
  "capabilities": ["ledger.submit", "documents.workflow", "documents.attachments", "events.clock"]
}
```

Khi bật module, Core so `requires.capabilities` với bảng năng lực của chính nó:

| Kết quả | Core làm |
|---|---|
| Đủ | bật |
| Thiếu năng lực `planned` | từ chối bật: lỗi `CAPABILITY_MISSING`, nêu mã năng lực và Phase dự kiến |
| Thiếu năng lực không có trong bảng | từ chối bật, gợi ý mở đề xuất (§5) |
| Dùng năng lực `deprecated` | bật, ghi cảnh báo, hiện ở `/system/diagnostics` |

## 4. Phiên bản của module

- Module dùng SemVer. **Đổi schema dữ liệu (migration mới) = ít nhất minor.** Bỏ cột, đổi nghĩa action công khai, đổi tên sự kiện phát ra = major.
- Mỗi sự kiện module phát ra có `version` riêng (xem [Event §3](../contracts/BIZCITY-EVENT-v1.md)). Đổi khuôn `data` phá vỡ thì tăng `version` sự kiện, phát song song bản cũ ít nhất một minor của module.
- Nâng cấp module = chạy migration mới + bộ tương thích trên bản sao CSDL ([CONFORMANCE.md](CONFORMANCE.md), CONF-UPG).

## 5. Thiếu năng lực thì đề xuất thay đổi Core

Đây là quy trình thực thi nguyên tắc **P2**. Module **không** tự vá (ghi thẳng bảng Kernel, import nội bộ, thêm luật định khoản).

| Bước | Ai | Kết quả |
|---|---|---|
| 1. Mở issue mẫu "Đề xuất năng lực" | người viết module (hoặc AI soạn giúp) | mô tả ca dùng, vì sao SDK hiện tại không đủ, khuôn API đề nghị |
| 2. Phân loại | nhóm Lõi | thuộc Platform (chung) hay Kernel (kế toán); có cách làm bằng năng lực sẵn có không |
| 3. ADR | nhóm Lõi | quyết định + mã năng lực mới, ghi ở [../adr/](../adr/README.md) |
| 4. Làm trong Core | nhóm Lõi | code + test + cập nhật hợp đồng (minor) + `bizcity-standard.json` (`status: available`) |
| 5. Phát hành | nhóm Lõi | Standard minor (vd 1.1.0) |
| 6. Module dùng | người viết module | thêm mã năng lực vào `requires`, tăng `standard: "^1.1"` |

Ví dụ thật: module Hợp đồng muốn **ghi nhận doanh thu theo kỳ hợp đồng** thì cần loại sự việc `revenue_recognition`, hiện Kernel chưa có. Module không viết luật định khoản; nó mở đề xuất năng lực `ledger.doctype.revenue_recognition`. Trong lúc chờ, module vẫn chạy được phần không cần hạch toán.

## 6. Bảng tương thích

CI dựng bảng **module × phiên bản Core** từ kết quả bộ tương thích, lưu kèm bản phát hành (`compat-matrix.json`). Người cài nhìn bảng này để biết module nào chạy trên Core nào. Bảng do máy sinh, không sửa tay.

## 7. Nhật ký

- **1.0.0-draft (2026-10-29):** Khởi tạo Standard v1 với 7 hợp đồng; đổi tên khuôn nạp sổ `bizcity_event@1` thành `bizcity_ledger_intake@1` (chưa phát hành nên không cần thời gian chạy song song).
