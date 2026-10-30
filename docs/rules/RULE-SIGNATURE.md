# RULE-SIGNATURE · Chữ ký kiến trúc và dấu thay đổi (R-SIG)

<!-- [2026-10-30 09:40 PM Johnny Chu - Chu Hoàng Anh] R-SIG — chủ dự án yêu cầu chữ ký trên toàn bộ framework, luồng, kiến trúc, hạ tầng của open-ketoan, kèm các lần chỉnh sửa theo từng phase. -->

> **Vì sao:** kiến trúc open-ketoan do **Johnny Chu – Chu Hoàng Anh** thiết kế ([Bản công bố §0](../CONG-BO-KIEN-TRUC.md), [LICENSE](../../LICENSE)).
> - Mỗi tệp thuộc **framework** phải mang chữ ký đó.
> - Mỗi lần sửa có chức năng phải để lại **dấu thay đổi**: ai chỉ đạo, lúc nào, thuộc phase / luật nào, đổi gì.
> - Dấu nằm **ngay trong tệp**: đọc mã là thấy lịch sử quyết định, không phụ thuộc git (bản sao chép, bản fork, bản zip vẫn còn).
>
> Cùng quy ước **R-STAMP** của `bizcity-twin-ai`.

## 1. Khuôn dấu

```text
[YYYY-MM-DD HH:MM AM/PM Johnny Chu - Chu Hoàng Anh] <MÃ> — <mô tả ngắn, cụ thể>
```

- **Thời gian:** giờ địa phương của dự án (Asia/Ho_Chi_Minh), dạng `2026-10-30 07:06 PM`.
- **Người:** người **chỉ đạo / duyệt** thay đổi, không phải công cụ gõ ra nó. **Không bao giờ** ghi tên agent hay model (Claude, Copilot, Codex, Cursor, GPT…) vào chỗ người.
- **Mã:** phase ([docs/phases](../phases/README.md), vd `PHASE-004`), luật (`R-SIG`, `R-OUTBOX`…), ADR (`ADR-0009`), hoặc `HOTFIX`.
- **Mô tả:** nói thay đổi hành vi gì, không viết "cập nhật", "sửa lỗi" chung chung.
- **Công cụ:** `node scripts/ky-dau.mjs <MÃ> "<mô tả>" --file <tệp>` in sẵn dòng đúng giờ (Asia/Ho_Chi_Minh) và đúng cú pháp chú thích; từ chối tên agent.

Cú pháp theo loại tệp:

| Tệp | Dấu |
|---|---|
| `.ts` `.tsx` `.js` `.mjs` | `// [ … ] PHASE-004 — …`. Đặt **sau dòng nhãn lớp** `// @bizcity-layer` (dòng 1 dành cho nhãn, R-BOUND-10) |
| `.sql` | `-- [ … ] …` |
| `.sh` `.yml` `.yaml` `Dockerfile` `.conf` | `# [ … ] …` (sau dòng `#!` nếu có) |
| `.md` | `<!-- [ … ] … -->` ngay dưới tiêu đề |
| `.json` | không có chú thích: dùng trường `updated` / `note` của tệp, và dấu ở tệp mã / tài liệu đi kèm |

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-SIG-1** *(T0)* | Mỗi tệp **framework** (§3) có **ít nhất một** dấu của **Johnny Chu - Chu Hoàng Anh**: chữ ký kiến trúc, thường là dấu tạo tệp | SC-SIG-1 |
| **R-SIG-2** *(T0)* | Mỗi lần sửa **có chức năng** một tệp framework thêm **một dấu mới** cho phase / luật đó. Một tệp có nhiều phần đổi không liên quan → mỗi phần một dấu, đặt ngay trên chỗ đổi (hàm mới, nhánh `if` mới, khối SQL mới). Sửa chính tả, định dạng, đổi tên biến thuần tuý: không cần dấu | review; SC-SIG-1 |
| **R-SIG-3** *(T0)* | **Không xoá, không sửa** dấu cũ. Đổi lại quyết định → dấu mới ghi rõ thay quyết định nào | review |
| **R-SIG-4** *(T0)* | Người trong dấu là người chỉ đạo / duyệt. Cấm tên agent / model ở chỗ người | SC-SIG-2 |
| **R-SIG-5** | Dấu đúng khuôn §1: có ngày, giờ AM/PM, người, mã, mô tả | SC-SIG-2 |
| **R-SIG-6** *(T0)* | **Migration đã phát hành** (`tests/conformance/locks/migrations.lock.json`) không thêm dấu: không sửa một byte (R-DB-14). Lịch sử của chúng nằm ở migration mới và tài liệu | SC-DATA-2 |
| **R-SIG-7** | Người đóng góp ngoài nhóm Lõi sửa framework: dấu ghi **người chỉ đạo** việc đó (thường là chủ dự án / người duyệt PR). Thêm dấu thứ hai `[… <tên người đóng góp>] … (đóng góp)` nếu muốn ghi công. Không xoá chữ ký kiến trúc | review |
| **R-SIG-8** | Trước khi bàn giao (agent hoặc người): liệt kê tệp framework đã sửa, xác nhận mỗi phần đổi có dấu. Thiếu dấu là **KHÔNG ĐẠT**, không phải chuyện trình bày | SC-SIG-1; mẫu PR |

## 3. Tệp nào là framework

Bộ kiểm SC-SIG-1 dùng đúng danh sách này (`tests/conformance/lib/framework-files.mjs`):

| Nhóm | Tệp |
|---|---|
| Kernel + Platform (mã) | `apps/api/src/**` có nhãn lớp **K** hoặc **P** (sổ cái, cửa nạp, định khoản, sự kiện, action, bằng chứng, xác thực, CSDL, MCP, chẩn đoán…); `apps/api/src/app.ts`, `main.ts` |
| Hợp đồng dùng chung | `packages/contracts/src/**`, `packages/module-sdk/**` |
| CSDL | `db/migrations/*.sql` **chưa phát hành** (R-SIG-6) |
| Hạ tầng | `infrastructure/**` (trừ `.json`), `docker-compose*.yml`, `docker/**`, `.github/workflows/*.yml` |
| Công cụ framework | `scripts/*.sh`, `scripts/*.mjs`, `tests/conformance/**/*.mjs` (trừ `fixtures/`, `output/`) |
| Kiến trúc, luật, hợp đồng, chuẩn, vận hành, phase | `docs/CONG-BO-KIEN-TRUC.md`, `docs/00-CANON.md`, `docs/architecture/**`, `docs/standard/*.md`, `docs/contracts/*.md`, `docs/rules/*.md`, `docs/adr/*.md`, `docs/ops/*.md`, `docs/framework/*.md`, `docs/phases/**/*.md`, `docs/audits/*.md` |
| Tệp gốc | `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `SECURITY.md`, `TRADEMARK.md`, `.github/copilot-instructions.md` |

**Không** thuộc framework (không bắt buộc chữ ký kiến trúc, vẫn nên có dấu thay đổi):
- phân hệ / module nghiệp vụ (`phan-he/*`, lớp D / A / M / U);
- giao diện `apps/web`;
- hướng dẫn người dùng `docs/huong-dan`, `docs/nghiep-vu`;
- dữ liệu mẫu, preset.

## 4. Ví dụ

```ts
// @bizcity-layer K kernel/intake
// [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn.
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — markPosted / cancel phát bizcity.ledger.entry.posted / reversed.
/**
 * Cửa ghi sổ cho sự việc do Kernel tự lập …
 */
```

```sql
-- [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — posting_policy_versions (ADR-0009).
```

```markdown
# PHASE-006 — Transactional outbox
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — thiết kế D006-1…9, code W0–W4. -->
```

## 5. Lịch sử ký bù (reflect 2026-10-30)

Quy ước có từ 2026-10-30. Các tệp framework làm trước đó được **ký bù**:
- Giờ ký = giờ commit thật trong git của từng phase.
- Chỉ ký các commit của tài khoản chủ dự án; commit của người đóng góp khác không ghi tên Johnny Chu.
- Không ký migration đã phát hành.

Bảng commit → mã phase và kết quả: [AUDIT-2026-10-30-CHU-KY](../audits/AUDIT-2026-10-30-CHU-KY.md).
