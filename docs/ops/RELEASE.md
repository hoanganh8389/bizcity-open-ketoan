# Phát hành — từng bước

> **Luật:** [../rules/RULE-RELEASE.md](../rules/RULE-RELEASE.md) (R-REL) · **Đánh số:** [../standard/VERSIONING.md](../standard/VERSIONING.md) · **Kernel:** [../rules/RULE-KERNEL.md](../rules/RULE-KERNEL.md) · **Tự chẩn đoán:** [../rules/RULE-SELF-DIAGNOSTICS.md](../rules/RULE-SELF-DIAGNOSTICS.md)

## 1. Chọn số

| Trong `## [Chưa phát hành]` của CHANGELOG có | Số mới |
|---|---|
| chỉ sửa lỗi, tài liệu, K0 | patch |
| thêm tính năng, K1, K2 (thay đổi định khoản cho chứng từ mới), hợp đồng thêm tương thích | minor |
| K3 không phải "thêm chặt", hợp đồng / route / công cụ MCP bị bỏ, bước nâng cấp bắt người dùng làm tay | **major** |

## 2. Cổng phát hành (R-REL-4) — dán kết quả vào hồ sơ

```bash
# 0. Nhánh phát hành từ main
git switch -c release/vX.Y.Z

# 1. Bộ kiểm và test
node tests/conformance/selfcheck.mjs --self-test
node tests/conformance/selfcheck.mjs --strict
npm ci && npm run typecheck && npm test

# 2. Diagnostics trên BẢN SAO ẨN DANH của dữ liệu thật (không chạy trên bản thật đang dùng)
BIZCITY_PSQL="docker exec -i <db-ban-sao> psql -U <user> -d <db>" node tests/conformance/selfcheck.mjs --lane diagnostics
#    → 0 mục error

# 3. Thử nâng cấp: dựng bản stable trước (và LTS) trên bản sao → cap-nhat.sh lên bản rc → diagnostics lại → 0 error

# 4. Lỗ hổng phụ thuộc
npm audit --omit=dev --audit-level=high

# 5. Hiệu năng (khi có bizcity bench, R-KER-9): không xấu hơn mốc > 20%

# 6. Khoá migration mới
node tests/conformance/selfcheck.mjs --update-lock
```

| # | Mục | Đạt |
|---|---|---|
| 1 | `--self-test`, `--strict`, typecheck, test PostgreSQL | ☐ |
| 2 | Diagnostics bản sao: error = 0 (warn nào, vì sao chấp nhận) | ☐ |
| 3 | Nâng cấp từ stable trước → rc: migrate xong, khoẻ, diagnostics 0 error | ☐ |
| 3b | Nâng cấp từ LTS đang hỗ trợ (nếu có) | ☐ |
| 4 | `npm audit` không high / critical | ☐ |
| 5 | Hiệu năng ≤ mốc + 20% | ☐ |
| 6 | Migration mới đã khoá băm | ☐ |
| 7 | CHANGELOG: chuyển `[Chưa phát hành]` thành `[X.Y.Z] - YYYY-MM-DD`, đủ 6 mục; `package.json` cùng số | ☐ |
| 8 | Thay đổi định khoản (K2+) có liệt kê khác biệt tình huống mẫu | ☐ |
| 9 | Nâng cấp cần làm tay: viết từng bước, đã thử | ☐ |

## 3. Đóng gói và hồ sơ (R-REL-1, 8, 10)

1. `git tag -s vX.Y.Z -m "Bizcity Core vX.Y.Z"` rồi đẩy tag.
2. Image `api`, `web` có nhãn OCI `version` / `revision`. Ghi **digest** vào ghi chú phát hành; bản cài kéo theo digest.
3. Đính kèm vào GitHub Release:
   - `SCOREBOARD.md`, `evidence.txt` (bộ kiểm);
   - kết quả diagnostics bản sao;
   - nhật ký thử nâng cấp;
   - SBOM `sbom.cdx.json`;
   - `SHA256SUMS`.
4. rc chạy ở ít nhất một bản cài thử ≥ 3 ngày làm việc trước khi gắn stable (minor / major). Patch bảo mật được bỏ qua bước này.

## 4. Ghi chú phát hành (mẫu)

```markdown
## [X.Y.Z] - 2026-11-20

### Thêm
- …
### Đổi
- …
### Sửa
- …
### Thay đổi định khoản (K2+) — áp cho chứng từ ghi sau khi cập nhật; bút toán cũ không đổi
- `customer_payment` chuyển khoản: Nợ tài khoản của hình thức thanh toán thay vì `cash`. Tình huống TM-04 đổi Nợ 1111 → 11211.
### Nâng cấp cần làm
- Không có. / Chạy `…` sau khi cập nhật.
### Bảo mật
- Không có. / GHSA-xxxx: …
```

## 5. Bản vá bảo mật (R-REL-6)

```text
nhận báo cáo (SECURITY.md) → đánh giá mức (CVSS) → nhánh riêng, không PR công khai
 → vá cho stable + LTS → cổng phát hành rút gọn (1, 2, 4, 6) → phát hành cùng lúc
 → GitHub Security Advisory + mục "Bảo mật" trong CHANGELOG → báo đơn vị đang dùng
```

## 6. Quay lui một bản cài

1. Dừng `api` (giữ `db`).
2. Khôi phục bản sao lưu mà `cap-nhat.sh` đã tạo ngay trước cập nhật, theo chú thích đầu `scripts/sao-luu.sh`: `gunzip -c backups/ketoan-<thời điểm>.sql.gz | docker compose exec -T db psql -U ketoan -d ketoan`. Lệnh `bizcity restore` có kiểm checksum là việc của Phase 4.
3. Đặt lại image theo **digest** của bản trước, khởi động.
4. Chạy diagnostics. Ghi sự cố vào `docs/audits/`.

Không bao giờ sửa tay migration hay bảng `ledger_*` để "lùi" (R-REL-5, R-LEDGER-1).
