# Quyết định kiến trúc (ADR)

Một tệp cho mỗi quyết định khó đảo ngược hoặc mỗi ngoại lệ Tier 1. Chỉ thêm; quyết định bị thay thì ghi "Thay bởi ADR-xxxx" ở đầu tệp cũ.

| Số | Tiêu đề | Trạng thái |
|---|---|---|
| [0001](ADR-0001-mot-cua-su-viec.md) | Mọi đầu vào tài chính đi một cửa sự việc | Chấp nhận |
| [0002](ADR-0002-tien-to-bizcity.md) | Tiền tố `bizcity_` ở hợp đồng và bề mặt ngoài, không đổi tên bảng | Chấp nhận |
| [0003](ADR-0003-hop-dong-thanh-module.md) | Nghiệp vụ hợp đồng trong lõi chuyển thành module `hop-dong` (sau ca chuẩn) | Chấp nhận |
| [0004](ADR-0004-ban-hang-tach-doi.md) | Bán hàng tách đôi: dòng bán thuộc Kernel, báo cáo là module | Chấp nhận |
| [0005](ADR-0005-danh-muc-chuan-o-packages-data.md) | Danh mục chuẩn ở `packages/data`, cột tài khoản do Kernel quản | Chấp nhận |
| [0006](ADR-0006-bo-kiem-chuan-mot-cho.md) | Một bộ kiểm chuẩn `tests/conformance/`: hai lane song song, bảng điểm, baseline bánh cóc | Chấp nhận |
| [0007](ADR-0007-goi-chia-se-va-ha-tang.md) | Chuẩn hoá gói chia sẻ và hạ tầng: học từ bộ 27 gói tham chiếu, PostgreSQL là hạ tầng bắt buộc duy nhất, adapter tuỳ chọn, `infrastructure/` riêng, không Prisma | Chấp nhận |
| [0008](ADR-0008-cay-thu-muc-lean.md) | Cây thư mục lean: nhận ý đề xuất 9 thư mục gốc, gộp theo tiêu chí lean (`packages/kernel` một gói, `contracts/` theo ba lớp kiểm soát, sự kiện là gói Platform) | Chấp nhận |

## Khuôn

```markdown
# ADR-NNNN · <tiêu đề>

- Trạng thái: Đề xuất | Chấp nhận | Thay bởi ADR-xxxx
- Ngày: YYYY-MM-DD · Người quyết: …
- Luật / hợp đồng liên quan: R-…, bizcity_…@N

## Bối cảnh
## Quyết định
## Hệ quả (được gì, mất gì, việc phải làm)
## Phương án đã cân nhắc
```
