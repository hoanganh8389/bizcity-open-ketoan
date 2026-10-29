# Chính sách bảo mật

Bizcity Core (open-ketoan) giữ sổ kế toán của doanh nghiệp. Lỗ hổng ở đây có thể làm lộ hoặc làm sai số liệu tài chính, nên xin báo **riêng tư**, đừng mở issue công khai.

*English: please report vulnerabilities privately via GitHub "Report a vulnerability" (Security tab). Do not open public issues.*

## Báo lỗ hổng

1. Vào tab **Security** của repo → **Report a vulnerability** (GitHub Private Vulnerability Reporting).
2. Ghi rõ:
   - phiên bản (`GET /api/v1/system/health`) hoặc commit;
   - các bước tái hiện;
   - ảnh hưởng: đọc được dữ liệu đơn vị khác? sửa được sổ? chiếm được khoá?
3. **Không** gửi dữ liệu thật của doanh nghiệp. **Không** thử trên bản cài của người khác.

## Cam kết

| Việc | Thời hạn |
|---|---|
| Xác nhận đã nhận | ≤ 3 ngày làm việc |
| Đánh giá mức độ | ≤ 7 ngày |
| Vá lỗi **critical** (đọc / sửa sổ của đơn vị khác, vượt xác thực, chạy mã từ xa) | ≤ 7 ngày |
| Vá lỗi **high** | ≤ 30 ngày |
| Công bố (GitHub Security Advisory, ghi công người báo nếu muốn) | sau khi có bản vá cho stable và LTS |

## Phiên bản được hỗ trợ

| Phiên bản | Vá bảo mật |
|---|---|
| bản stable mới nhất | có |
| bản LTS đang trong 12 tháng hỗ trợ | có |
| bản khác | không — hãy nâng cấp |

Hiện dự án chưa có bản stable (đang `0.x`). Vá áp cho nhánh `main`.

## Trong phạm vi

- API (`apps/api`), giao diện (`apps/web`), migration, script vận hành, cấu hình Docker mẫu;
- MCP server và cầu nối Cell (khi có);
- bộ kiểm `tests/conformance`.

**Ngoài phạm vi:**
- cấu hình sai của từng bản cài (để lộ cổng CSDL, mật khẩu yếu);
- lỗ hổng của Bizcity Cell / Hub (báo cho nhóm đó);
- tấn công từ chối dịch vụ bằng lưu lượng.

Luật bảo mật đầy đủ: [docs/rules/RULE-SECURITY.md](docs/rules/RULE-SECURITY.md).
