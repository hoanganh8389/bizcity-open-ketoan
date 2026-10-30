# Đóng góp cho Bizcity Core (open-ketoan)

Cảm ơn bạn muốn đóng góp. Đây là **phần mềm kế toán**: một dòng code sai có thể làm sai sổ của doanh nghiệp. Quy trình dưới đây chặt hơn một dự án web thường. Làm đúng thì PR vào nhanh.

> **Cộng đồng được tự do phát triển module, nhưng không được tự do thay đổi sự thật kế toán.** (Johnny Chu – Chu Hoàng Anh, [Bản công bố kiến trúc §0](docs/CONG-BO-KIEN-TRUC.md))

> Người mới: đọc [docs/00-CANON.md](docs/00-CANON.md) (luật), [docs/architecture/README.md](docs/architecture/README.md) (kiến trúc), [docs/phat-trien.md](docs/phat-trien.md) (chạy máy dev). Agent AI: [AGENTS.md](AGENTS.md).

## 1. Bốn câu không thương lượng

1. Không sự việc (`accounting_events`) thì không bút toán.
2. Sổ cái chỉ thêm. Sửa / huỷ bằng bút toán đảo, không `UPDATE` / `DELETE` bảng `ledger_*`.
3. Mọi đầu vào tài chính đi `postDocumentIn()` → luật định khoản → `ledgerService.post()`. Module, add-in không gọi thẳng `ledgerService`, không ghi bảng nhân.
4. Không viết số tài khoản trong code định khoản: tra qua `AccountResolver`.

PR vi phạm một trong bốn câu sẽ bị đóng, dù test xanh.

## 2. Bạn muốn đóng góp gì?

| Loại | Bắt đầu ở | Người duyệt |
|---|---|---|
| **Module mới** (CRM, nhân sự, sản xuất…) | [docs/standard/README.md](docs/standard/README.md) + ca mẫu [GOLDEN-CASE-HOP-DONG](docs/standard/GOLDEN-CASE-HOP-DONG.md). Không sửa Kernel, không sửa module khác | 1 người phụ trách module |
| **Gói định khoản theo ngành** | [BIZCITY-POSTING-TEMPLATE-v1](docs/contracts/BIZCITY-POSTING-TEMPLATE-v1.md), kiểm `--module <thư mục gói>` (SC-TPL-1) | 1 người hiểu nghiệp vụ kế toán |
| **Preset cài nhanh** | [presets/README.md](presets/README.md), dữ liệu **hư cấu** (SC-PRESET-1) | 1 người |
| **Sửa lỗi** | issue theo mẫu [Báo lỗi](.github/ISSUE_TEMPLATE/bao-loi.yml); viết test tái hiện **trước** khi sửa | theo tầng bị đụng (§4) |
| **Kernel** (định khoản, sổ, kỳ, cửa nạp) | [RULE-KERNEL](docs/rules/RULE-KERNEL.md): ghi mức K0–K3; K3 cần ADR | K0–K1: 1 người nhóm Lõi · K2: 2 người, 1 hiểu nghiệp vụ · K3: 2 người Lõi + ADR + kế toán trưởng |
| **Năng lực Core mới** module cần | đề xuất theo [VERSIONING §5](docs/standard/VERSIONING.md) trước, code sau | nhóm Lõi |
| **Tài liệu** | sửa thẳng; liên kết phải tới được (SC-DOC-1) | 1 người |
| **Lỗ hổng bảo mật** | **không** mở issue công khai, xem [SECURITY.md](SECURITY.md) | — |

## 3. Quy trình

1. **Issue hoặc thảo luận trước** với việc lớn hơn sửa lỗi nhỏ: tránh làm rồi bị từ chối vì sai hướng kiến trúc.
2. **Nhánh** từ `main`: `feat/<việc>`, `fix/<việc>`, `docs/<việc>`. Không đẩy thẳng `main`.
3. **Commit** theo Conventional Commits, mô tả tiếng Việt: `feat(quy): …`, `fix(ledger): …`, `docs: …`. Một commit một ý.
4. **Đổi code X thì sửa tài liệu Y trong cùng PR**: bảng [CANON §5](docs/00-CANON.md). Thêm khoá cấu hình → settings registry. Thêm mã lỗi → [BIZCITY-ERRORS](docs/contracts/BIZCITY-ERRORS-v1.md). Thêm số đo / cảnh báo → [OBSERVABILITY](docs/ops/OBSERVABILITY.md).
5. **Chạy kiểm** (§5), dán khối bằng chứng vào PR theo [DIAGNOSTICS §4](docs/ops/DIAGNOSTICS.md).
6. **Mở PR** theo [mẫu](.github/PULL_REQUEST_TEMPLATE.md): tầng bị đụng, mức Kernel, luật đã kiểm.
7. **CHANGELOG**: thay đổi người dùng thấy được ghi vào `[Chưa phát hành]` (R-REL-2). Đổi cách ghi sổ ghi vào mục "Thay đổi định khoản".

## 4. Tầng và người duyệt

| Tầng | Đường dẫn | Duyệt |
|---|---|---|
| T0 Nhân | `apps/api/src/core/`, `modules/{documents,posting,ledger,periods}`, `packages/contracts`, trigger sổ cái, `db/migrations` | 2 người, 1 nhóm Lõi ([CODEOWNERS](.github/CODEOWNERS)) |
| T1 Dịch vụ lõi | `apps/api/src/modules/*` khác, `apps/web/src/{features,components}` | 1 nhóm Lõi |
| T2 Phân hệ / module | `apps/*/src/phan-he/<key>/`, sau này `modules/<key>/` | người phụ trách module |
| T3 Add-in, preset, gói định khoản | `apps/*/src/addins/<id>/`, `presets/`, gói | người phụ trách |

## 5. Trước khi mở PR

```bash
node tests/conformance/selfcheck.mjs        # bộ kiểm chuẩn + bảng điểm: ĐẠT (không cần npm install)
node tests/conformance/selfcheck.mjs --strict   # như CI
bash scripts/kiem-chuan.sh                  # ranh giới: ĐẠT
node scripts/gan-nhan-lop.mjs --write       # tệp mới trong apps/api/src có nhãn lớp (R-BOUND-10)
npm run typecheck
docker compose up -d db && npm test         # PostgreSQL thật; sau mỗi tệp test tự kiểm bất biến sổ
```

- **Nợ mới** bộ kiểm báo thì sửa, **không** thêm vào `tests/conformance/baseline.json`. Nợ cũ đã hết thì chạy `--update-baseline`.
- **Check mới**: [tests/conformance/README.md](tests/conformance/README.md) §7, kèm ca tự kiểm trong `fixtures/`.

## 6. Quy ước code

- **Ngôn ngữ:** tên bảng, cột, biến bằng tiếng Anh; chú thích, thông báo, tài liệu bằng tiếng Việt có dấu.
- **Tiền:** `numeric(18,2)` ở CSDL, cộng trừ qua `toCents` / `fromCents`.
- **Lỗi:** `Errors.*`, mã trong danh mục `bizcity_errors@1`, thông báo nói sai gì và làm gì tiếp (R-ERR-3).
- **Migration:** tệp mới số kế tiếp; không sửa tệp đã chạy; có `COMMENT ON`; cập nhật `db/types.ts` (SC-DATA-7) và `schema-catalog.ts`.
- **Ranh giới:** phân hệ không import phân hệ khác (R-BOUND-1); import đúng chiều lớp (SC-LAYER-2).
- **Thao tác ghi mới:** viết bằng `defineAction` (quyền, idempotency, bằng chứng do runtime lo), không route Fastify tay.
- **Log và số đo:** không dữ liệu cá nhân, không bí mật (R-SEC-10); số đo không nhãn `tenant` (R-OBS-4).
- **Đặt tên mới:** [04-DAT-TEN-BIZCITY](docs/framework/04-DAT-TEN-BIZCITY.md).

## 7. Quyết định kiến trúc (ADR)

Cần ADR khi quyết định khó đảo ngược hoặc là ngoại lệ Tier 1. Ví dụ:
- thêm hạ tầng bắt buộc;
- đổi cách đảo bút toán;
- tách gói;
- bỏ một luật.

Khuôn và danh sách: [docs/adr/README.md](docs/adr/README.md). ADR chỉ thêm. Quyết định bị thay thì ghi "Thay bởi ADR-xxxx".
