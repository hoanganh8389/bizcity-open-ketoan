# Preset cài nhanh theo ngành

Mỗi thư mục là một gói `bizcity_preset@1` ([hợp đồng](../docs/contracts/BIZCITY-PRESET-v1.md)): phân hệ nên bật, gói định khoản, chế độ ghi sổ và **dữ liệu mẫu hư cấu**.

```bash
docker compose up -d --build                      # Core chạy ở http://localhost:8088
node scripts/cai-preset.mjs --list
BIZCITY_PASSWORD='mật khẩu quản trị' node scripts/cai-preset.mjs thuong-mai-ban-le \
  --api http://localhost:8088 --tenant demo --email admin@ketoan.local
```

Script chỉ gọi HTTP API: chứng từ mẫu vào sổ qua đúng một cửa `POST /documents`, chạy lại không trùng. Thêm `--dry-run` để xem trước, `--no-sample` để chỉ cấu hình.

Thêm preset mới:
1. Chép `thuong-mai-ban-le/`.
2. Đổi `id` cho trùng tên thư mục.
3. Giữ dữ liệu **hư cấu**.
4. `docKey` bắt đầu bằng `preset:<id>:`.
5. Chạy `node tests/conformance/selfcheck.mjs` (SC-PRESET-1).
