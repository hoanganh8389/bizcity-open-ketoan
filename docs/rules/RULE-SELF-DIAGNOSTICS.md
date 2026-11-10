# RULE · Tự chẩn đoán (R-DIAG)
<!-- [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->

> **Cấp:** Tier 0 / 1 (ghi từng luật) · **Phiên bản:** 1.0 · 2026-10-29 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Danh sách mã kiểm và khuôn kết quả:** [../ops/DIAGNOSTICS.md](../ops/DIAGNOSTICS.md) · **Bộ kiểm đang chạy được:** [../../tests/conformance/](../../tests/conformance/README.md) (lane diagnostics)
> **Mục tiêu:** mỗi bản cài **tự biết mình còn đúng không**: sổ có cân không, lớp bảo vệ còn nguyên không, cấu hình có lệch chuẩn không. Phải biết trước khi kế toán hay kiểm toán phát hiện ra.

## 1. Năm tầng

| Tầng | Hỏi gì | Ở đâu | Hiện có |
|---|---|---|---|
| **L0 Sống** | tiến trình chạy, CSDL trả lời `select 1` | `GET /api/v1/system/health` | **có** |
| **L1 Sẵn sàng** | migration đã áp hết; trigger bảo vệ sổ còn và đang bật; CSDL ghi được | `GET /api/v1/system/health/ready` (Docker healthcheck) | **có**: `MIGRATIONS_PENDING`, `LEDGER_TRIGGERS`, `DB_WRITABLE`; bộ kiểm DG-DB-1, DG-DB-2, DG-DB-4 |
| **L2 Bản cài** | đủ biến môi trường; múi giờ; vai trò CSDL không superuser; sao lưu gần nhất < 26 giờ; dung lượng đĩa > 15%; chứng chỉ https còn > 14 ngày; khoá Cell còn hiệu lực (nếu có) | `bizcity doctor`, màn Hệ thống → Chẩn đoán | một phần: DG-DB-3, DG-SEC-1 |
| **L3 Toàn vẹn sổ** | Nợ = Có; số dư ngày khớp dòng; đảo đúng một lần; không bút toán mồ côi; sự việc treo; công nợ, thuế khớp sổ | `GET /api/v1/system/diagnostics`; trước khi khoá kỳ; `afterAll` mọi tệp test | **có**: `LEDGER_*`, `EVENT_*` (bộ kiểm DG-LEDGER-*, DG-EVENT-*); trạng thái theo kỳ `INVENTORY_NEGATIVE`, `PERIOD_CLOSE_OPEN` (DG-INV-1, DG-CLOSE-1, mức warn); thuế / hoá đơn `VAT_REDUCED_RATE`, `VAT_INPUT_NONCASH`, `INVOICE_FIELDS`, `INVOICE_ISSUE_DATE` (DG-VAT-1/2, DG-EINV-1/2) <!-- [2026-11-02 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-11 --> <!-- [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19 -->; công nợ, thuế khớp sổ (DG-PLAN-*) chưa viết |
| **L4 Tuân chuẩn** | code, migration, hợp đồng, module tuân Standard | CI, `selfcheck.mjs` | **có**: SC-* |
| **L5 Tuân thủ** <!-- [2026-11-02 03:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — tầng L5 của Conformance Engine (ADR-0012 T1). --> | cấu hình của đơn vị theo quy định có hiệu lực: đã khai hồ sơ kế toán, gói định khoản cùng chế độ (lớp Cấu hình); lớp Doanh nghiệp không có kiểm L5 riêng: dùng kiểm L3 trạng thái theo kỳ (`TAX_INPUT_NO_INVOICE`, `EVENT_PENDING_AGE`, `INVENTORY_NEGATIVE`, `PERIOD_CLOSE_OPEN`) <!-- [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19 --> | `POST /api/v1/conformance/runs` (Hệ thống → Kiểm chuẩn); ảnh chụp ở `conformance_runs`, không ở `diagnostic_runs` | **có**: `PROFILE_DECLARED`, `PROFILE_PACK_REGIME` (bộ kiểm DG-PROFILE-1, -2); mức warn — phân tích để người dùng quyết định, không chặn (R-VNC-10) |

L0–L3 chạy **trên bản cài** (cả bản offline, không cần Cell, không cần mạng ngoài). L4 chạy trên mã nguồn (CI, máy dev, trước khi cài module).

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-DIAG-1** | Mỗi kiểm có: **mã ổn định** (`LEDGER_BALANCED`…), **mức** (`error` / `warn` / `info`), một câu tiếng Việt nói **hậu quả** và **cách sửa**. Cùng một mã cho cùng một ý nghĩa ở mọi nơi (endpoint, CLI, bộ kiểm, cảnh báo) | `schema/check.schema.json` (`code`) |
| **R-DIAG-2** *(T0)* | Tự chẩn đoán **chỉ đọc**: truy vấn trong giao dịch `READ ONLY`, không bao giờ tự sửa sổ. Sửa dẫn xuất (dựng lại `ledger_balances_daily`…) chỉ bằng lệnh do người chạy, thuộc danh sách ngoại lệ của RULE-LEDGER, có bằng chứng | `lib/db.mjs` (`default_transaction_read_only`); DG-DB-2 |
| **R-DIAG-3** | Lịch chạy:<br>- L0 / L1 mỗi 30 giây (healthcheck Docker);<br>- L2 mỗi giờ và sau khởi động;<br>- L3 mỗi đêm sau sao lưu, sau mỗi cập nhật (R-REL-9), và **trước khi khoá kỳ**.<br>- Kiểm chuẩn ba lớp (L5 + L3 theo kỳ) mỗi đêm 01:00 giờ VN: subscriber `core.conformance-nightly` nghe `bizcity.clock.daily`, ảnh chụp ở `conformance_runs` <!-- [2026-11-02 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20 / S020-21 / lịch đêm -->. | `events.clock` (Phase 3); `cap-nhat.sh` |
| **R-DIAG-4** *(T0)* | **Khoá kỳ bị chặn** khi L3 có mục `error` thuộc kỳ đó, trừ khi kế toán trưởng ghi lý do chấp nhận (có bằng chứng). <!-- [2026-11-10 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — ngoại lệ D032-11 --> **Ngoại lệ đã duyệt (D032-11, chủ dự án 2026-11-09; có hiệu lực khi S032-30 có mã):** sáu trạng thái sai về toán học / toàn vẹn — PC-006, PC-009 (sau settle), PC-016, PC-019, PC-021, PC-023 ([ADR-0033](../adr/ADR-0033-inventory-engine-gia-von-kho.md)) — **không** chấp nhận được bằng lý do, kể cả quản trị; cách thoát là sửa chứng từ hoặc chạy lại | `apps/api/test/diagnostics.test.ts` |
| **R-DIAG-5** | Kết quả lưu vào bảng chỉ thêm `diagnostic_runs` (giữ 90 ngày), xem ở *Hệ thống → Chẩn đoán*, có xu hướng theo ngày giống bảng điểm của bộ kiểm | migration `0034_chan_doan.sql`; `apps/api/test/diagnostics.test.ts` (màn xem: Phase 3) |
| **R-DIAG-6** | Cảnh báo khi có `error` mới:<br>- thông báo trong ứng dụng cho chủ và kế toán trưởng;<br>- có Cell thì phát sự kiện `bizcity.diagnostics.failed` để Cell nhắn Zalo; không có Cell thì gửi email nếu đã cấu hình.<br>Cảnh báo chỉ chứa mã, số lượng, đường dẫn mở màn; **không** chứa số liệu sổ, tên khách | test sự kiện (Phase 3) |
| **R-DIAG-7** | **Đạt rỗng không phải đạt**: kiểm không có dữ liệu để xét thì ghi "rỗng" (0 dòng đã xét), không tính điểm | `selfcheck.mjs` (đã làm) |
| **R-DIAG-8** | Gói hỗ trợ `bizcity doctor --bundle`: phiên bản, cấu hình đã **che bí mật**, kết quả L0–L3, 200 dòng log cuối đã che PII. **Không** có payload chứng từ, không có sổ. Người dùng tự xem rồi tự gửi | Phase 4 (CLI) |
| **R-DIAG-9** | Mỗi kiểm mới ở L1–L3 có bản trong lane diagnostics của bộ kiểm và chạy được bằng `--lane diagnostics` trên bản sao trước khi đưa vào endpoint | SC-DIAG-1 |

<!-- [2026-11-10 01:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — đề xuất R-DIAG-10..16, chưa duyệt -->
> <!-- [2026-11-09 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — Q032-7 = mở rộng, Q032-8 = đổi HT08 --> **Bổ sung đã duyệt (Q032-7 → D032-12, 2026-11-09):** R-DIAG-10..16 — một sổ điều kiện khoá sổ (PC); ba kỳ kiểm ngày · tuần · cuối tháng, ngày và tuần chỉ nhắc việc; ba mức khi khoá sổ *chặn khoá sổ · cần giải trình · để biết* theo kết quả; bản lưu tuần / tháng; khoá thử không ghi sổ; module tự khai phép kiểm; "kiểm được" là điều kiện của khuôn nạp. Chữ đầy đủ: [PHASE-032 · 70 §3](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md). Từng luật có hiệu lực khi việc tương ứng S032-35..38 có mã; trước đó các mục R-DIAG-1..9 ở trên vẫn là luật đang chạy.

### 2b. Chữ chốt trường `DiagCheck` cho R-DIAG-10..12 (PHASE-032 B2c-2, S032-35)
<!-- [2026-11-10 09:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2: chữ chốt trường DiagCheck (closeRef, kỳ kiểm, bước khoá, mức khi khoá) theo R-FLOW-2 -->

**Vấn đề.** Kế toán thấy việc ở *Việc hôm nay* nhưng không biết việc đó thuộc **điều kiện khoá sổ** nào, **khi nào** phải kiểm, và **đến lúc khoá kỳ** thì nặng hay nhẹ. 46 phép kiểm đang có chỉ mang mã, mức, cách sửa.

**Lựa chọn.**

1. **Kỳ kiểm, bước khoá, tên thuộc điều kiện khoá sổ (PC), không lặp trên từng phép kiểm.** Phép kiểm trỏ `closeRef`; chỉ ghi `cadence` / `stage` khi khác PC. Bỏ cách viết ở [70 §3](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md) đặt sáu trường lên mỗi phép kiểm: 46 phép kiểm × ba trường thì dễ lệch nhau.
2. **Người làm dùng `remedy.owner` đã có** (R-FIX-1), không thêm trường `owner` thứ hai. Vai thủ kho, thủ quỹ, thuế thêm vào `RemedyRole` khi có phép kiểm cần (minor `bizcity_remedy@1`, chữ chốt riêng).
3. **Sổ PC thuộc Kernel** (kiến thức kế toán); Platform chỉ giữ sổ đăng ký `registerCloseConditions()`, cùng khuôn `registerDiagnostics()`. Platform không import Kernel (LAYOUT-1).
4. **`severityAtClose` là hàm theo kết quả** (R-DIAG-12: cùng PC, khác kết quả thì khác mức). Mặc định giữ đúng khoá thật hôm nay (R-DIAG-4): `error` → *cần giải trình*, `warn` / `info` → *để biết*. Ở B2c-2 chưa phép kiểm nào trả *chặn khoá sổ*; giá trị đó có hiệu lực cùng danh sách D032-11 ở S032-30. **B2c-2 chỉ hiện mức, không đổi khoá kỳ thật** (lõi không nới, cũng không tự siết khi chưa có việc S032-30).
5. **`scopeBy` hoãn tới S032-28** (khoá kéo theo nhóm tính giá): không thêm trường chưa ai dùng (LEAN).

**Hình dạng.**

```ts
// packages/platform/src/system/diagnostics.ts — chỉ thêm, mọi trường mới đều tuỳ chọn
export type DiagCadence = 'day' | 'week' | 'period';       // hằng ngày · hằng tuần · cuối tháng (R-DIAG-11)
export type DiagStage = 'pre' | 'post' | 'lock';            // trước kết chuyển · sau kết chuyển · lúc khoá
export type CloseSeverity = 'block' | 'explain' | 'note';   // chặn khoá sổ · cần giải trình · để biết (R-DIAG-12)

export interface CloseCondition {
  code: `PC-${string}`;          // PC-001..PC-023 (PHASE-032 · 60 §2)
  title: string;                  // lời kế toán
  cadence: DiagCadence[];
  stage: DiagStage;
  /** Không phép kiểm nào nuôi PC này: ghi hôm nay kiểm bằng gì (kế toán kiểm tay, trigger, closing.service, việc S032-n sẽ thêm). */
  checkedElsewhere?: string;
}
export function registerCloseConditions(list: CloseCondition[]): void;
export function listCloseConditions(): CloseCondition[];

export interface DiagCheck {
  // … như hiện nay (code, layer, level, title, fix, remedy, scoped, run)
  closeRef?: `PC-${string}` | 'none';   // R-DIAG-10; 'none' = việc vận hành, không thuộc khoá sổ
  cadence?: DiagCadence[];               // chỉ khi khác PC
  stage?: DiagStage;                     // chỉ khi khác PC
  severityAtClose?: (r: { count: number; sample: string[] }) => CloseSeverity;  // chỉ gọi khi có chỗ sai
}

export interface DiagResult {
  // … như hiện nay
  closeRef?: string;          // mã PC hoặc 'none'
  closeTitle?: string;        // tên PC, để màn không phải tra
  cadence?: DiagCadence[];    // đã gộp: của phép kiểm, không có thì của PC
  stage?: DiagStage;
  atClose?: CloseSeverity;    // chỉ khi có chỗ sai (warn / error / info)
}
```

- Kernel khai `CLOSE_CONDITIONS` (23 dòng) ở `packages/kernel/src/modules/periods/close-conditions.ts`; `apps/api/src/app.ts` đăng ký cạnh `registerDiagnostics`. (đề xuất: tệp thêm ở PR mã B2c-2)
- `runDiagnostics` gộp trường vào từng kết quả. Lượt lưu nguyên trong `diagnostic_runs.checks` (jsonb): **không migration**. Lượt cũ thiếu trường thì màn ghi *chưa gắn điều kiện khoá sổ*.
- Bảng gắn 46 mã đang có vào PC: [70 §3a](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md).
- Màn *Việc hôm nay* ghi dưới mỗi việc, bằng lời kế toán: *Điều kiện khoá sổ: Chuyển kho, hàng đang chuyển · kiểm hằng ngày · khi khoá kỳ: để biết*. Việc `none` ghi *Việc vận hành, không thuộc khoá sổ*.

**Ảnh hưởng.** Chỉ thêm trường tuỳ chọn: module chưa khai vẫn chạy, kết quả cũ vẫn đọc được. Khoá kỳ thật (R-DIAG-4), `periods/check`, Khoá thử hôm nay không đổi hành vi. Module tự khai phép kiểm (R-DIAG-15) dùng cùng trường này khi tới S032-38.

**Kiểm bằng.** `apps/api/test/close-conditions.test.ts` (đề xuất: tệp thêm ở PR mã B2c-2; bản test của SC-DIAG-2, phép kiểm tĩnh trong selfcheck làm sau):
- mọi phép kiểm đã đăng ký (L1, L3, L5) có `closeRef` là `none` hoặc một PC đã đăng ký;
- mọi PC có ít nhất một phép kiểm nuôi hoặc có `checkedElsewhere`;
- mức khi khoá mặc định: `error` → `explain`, `warn` → `note`; đạt và rỗng không có `atClose`;
- một lượt L3 trả `closeRef`, `closeTitle`, `cadence`, `stage` cho từng kết quả.

## 3. Đối chiếu nhanh

```bash
# Máy dev / bản cài Docker: L1–L3 ngay hôm nay (chỉ đọc)
BIZCITY_PSQL="docker exec -i <tên-container-db> psql -U <user> -d <db>" node tests/conformance/selfcheck.mjs --lane diagnostics
```

Kết quả gần nhất trên máy dev (2026-10-29):
- 11/11 trigger bảo vệ sổ còn và đang bật (DG-DB-2 đạt);
- CSDL đúng múi giờ, UTF8, PostgreSQL ≥ 16;
- **API dùng vai trò superuser** (DG-SEC-1 cảnh báo, R-SEC-6);
- CSDL dev chưa có bút toán, nên L3 là "đạt rỗng".
