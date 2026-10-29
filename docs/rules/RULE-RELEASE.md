# RULE · Phát hành phiên bản (R-REL)

> **Cấp:** Tier 0 / 1 (ghi từng luật) · **Phiên bản:** 1.0 · 2026-10-29 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Cách đánh số** (bốn trục: Standard, hợp đồng, năng lực, Kernel): [../standard/VERSIONING.md](../standard/VERSIONING.md). **Tệp này nói cách phát hành.**
> **Quy trình từng bước, mẫu ghi chú phát hành:** [../ops/RELEASE.md](../ops/RELEASE.md) · Nhật ký: [../../CHANGELOG.md](../../CHANGELOG.md)

## 1. Thứ được phát hành

| Thứ | Số phiên bản | Nguồn sự thật |
|---|---|---|
| **Bizcity Core** (sản phẩm: API + web + migration) | `vMAJOR.MINOR.PATCH` | `package.json` gốc, tag git |
| Kernel | SemVer riêng (R-KER-10) | `packages/kernel/package.json` (Phase 2.3) |
| Standard, hợp đồng, năng lực | theo VERSIONING | `docs/standard/bizcity-standard.json`, đầu tệp hợp đồng |
| Gói định khoản | SemVer của từng gói | registry ([TEMPLATE-MARKETPLACE.md](../standard/TEMPLATE-MARKETPLACE.md)) |

Số của Core tăng theo thay đổi lớn nhất trong bản phát hành: một thay đổi Kernel K3 (R-KER) hoặc một hợp đồng lên major thì Core lên major.

## 2. Kênh

| Kênh | Tên | Cho ai | Hỗ trợ |
|---|---|---|---|
| nightly | `main` mỗi đêm | nhóm Lõi, người viết module | không |
| rc | `vX.Y.Z-rc.N` | bản cài thử, đối tác | tới khi ra stable |
| **stable** | `vX.Y.Z` | bản cài thật | vá tới bản minor kế tiếp |
| **LTS** | một bản minor mỗi năm, đánh dấu `lts` | doanh nghiệp cần ít nâng cấp | **12 tháng** vá bảo mật + lỗi làm sai sổ |

## 3. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-REL-1** | Mỗi bản phát hành có tag git **ký** `vX.Y.Z`. `GET /api/v1/system/health` trả `version`, `kernel`, `standard` của bản đang chạy | tag; test health (Phase 2.9) |
| **R-REL-2** | `CHANGELOG.md` gốc có mục `## [Chưa phát hành]`. PR đổi hành vi thêm dòng vào đó, không đợi tới lúc phát hành. Mỗi bản ghi đủ: **Thêm · Đổi · Sửa · Thay đổi định khoản** (K2 trở lên) · **Nâng cấp cần làm** · **Bảo mật** | SC-REL-1 |
| **R-REL-3** | Hợp đồng đổi thì tăng phiên bản ở đầu tệp và thêm dòng nhật ký trong cùng PR (R-QG-9). Phiên bản đầu tệp = dòng nhật ký mới nhất | SC-REL-2 |
| **R-REL-4** *(T0)* | **Cổng phát hành**, không có ngoại lệ:<br>1. CI xanh: typecheck, test PostgreSQL thật, `selfcheck --self-test`, `selfcheck --strict`.<br>2. Diagnostics **0 mục error** trên bản sao ẩn danh của dữ liệu thật.<br>3. **Thử nâng cấp** từ bản stable trước và từ LTS đang hỗ trợ.<br>4. `npm audit --omit=dev` không còn high / critical.<br>5. Hiệu năng không xấu hơn mốc > 20% (R-KER-9).<br>6. `--update-lock` khoá migration mới.<br>7. Ghi chú phát hành. | checklist [../ops/RELEASE.md](../ops/RELEASE.md) §2; workflow `release.yml` (Phase 3) |
| **R-REL-5** *(T0)* | Migration **chỉ tiến**, không có migration lùi. Quay lui một bản cài = khôi phục bản sao lưu ngay trước cập nhật + image cũ. Đổi lược đồ phá vỡ theo **mở rộng → chuyển dữ liệu → thu gọn**, trải qua ≥ 2 bản minor | SC-DATA-2 (khoá băm); `cap-nhat.sh` sao lưu trước |
| **R-REL-6** | Bản vá bảo mật: làm trên nhánh riêng, **không** công khai chi tiết trước khi có bản vá; phát hành đồng thời cho stable và LTS; ghi mục "Bảo mật" trong CHANGELOG + thông báo GitHub Security Advisory sau khi phát hành | [SECURITY.md](../../SECURITY.md); R-SEC-9 |
| **R-REL-7** | Bỏ một thứ công khai (route, trường, hợp đồng, công cụ MCP, năng lực): báo "sẽ bỏ" trong CHANGELOG ít nhất một bản minor trước; chỉ bỏ ở major; hợp đồng cũ chạy song song ≥ 2 bản phát hành (VERSIONING) | duyệt PR |
| **R-REL-8** | Tạo phẩm: image Docker có nhãn OCI `org.opencontainers.image.version` + `revision` và được tham chiếu bằng digest; kèm SBOM (CycloneDX) và tệp checksum | workflow `release.yml` (Phase 3) |
| **R-REL-9** | Cập nhật bản cài chỉ bằng `scripts/cap-nhat.sh`: sao lưu → kéo image → migrate → chờ khoẻ → **tự chẩn đoán đầy đủ** (RULE-SELF-DIAGNOSTICS L1–L3). Có error thì dừng và hướng dẫn quay lui (D-4) | `cap-nhat.sh`; R-DIAG-3 |
| **R-REL-10** | Mỗi bản phát hành lưu hồ sơ: commit, `SCOREBOARD.md` + `evidence.txt` của bộ kiểm, kết quả diagnostics bản sao, kết quả thử nâng cấp, kết quả hiệu năng. Lưu ở GitHub Release dưới dạng tệp đính kèm | [../ops/RELEASE.md](../ops/RELEASE.md) §3 |
