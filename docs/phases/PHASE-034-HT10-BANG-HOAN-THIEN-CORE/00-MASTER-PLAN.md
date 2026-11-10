# PHASE-034 · 00 — Kế hoạch & thiết kế: HT10 thành bảng hoàn thiện của Core
<!-- [2026-11-09 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — W0: thiết kế 5 thẻ của HT10 (Tiêu chí · Nền móng · Cổng & bộ kiểm · Bộ máy · Nhà phát triển), một khuôn dữ liệu, một cách tính mức đạt, đề xuất D034-1..10, câu hỏi Q034-1..5 -->

> **DRAFT.** Đọc cùng [README](README.md) (hiện trạng đọc mã). Mọi số đếm lấy từ `origin/main` `c0ccd842`. Phải đếm lại khi bắt đầu code.

## 1. Đích đến: một màn, năm thẻ, một cách đo

HT10 trả lời một câu cho hai người đọc: **Core làm được tới đâu, và bằng chứng ở đâu.**
- Kế toán xem để biết chỗ nào phần mềm tự giữ, chỗ nào mình còn phải tự kiểm.
- Dev xem để biết việc kế tiếp.

Hôm nay màn mới trả lời được theo hai góc nhìn: tiêu chí và nền móng. Phase này thêm ba góc còn thiếu:

| Thẻ (`?xem=`) | Câu hỏi | Đơn vị đo | Nguồn | Trạng thái |
|---|---|---|---|---|
| **Tiêu chí theo trụ cột** (rỗng) | Core bảo đảm điều gì? | tiêu chí | `tru-cot.json` | có |
| **Nền móng** (`nen-mong`) | Sáu năng lực lõi × 17 trụ cột đạt tới đâu? | tín hiệu kiểm | `nen-mong.json` | có mã, **hỏng ở bản cài** → B1 |
| **Cổng & bộ kiểm** (`cong-kiem`) | Dữ liệu đi qua những cổng nào, mỗi cổng bắt được gì, mã nào chưa có cách sửa / test? | mã kiểm | registry trong mã + `cong-kiem.json` sinh từ CI | mới → B3 |
| **Bộ máy** (`bo-may`) | Mỗi engine làm gì, theo hợp đồng nào, còn bao nhiêu mốc? | mốc (`S0xx-*`) | `bo-may.json` + `bang-viec.json` | mới → B4 |
| **Nhà phát triển** (`nha-phat-trien`) | Công cụ dev nào dùng được, chạy ngay tại đây | công cụ × tiêu chí hoàn thiện | `cong-cu-dev.json` + menu `dev` | mới → B5 |

Thứ tự thẻ đi **từ trong ra ngoài**: luật (tiêu chí) → nền (nền móng) → cổng giữ luật → bộ máy chạy luật → công cụ để dev xem bộ máy chạy. Đúng thứ tự chủ dự án nêu.

```
┌ Trụ cột & mức đạt  HT10 ─────────────────────────────────────── [In] [Hướng dẫn] ┐
│ Tiêu chí 61% · Nền móng 9/17 · Cổng 78% có cách sửa · Bộ máy 7/13 · Công cụ dev 6/9 │ ← B6 dòng tổng
│ [Tiêu chí theo trụ cột] [Nền móng] [Cổng & bộ kiểm] [Bộ máy] [Nhà phát triển]        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Nền móng: sửa lỗi và chặn tái phát

**Nguyên nhân.**
- `packages/platform/src/core/version.ts` đọc `docs/standard/nen-mong.json` lúc chạy.
- `docker/api.Dockerfile` (dòng 61–65) chỉ `COPY` `bizcity-standard.json`, `tru-cot.json` và `bizcity-settings.registry.json`.
- Ảnh không có tệp, nên `FOUNDATIONS = null` và `GET /api/v1/system/foundations` trả NOT_FOUND.
- Chạy `npm run dev` không lỗi, vì đọc thẳng từ repo. Vì thế test và CI đều không thấy.

**Sửa (B1, một PR nhỏ):**

1. Thêm `COPY docs/standard/nen-mong.json docs/standard/nen-mong.json` vào `docker/api.Dockerfile`.
2. **SC-REL-3** (mới, `tests/conformance/checks/release/runtime-docs.check.mjs`, luật **R-REL-11**):
   - trong `packages/*/src`, `apps/api/src`, `modules/*` (bỏ test), tệp nào `import` `node:fs` thì mọi chuỗi `'docs/….json|yaml'` trên dòng mã (không phải chú thích) là tệp **đọc lúc chạy**;
   - mỗi tệp đó phải có trong repo và có `COPY` (đúng tệp, hoặc thư mục cha) ở giai đoạn chạy của `docker/api.Dockerfile`;
   - bản xấu riêng ở `tests/conformance/fixtures/runtime-docs-bad/` (như `foundations-bad/`), không đụng `repo-bad/`.
3. **Không thêm danh sách thứ hai (D034-2).** Phép kiểm tự dò từ mã, nên không cần hằng `RUNTIME_DOCS`. Các thẻ B3..B5 thêm tệp mới mà quên `COPY` thì SC-REL-3 đỏ ngay ở PR đó.
4. Màn báo lỗi thân thiện hơn. Thiếu tệp thì nói *"Bản cài thiếu tệp X — dựng lại ảnh (Cách sửa: …)"*, theo khuôn `remedy`, không đổ nguyên câu NOT_FOUND.

> Vì sao không nhúng JSON vào bundle lúc build? Vì `version.ts` cố ý đọc lúc chạy, để chủ cài sửa được bảng mà không phải build lại (D026-6). Giữ cách đó, chỉ chặn chuyện thiếu tệp.

## 3. Thẻ Cổng & bộ kiểm

### 3.1 Cổng nào

Đi theo đường dữ liệu, từ ngoài vào trong. Mỗi dòng là một **cổng**. Trong cổng là các **mã kiểm**.

| Cổng | Lúc chạy | Lớp / bậc | Mã hôm nay | Định nghĩa ở |
|---|---|---|---|---|
| **A · Danh mục → nháp** | khi gọi `/validate` (đọc) | — | ACC-*, PART-*, ITEM-* | `packages/contracts/src/catalog-hint.ts` |
| **B · Cửa nạp (preflight)** | request nạp chứng từ | L1 hình dạng · L2 số học · L3 danh mục · L4 nghiệp vụ · L4b chính sách · L5 hạch toán thử | 37 `IN-*`, `POL-*` | `kernel/intake/preflight.ts`, `trial-posting.ts`, `contracts/src/intake-findings.ts` |
| **Commit Guard** | `POST /documents`, `core.document.submit` | — | IN-GUARD-001 | `kernel/intake/guard.ts` |
| **C · Sau ghi sổ (giá vốn)** | lần tính giá, settle | — | `CT-*`, **0 mã** | ADR-0021 / ADR-0033; PHASE-032 |
| **Khoá kỳ** | ghi sổ, `POST /periods/locks` | — | `PERIOD_LOCKED`, R-DIAG-4 | `kernel/periods`, `ledger.service.ts` |
| **Trigger CSDL** | mọi lệnh ghi | — | chỉ thêm, cân bằng, chuỗi băm, guard | `db/migrations/*.sql`; L1 `LEDGER_TRIGGERS` |
| **Chẩn đoán trong app** | `health/ready` (L1), `GET /diagnostics` (L3), lịch đêm, trước khoá | L1 · L3 · L5 | 42 mã | `platform/src/system/diagnostics.ts` + `*.diagnostics.ts` |
| **Bộ kiểm CI** | mỗi PR, `scripts/kiem-chuan.sh` | selfcheck · diagnostics | 85 `SC-*`, 47 `DG-*` | `tests/conformance/**` |

### 3.2 Dữ liệu: sinh ra, không gõ tay (D034-3)

Mỗi mã kiểm là một dòng theo khuôn `bizcity_gates@1`:

```jsonc
{
  "id": "LEDGER_BALANCED",          // mã đúng như trong mã nguồn
  "gate": "diag",                   // A | B | guard | C | lock | trigger | diag | ci
  "layer": "L3",                    // nếu có
  "runsAt": ["request", "nightly", "lock"],
  "severity": "error",              // error | warn | info
  "pillars": ["I"],                 // trụ cột ở tru-cot.json / nen-mong.json mà mã này giữ
  "pc": ["PC-016"],                 // dòng sổ phép kiểm khoá kỳ (PHASE-032 · 60), nếu có
  "remedy": true,                   // có khuôn Cách sửa (bước, màn, vai, forbid)
  "test": "apps/api/test/diagnostics.test.ts",
  "state": "co"                     // co | nhanh | chua (như nen-mong.json)
}
```

Nguồn theo từng cổng:

| Phần | Nguồn | Cách lấy |
|---|---|---|
| Chẩn đoán L1 / L3 / L5 | `listDiagnostics()` lúc chạy | API đọc thẳng registry, **sống**, cộng kết quả lượt gần nhất từ `diagnostic_runs` (đạt / sai / không có dữ liệu) |
| Cổng A, B, Guard, `POL-*` | `FINDINGS_LIBRARY`, `INTAKE_CATALOG` (`@ketoan/contracts`) | API đọc hằng số, sống |
| `SC-*`, `DG-*`, trigger | chỉ có ở repo / CI | `scripts/cong-kiem-json.mjs` sinh `docs/standard/cong-kiem.json`; `--kiem` chạy trong `kiem-chuan.sh` như `tru-cot-md.mjs` |
| `pillars`, `pc` | **khai ngay cạnh mã** | thêm trường `pillars?: string[]` vào `DiagCheck` và dòng `FINDINGS_LIBRARY`, thêm `pillars` vào `export const checks` của `.check.mjs`. Script chỉ gom lại |
| Cổng C | chưa có mã | hiện **dòng giữ chỗ** từ ADR-0033 (`state: chua`) để thấy khoảng trống |

**Một sổ, không hai (D034-4).** PHASE-032 · 60 và PHASE-033 (PC-001..023) đã nói *"một sổ đăng ký phép kiểm, ba nhịp"*. `cong-kiem.json` không phải sổ thứ hai. Nó là **mặt xem theo cổng** của cùng các mã đó:
- trường `pc` nối mã với dòng PC;
- PHASE-033 đọc lại đúng các dòng này để làm Bảng B.

### 3.2b Đính chính B3b — gắn trụ cột theo họ mã, không sửa `DiagCheck` (D034-11)
<!-- [2026-11-11 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — D034-11: B3b gắn trụ cột theo họ mã trong một tệp; test / CI / trigger sinh từ repo; không đụng Platform -->

Đếm trên `origin/main` (2026-11-11): 46 mã chẩn đoán trong hơn 40 tệp `*.diagnostics.ts`; 23 họ mã ở cổng A / B / L; 140 check CI (`SC-*` + `DG-*`); 108 trigger CSDL. Thêm trường `pillars` cạnh từng mã (D034-3 cũ) phải sửa `DiagCheck` ở Platform (thứ dùng chung, R-FLOW-2) và chạm hàng chục tệp đang thuộc dòng giữ chỗ khác (PHASE-032…). Đổi thành:

| | Cách làm | Ai ghi |
|---|---|---|
| **Trụ cột** | `docs/standard/cong-kiem.json` → `map[]`: mẫu mã (`LEDGER_*`, `IN-POL-*`, `SC-ITEM-*`, `items_*`…) → trụ cột ở `tru-cot.json`. Mã cụ thể đặt trước mẫu rộng; dòng đầu khớp thì dùng | sửa tay, SC-GATE-1 kiểm |
| **Test của mã** | `scripts/cong-kiem.mjs` quét `apps/api/test/*.test.ts`: tệp nào có chuỗi mã → mã có test | sinh, không gõ |
| **Bộ kiểm CI** | cùng script: mọi `SC-*` / `DG-*` (id, tiêu đề, cổng, mức chặn) + có ca tự kiểm trong `expect.json` hay không | sinh |
| **Trigger CSDL** | cùng script: `CREATE TRIGGER` trong `db/migrations` (tên, migration) + có được `LEDGER_TRIGGERS` kiểm hay không | sinh |

- API `GET /system/gates` đọc tệp này: cổng **Trigger** và **CI** thành "có sổ".
- Mỗi mã có thêm `pillars[]` và `tests[]`.
- **Mức một mã** ở cổng A / B / Guard / L / chẩn đoán: đủ bốn ý, mỗi ý ¼ — có Cách sửa · có phương án có cấu trúc · có test · gắn trụ cột (đúng §3.3).
- **Mức một mã** ở CI / trigger: gắn trụ cột ½ + có ca tự kiểm (CI) hoặc được `LEDGER_TRIGGERS` kiểm (trigger) ½.

**SC-GATE-1** kiểm ba điều:
1. Mỗi `map[].pillars` là id có thật.
2. Phần sinh khớp lần chạy lại của script.
3. Mã nào script tìm thấy mà không khớp mẫu nào thì báo *"chưa gắn trụ cột"*.

Cổng *Khoá kỳ* và *Cổng C* vẫn giữ chỗ (PHASE-032 / 033).

Đánh đổi: trụ cột gắn theo họ, không theo từng mã. Mã nào lệch khỏi họ của nó thì thêm một dòng mã cụ thể vào `map[]`.

### 3.3 Màn

```
[Mọi cổng] [A] [B] [Guard] [C] [Khoá kỳ] [Trigger] [Chẩn đoán] [CI]     ☐ chỉ mã còn thiếu
┌ Cổng B · Cửa nạp ──────── 37 mã · 31 có cách sửa · 29 có test · 33 gắn trụ cột  ▓▓▓▓▓▓░ 84% ┐
│ Mã            Lớp  Mức   Trụ cột  Cách sửa  Test  Lượt gần nhất   Kiểm gì                    │
│ IN-ITEM-003   L3   error  II       ✓         ✓     —               Mặt hàng nháp chưa duyệt   │
│ IN-POL-004    L4b  warn   V        ✓         ✗     —               Chính sách hết hiệu lực…   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
┌ Cổng C · Sau ghi sổ ─────── 0 / 11 mã dự kiến · PHASE-032 S032-12..20 ░░░░░░░ 0% ─────────────┐
```

- **Mức hoàn thiện của một mã** = đủ bốn ý: có mã chạy được (`state: co`) · có `remedy` · có test · gắn ít nhất một trụ cột. Mỗi ý ¼.
- Mức của cổng = trung bình các mã. Cùng cách cộng trọng số với `pillarScore`, nên cả màn đo một kiểu.
- Bấm một mã: mở khuôn Cách sửa và kết quả lượt chẩn đoán gần nhất. Có quyền `devtools:read` thì có thêm nút **Mở ở Toàn vẹn (DEV07)**.

## 4. Thẻ Bộ máy (engine)

### 4.1 Mười ba bộ máy

"Bộ máy" là phần **tính hoặc quyết định thay người**, có hợp đồng, mà module gọi vào chứ không tự viết lại (LEAN-1). Danh sách đề xuất (Q034-3):

| # | Bộ máy | Lớp | Mã | Hợp đồng | Hôm nay | Phase làm tiếp |
|---|---|---|---|---|---|---|
| E01 | Ghi sổ (định khoản) | Kernel | `kernel/posting` | `bizcity_posting_rule`, `bizcity_posting_template` | có | PHASE-024 / 031 |
| E02 | Inventory Engine (kho · lô · giá vốn) | Kernel | `kernel/inventory` | `bizcity_inventory@1` (draft) | một phần: bình quân tháng, chưa lô / lớp giá | **PHASE-032** |
| E03 | Document SDK (chứng từ) | Platform | `platform/core/documents.ts` | `bizcity_document@1` | có | PHASE-029 |
| E04 | Đánh số chứng từ | Kernel | `kernel/documents/numbering.ts` | `bizcity_document@1` §3 | có, chưa test riêng | — |
| E05 | Workflow (duyệt nhiều cấp, tách nhiệm) | Platform | `platform/core/workflow.ts` | `bizcity_document@1` §5 | có | PHASE-028 |
| E06 | Phân quyền (`authorize()`) | Platform | `platform/core/authz/engine.ts` | ADR-0027 | có | PHASE-028 |
| E07 | Policy Registry & Rule Contracts | Platform | `platform/core/policies.ts` | ADR-0031 | một phần | PHASE-031 |
| E08 | Thư viện tham chiếu | Platform | `platform/core/libraries` | `bizcity_library@1` | có | PHASE-030 |
| E09 | Kiểm chuẩn pháp lý VN | gói | `packages/vn-rulepacks/engine.mjs` | `bizcity_vn_conformance_report@1` | có | PHASE-020 |
| E10 | Truy vết (lineage) | Kernel | `kernel/lineage` | — | có | PHASE-025 |
| E11 | Kết chuyển & khoá kỳ | Kernel | `kernel/closing`, `kernel/periods` | — | một phần: chưa cổng "giá vốn đã chốt" | PHASE-032 / 033 |
| E12 | Thuế (tính, đối chiếu hoá đơn) | Kernel | `kernel/tax-*` (rải rác) | — | **chưa thành bộ máy** | Q034-3 |
| E13 | Bảng điểm (scoreboard) | Platform + CI | `tests/conformance/lib/scoreboard.mjs` | `bizcity_scoreboard@1` | chỉ ở CI; S029-18 chưa có | PHASE-029 |

Báo cáo (đọc sổ, R-LEDGER-7) **không** tính là bộ máy. Nó là phần đọc, và đã nằm ở tiêu chí của trụ cột I.

### 4.2 Dữ liệu (D034-5)

`docs/standard/bo-may.json`, `bizcity_engines@1`:

```jsonc
{
  "id": "E02", "key": "inventory", "title": "Inventory Engine — kho · lô · giá vốn liên tục",
  "layer": "kernel", "code": ["packages/kernel/src/modules/inventory"],
  "contracts": ["bizcity_inventory@1"], "adr": ["ADR-0021", "ADR-0033"],
  "core": "C5",                         // năng lực lõi ở nen-mong.json
  "pillars": ["III", "II"],             // tru-cot.json
  "emits": ["CT-COST-*", "CT-INV-*", "INVENTORY_NEGATIVE", "COGS_STALE"],  // nối sang thẻ Cổng
  "tests": ["apps/api/test/costing.test.ts"],
  "milestones": [                       // mốc = mã việc; trạng thái ĐỌC từ bang-viec.json
    { "task": "S032-8",  "text": "Lô và hạn dùng ở Kernel" },
    { "task": "S032-12", "text": "Lớp giá vốn + phân bổ" },
    { "task": "S032-20", "text": "costing_runs settled → cổng kết chuyển" }
  ],
  "sdk": "ctx.inventory.*"              // module gọi bằng gì
}
```

- **% hoàn thiện = số mốc ✅ / số mốc**. Trạng thái mốc đọc từ `docs/phases/bang-viec.json` (`scripts/bang-viec.mjs` đã sinh từ checklist trên `main`). Không trường nào trong `bo-may.json` ghi trạng thái tay.
- **SC-ENG-1** (mới) kiểm năm điều:
  - `code[]` tồn tại;
  - `contracts` có ở CANON §4;
  - `milestones[].task` có trong `bang-viec.json`;
  - mỗi mẫu trong `emits` khớp ít nhất một mã ở thẻ Cổng (hoặc là dòng giữ chỗ có `state: chua`);
  - `core` / `pillars` là id có thật.

### 4.3 Màn

Lưới thẻ, mỗi bộ máy một thẻ: tên · lớp · thanh mốc · *"dev nhận sẵn gì, gọi bằng gì"*. Bấm vào một thẻ thì mở khung bên:
- danh sách mốc, mỗi mốc mở được thẳng dòng checklist;
- mã kiểm nó phát, link sang thẻ Cổng đã lọc sẵn;
- test;
- năng lực lõi và trụ cột nó phục vụ.

## 5. Thẻ Nhà phát triển

### 5.1 Chín công cụ, hai việc: theo dõi và chạy

| Mã | Công cụ | API | Nguồn cần bật |
|---|---|---|---|
| DEV01 | Tổng quan | `/system/devtools/summary` | Loki, Tempo, CSDL |
| DEV02 | Tra mã | `/system/devtools/traces/:id`, `/requests/:id`, `/evidence`, `/logs` | Tempo, Loki |
| DEV03 | Nhật ký | `/system/devtools/logs` | Loki |
| DEV04 | Lỗi theo module | `/system/devtools/module-errors` | Tempo |
| DEV05 | Ghi sổ | `/posting-log`, `/documents?status=pending\|error` | CSDL |
| DEV06 | Sự kiện | `/system/events` | CSDL |
| DEV07 | Toàn vẹn | `/system/diagnostics/runs[/:id]`, chạy lại chỉ đọc | CSDL |
| DEV08 | Kịch bản | — (đọc `SO-TAY-DIEU-TRA-LOI.md` lúc dựng) | — |
| DEV09 | Vận hành | `/system/devtools/status`, `/ops/health`, `/ops/alerts` | Prometheus, Loki |

**Theo dõi.** Mỗi công cụ được chấm theo **sáu tiêu chí hoàn thiện** cố định:

| # | Tiêu chí | Đo bằng |
|---|---|---|
| T1 | Có API riêng, chỉ đọc, lọc theo đơn vị | route + test cô lập đơn vị |
| T2 | Có test API | đường dẫn test trong `cong-cu-dev.json`, SC-DEV-2 kiểm tệp có |
| T3 | Nguồn chưa bật thì không báo "Lỗi kỹ thuật" mà nói cách bật | S018-21; test |
| T4 | Có hướng dẫn (`helpKey`) riêng, không dùng chung `ban-dieu-tra` | `docs/huong-dan/*.md` |
| T5 | Liên kết chéo: mã kiểm / trace / chứng từ mở được thẳng sang công cụ khác | khai `links` |
| T6 | Chạy được ở bản cài nhiều đơn vị (không chỉ bản một đơn vị) | khai + test |

Hôm nay mọi màn DEV dùng chung `helpKey="ban-dieu-tra"` (T4 đều chưa đạt), DEV08 không có API (T1 chưa đạt), DEV09 chỉ chạy ở bản cài một đơn vị (T6 chưa đạt).
- Bảng này **lộ ra việc thật**.
- Dữ liệu ở `docs/standard/cong-cu-dev.json` (`bizcity_devtools@1`, mỗi công cụ một dòng `{code, path, api[], sources[], tests[], help, links[], criteria{T1..T6: signal}}`).
- **SC-DEV-2** giữ khớp với `apps/web/src/phan-he/dev/menu.ts`: mọi mục menu có một dòng, không thừa, không thiếu.

**Chạy.** Bấm tên công cụ là mở **thẻ con nhúng đúng component của màn đó** (`ToanVenPage`, `SuKienPage`, `GhiSoPage`, …) ngay trong HT10, URL `?xem=nha-phat-trien&cong-cu=DEV07` (D034-6).
- Không viết lại màn. Không thêm API.
- Tách phần thân của mỗi trang thành component không có `PageHeader`, ví dụ `ToanVenBody`. Trang cũ và thẻ con cùng dùng một component đó.

```
[Tiêu chí] [Nền móng] [Cổng & bộ kiểm] [Bộ máy] [Nhà phát triển]
┌ Công cụ nhà phát triển ── 6/9 dùng được · T4 hướng dẫn 0/9 ───────────────────────────────┐
│ Mã     Công cụ          T1 T2 T3 T4 T5 T6  Nguồn            Mức                          │
│ DEV07  Toàn vẹn         ✓  ✓  ✓  ✗  ✓  ✓   CSDL ✓           ▓▓▓▓▓░ 83%   [Chạy ở đây ▸] │
│ DEV08  Kịch bản         ✗  ✗  —  ✗  ✓  ✓   —                ▓▓░░░░ 33%   [Chạy ở đây ▸] │
└───────────────────────────────────────────────────────────────────────────────────────────┘
┌ ▾ DEV07 Toàn vẹn (chạy ở đây · mở màn riêng ↗) ──────────────────────────────────────────┐
│ <ToanVenBody/> — đúng nội dung màn DEV07: Sổ đạt, bảng mã kiểm, lượt gần nhất…            │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Quyền (D034-7).**
- Bảng tiến độ ai vào HT10 cũng thấy, vì nó không có dữ liệu của đơn vị.
- Thẻ con chạy công cụ thì cần `devtools:read`, giữ đúng quyền của menu `dev`.
- Thiếu quyền thì nút "Chạy ở đây" ẩn đi, kèm dòng *"cần quyền Nhà phát triển"*.
- Nút ghi duy nhất hôm nay là **Chạy lại (chỉ đọc số)** ở DEV07. Nó giữ đúng nghĩa "chỉ đọc".

Menu `dev` **giữ nguyên**: người quen đường cũ vẫn vào được. HT10 là một cửa nữa, không thay menu (Q034-4).

## 6. Khuôn chung và cách tính (D034-8, D034-9)

Năm thẻ dùng **một khuôn hiển thị** `ReadinessItem`. Mỗi sổ JSON giữ cấu trúc riêng của nó. API ánh xạ sang khuôn này cho màn:

```ts
interface ReadinessItem {
  id: string; title: string; group?: string;
  status: 'dat' | 'mot-phan' | 'tai-lieu' | 'chua';   // như statuses của tru-cot.json
  signals: { kind: 'check' | 'diag' | 'test' | 'task' | 'criterion'; ref: string; state: 'co' | 'nhanh' | 'chua' }[];
  next?: string; phase?: string; links?: { to: string; label: string }[];
}
```

- **Một cách tính.**
  - Mức của một mục = trung bình tín hiệu (`co` 1 · `nhanh` ½ · `chua` 0).
  - Thẻ Tiêu chí giữ trọng số cũ: đạt 1 · một phần ½ · tài liệu ¼ · chưa 0.
  - Thanh và màu dùng chung một component (`ScoreBar`, ≥ 80 xanh · ≥ 40 cam · còn lại đỏ), tách ra từ `PillarMatrix`.
- **Không tích tay** (R-CONT-7). Mỗi sổ có một phép kiểm SC chặn ghi `dat` khi còn tín hiệu `chua`:
  - SC-CORE-1 cho `nen-mong.json`;
  - SC-PILLAR-1 cho `tru-cot.json`, đã giữ chỗ ở S026-15;
  - SC-GATE-1 cho `cong-kiem.json`;
  - SC-ENG-1 cho `bo-may.json`;
  - SC-DEV-2 cho `cong-cu-dev.json`.
- **Dòng tổng (B6).** Đầu màn có năm con số, mỗi số bấm vào mở đúng thẻ. Trang chủ phân hệ dùng lại `PillarMatrix` như hôm nay, không đổi.
- **In.** Nút In in thẻ đang mở. Thêm tuỳ chọn *In cả năm thẻ* làm phụ lục báo cáo kiểm chuẩn.

## 7. Bước thắng nhỏ

Mỗi bước là một PR, xong là dùng được ngay, không chờ bước sau.

| Bước | Việc | Thấy gì sau khi merge | Đụng tệp dùng chung? |
|---|---|---|---|
| **B1** | `COPY nen-mong.json`; SC-REL-3 + R-REL-11 | Thẻ Nền móng chạy ở bản cài Docker | `docker/api.Dockerfile`, `version.ts` → giữ chỗ |
| **B2** | Tách `ScoreBar`, `ReadinessItem`, khung thẻ HT10 đọc `?xem=` cho 5 giá trị (thẻ mới hiện "sắp có"); thiếu tệp nguồn thì báo có Cách sửa (§2 ý 4) | Năm thẻ có mặt; hai thẻ cũ không đổi | `PillarsPage.tsx` |
| **B3a** | API `GET /api/v1/system/gates`: phần sống (chẩn đoán, `FINDINGS_LIBRARY`, `INTAKE_CATALOG`) + kết quả lượt gần nhất | Thẻ Cổng có A, B, Guard, Chẩn đoán | `system.routes.ts` |
| **B3b** | Trường `pillars` cạnh mã; `scripts/cong-kiem-json.mjs` sinh phần CI, trigger, Cổng C giữ chỗ; SC-GATE-1 | Thẻ Cổng đủ tám cổng, có cột trụ cột | `DiagCheck` (Platform), `.check.mjs` |
| **B4** | `bo-may.json` 13 dòng, API `GET /system/engines`, SC-ENG-1 | Thẻ Bộ máy | — |
| **B5a** | `cong-cu-dev.json`, SC-DEV-2, bảng tiến độ T1..T6 | Thấy công cụ nào còn thiếu gì | — |
| **B5b** | Tách `*Body` cho DEV01..09, thẻ con "Chạy ở đây" | Chạy công cụ ngay trong HT10 | `apps/web/src/phan-he/dev/**` (trùng phạm vi S018-21 nếu dòng đó còn mở) |
| **B6** | Dòng tổng đầu màn; In cả năm thẻ; cập nhật `docs/huong-dan/tru-cot-muc-dat.md` | Một màn nhìn cả Core | — |

B1 làm ngay được, không phụ thuộc bước nào. Các bước B3, B4, B5 không phụ thuộc nhau sau B2, nên làm song song được nếu có người.

## 8. Đề xuất chốt (chủ dự án duyệt)

| Mã | Đề xuất |
|---|---|
| D034-1 | Sửa Nền móng bằng `COPY` **và** SC-REL-3. Không sửa riêng một tệp |
| D034-2 | Không lập danh sách tệp runtime riêng: SC-REL-3 tự dò chuỗi `docs/…` trong tệp có đọc đĩa và đối chiếu với Dockerfile |
| D034-3 | Thẻ Cổng **sinh từ registry trong mã**. Phần chỉ có ở CI sinh bằng script, có `--kiem`. Không có danh sách gõ tay |
| D034-4 | Không lập sổ phép kiểm thứ hai. `cong-kiem.json` là mặt xem theo cổng của cùng mã PC-* ở PHASE-032 · 60 / PHASE-033, nối qua trường `pc` |
| D034-5 | `bo-may.json` không có trường trạng thái tay. Mức đo bằng mốc `S0xx-*` đọc từ `bang-viec.json` |
| D034-6 | Thẻ Nhà phát triển nhúng **đúng component của màn DEV** (tách `*Body`), không viết lại, không thêm API |
| D034-7 | Bảng tiến độ ai cũng xem được. Chạy công cụ cần `devtools:read`. Menu `dev` giữ nguyên |
| D034-8 | Một khuôn hiển thị `ReadinessItem`, một `ScoreBar`, một cách tính cho năm thẻ |
| D034-9 | Mỗi sổ JSON có một phép kiểm SC chặn "đạt" sai (R-CONT-7, R-ECP-SCORE) |
| D034-10 | Thứ tự thẻ: Tiêu chí → Nền móng → Cổng & bộ kiểm → Bộ máy → Nhà phát triển |
| D034-11 | (đính chính D034-3 cho B3b, 2026-11-11) Trụ cột gắn theo họ mã trong `cong-kiem.json`; test / CI / trigger sinh từ repo bằng `scripts/cong-kiem.mjs`; không sửa `DiagCheck` (§3.2b) |

## 9. Câu hỏi mở

| Mã | Câu hỏi | Đề nghị mặc định |
|---|---|---|
| Q034-1 | Kết quả CI (SC-* xanh / đỏ) có đưa vào bản cài không? | **Có, chỉ phiên bản phát hành.** Lúc build, đóng gói `scoreboard.json` của lần CI cho commit đó. Bản dev hiện "chưa có kết quả CI" |
| Q034-2 | Tên thẻ: "Bộ máy" hay "Engine"? | **Bộ máy (engine)**, đúng giọng tiếng Việt của màn, kèm chữ gốc trong ngoặc |
| Q034-3 | Thuế có thành bộ máy riêng (E12) không, hay để chẩn đoán rải rác? | Ghi E12 `chua` để thấy khoảng trống. Quyết định thiết kế để phase thuế làm |
| Q034-4 | Sau B5b có bỏ menu `dev` không? | **Không.** Giữ hai cửa; xem lại sau khi đo số lượt dùng |
| Q034-5 | Số phase 034 (033 đã dùng cho Sẵn sàng khoá kỳ) | Giữ 034; ai merge trước lấy số trước (như W1 PHASE-028) |

## 10. Rủi ro

| Rủi ro | Giảm bằng |
|---|---|
| Sổ JSON lệch mã: thêm mã kiểm mà quên khai | Trường `pillars` đặt **ngay cạnh mã**. Script gom; SC-GATE-1 báo mã không có trụ cột |
| HT10 nặng vì gộp quá nhiều | Mỗi thẻ một query, nạp khi mở thẻ (`enabled: tab === …`). Thẻ con DEV nạp lười (`React.lazy`) |
| Trùng phạm vi với dòng CLAIMS đang mở (S018-21 ở `phan-he/dev/**`, PHASE-033 sổ PC) | Đọc CLAIMS trên `origin/main` trước mỗi bước. B5b chờ S018-21 nhả. B3 hỏi phiên PHASE-033 về trường `pc` |
| Người đọc hiểu nhầm "% hoàn thiện" là cam kết | Dòng chú thích cố định: *"mức đi theo bằng chứng chạy được, không phải cam kết tiến độ"*; mỗi con số bấm ra được bằng chứng |
