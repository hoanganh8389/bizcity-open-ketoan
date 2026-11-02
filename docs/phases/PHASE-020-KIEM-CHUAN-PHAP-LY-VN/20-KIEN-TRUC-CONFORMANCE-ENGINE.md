# PHASE-020 · 20 — Kiến trúc Conformance Engine: trụ cột kiểm chuẩn kế toán, pháp lý và trạng thái tuân thủ doanh nghiệp
<!-- [2026-11-02 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — kiến trúc Conformance Engine là trụ cột cấp Kernel: ba lớp (Module · Cấu hình · Doanh nghiệp), bốn thành phần (Registry · Test Packs · Evidence · Audit), ba cổng (Build · Posting · Compliance Report); bảng điểm theo ma trận BizCity; người dùng quyết định ghi sổ. -->
<!-- [2026-11-02 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — chủ duyệt ADR-0012 + tinh chỉnh T1–T8; thêm §0a nguyên tắc Core đơn giản, lean, chặt chẽ; sửa nơi đặt dữ liệu (vn-rulepacks), Posting Gate có xác nhận, không điểm % -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Trạng thái:** **chấp nhận** 2026-11-02 qua [ADR-0012](../../adr/ADR-0012-conformance-engine-tru-cot-kernel.md) kèm tinh chỉnh T1–T8 (bảng trong ADR; chỗ nào ở dưới khác T1–T8 thì theo ADR). Luật: [R-VNC](../../rules/RULE-VN-CONFORMANCE.md), [R-DIAG](../../rules/RULE-SELF-DIAGNOSTICS.md). Kế hoạch: [00-MASTER-PLAN](00-MASTER-PLAN.md). Nền đã có: [tests/conformance/](../../../tests/conformance/README.md), [vietnam/](../../../packages/vn-rulepacks/README.md).
> **Một câu:** Conformance Engine là chức năng **nằm trong Core, bật mặc định, hiện ở menu Hệ thống**, trả lời ba câu hỏi khác nhau bằng cùng một bộ quy định có hiệu lực, cùng một cách chấm điểm, cùng một kho bằng chứng — và **không bao giờ** tự quyết thay người dùng việc ghi sổ hay tiến hành.

## 0b. Đã làm (2026-11-02, S020-18)
<!-- [2026-11-02 03:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ghi phần Engine đã chạy được trên bản cài. -->

| Thành phần | Có gì |
|---|---|
| Bộ đánh giá | `@bizcity/vn-rulepacks/engine` — một bộ cho `--certify` và Kernel (T7) |
| Bằng chứng trên bản cài | tự chẩn đoán L1 + L3 + **L5** của chính đơn vị; L5 mới: `PROFILE_DECLARED`, `PROFILE_PACK_REGIME` (T1); ánh xạ DG-* ↔ mã ở `packages/vn-rulepacks/diag-codes.json` (SC-VNC-2 kiểm) |
| Hồ sơ | hồ sơ kế toán thật của đơn vị (ADR-0013); chưa khai → ca lớp Cấu hình REVIEW_REQUIRED "chưa khai", không đoán |
| Lưu | `conformance_runs` (migration 0052, chỉ thêm, RLS): báo cáo nguyên văn, phiên bản + băm kho rulepack, phiên bản hồ sơ |
| Action | `core.conformance.run` (quyền `conformance:run`, AI không dùng) · `core.conformance.latest` (quyền `conformance:read`, AI đọc được) |
| Lớp Doanh nghiệp (S020-19) <!-- [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19 --> | 4 ca C09 lấy bằng chứng từ kiểm L3 của đơn vị: `TAX_INPUT_NO_INVOICE`, `EVENT_PENDING_AGE`, `INVENTORY_NEGATIVE` (mới), `PERIOD_CLOSE_OPEN` (mới: giá vốn, kết chuyển, thứ tự, khoá sổ; bộ quy tắc kết chuyển của đơn vị hoặc mặc định, không viết số tài khoản). Báo cáo có `layer_results`: một kết quả cho mỗi lớp |
| Chưa làm | màn Hệ thống → Kiểm chuẩn (S020-20), cảnh báo ở màn lập chứng từ (S020-21), lịch chạy đêm |

Luật đánh giá chốt khi làm: ở lớp Cấu hình và Doanh nghiệp, kiểm mức warn có phát hiện là không đạt; ở lớp Module, kiểm mức info chỉ là ngữ cảnh. Phạm vi chưa xác định (hồ sơ chưa khai) thì không kết luận FAIL. Khi chứng nhận bằng `--certify` (hồ sơ giả lập), lớp Cấu hình chỉ tính bằng chứng build; kiểm DG-* của lớp này chỉ dùng trên bản cài với hồ sơ thật.

## 0a. Nguyên tắc chủ chốt

Core giữ **đơn giản, lean, chặt chẽ, đúng nguyên tắc kế toán**. Conformance Engine **không thêm luật kế toán vào Core**, không thêm đường ghi sổ, không thêm phụ thuộc: mọi phân tích, cảnh báo, đánh giá chỉ để **phục vụ người dùng ra quyết định**. Quyết định ghi sổ, tiến hành hay dừng luôn là của người dùng; chỉ bất biến Tier 0 sẵn có của Kernel mới chặn.

Hệ quả cụ thể: Engine **dùng lại** khung tự chẩn đoán (tầng L5), bằng chứng (`audit_logs`), chính sách có phiên bản, check của bộ kiểm — không dựng khung song song (ADR-0012 T1); mỗi kết luận đều có căn cứ, phiên bản, bằng chứng để người dùng tự đánh giá.

## 0. Vị trí trong kiến trúc

```text
                 NGUỒN ĐÁNH GIÁ
   Plugin / module · Cấu hình doanh nghiệp · Dữ liệu thực tế (sổ, chứng từ, kho, ngân hàng)
                         │
                         ▼
   ┌───────────────────── CONFORMANCE ENGINE (trụ cột Kernel, chỉ đọc) ─────────────────────┐
   │  Module Conformance        Configuration Conformance        Enterprise Conformance       │
   │  chất lượng plugin          cấu hình áp dụng                  dữ liệu vận hành           │
   │ ─────────────────────────────────────────────────────────────────────────────────────── │
   │  Regulatory Registry  +  Test Packs  +  Test Oracle  +  Evidence  +  Audit               │
   │  quy định có hiệu lực     ca kiểm có phiên bản   expected do người duyệt   bằng chứng chỉ thêm │
   └─────────────────────────────────────────────────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────────┐
          ▼              ▼                  ▼
     BUILD GATE     POSTING GATE      COMPLIANCE REPORT
   đạt chuẩn mới    thông tin trước    trạng thái doanh nghiệp
   được cài / phát   khi ghi sổ —      theo chế độ, kỳ, thuế, sổ
   hành (chặn)       NGƯỜI DÙNG QUYẾT  (nhãn, xu hướng)
```

| Trụ cột Kernel | Giữ sự thật gì | Conformance Engine quan hệ thế nào |
|---|---|---|
| Accounting Kernel (sổ cái, cửa nạp, bút toán đảo) | sổ đúng, chỉ thêm | Engine **đọc** sổ qua `ledgerQuery` / `bizcity_read.*`; không ghi, không đảo, không định khoản lại |
| Rules Engine (luật định khoản, chính sách có phiên bản — ADR-0009) | định khoản theo bản chính sách của ngày hạch toán | Engine đối chiếu bản chính sách / gói định khoản đang áp với rulepack có hiệu lực (lớp Cấu hình) |
| Event Contracts (outbox, sự kiện miền) | nhất quán sau commit | Engine nhận sự kiện (`entry.posted`, `period.locked`, `module.installed`) để chạy lại đúng phạm vi; phát `bizcity.conformance.evaluated` |
| **Conformance Engine** | **kết luận có truy vết:** cái gì đạt / không đạt / chưa chứng minh được, theo quy định nào, hiệu lực từ bao giờ, bằng chứng ở đâu | độc lập, chỉ đọc, kết luận lưu bất biến |

Engine là **mức Kernel K1** (module Kernel mới + migration bảng chỉ thêm + API chỉ đọc), **không đụng đường ghi sổ**. Bật mặc định cho mọi bản cài (kể cả offline, không cần Cell): năng lực `conformance.engine`.

## 1. Ba câu hỏi, ba lớp — không trộn lẫn

| Lớp | Câu hỏi | Đối tượng | Ví dụ | Nguồn kiểm hôm nay | Cổng |
|---|---|---|---|---|---|
| **1. Module Conformance** | Module / plugin có đạt chuẩn không? | mã nguồn, manifest, migration, hành vi qua cửa thật của **một module** | plugin POS cộng đồng xuất đúng `bizcity_ledger_intake@1`, không ghi `ledger_*`, idempotent, không rò đơn vị | `selfcheck.mjs --module` (CONF-MAN / STATIC / MIG), lane `runtime` (CONF-RUN), rulepack C01 / C08 | **Build Gate** |
| **2. Configuration Conformance** | Ứng dụng được cấu hình cho **doanh nghiệp này** có đúng không? | hồ sơ đơn vị: chế độ kế toán, năm tài chính, loại pháp nhân, chính sách thuế, phương pháp giá xuất kho, gói định khoản, bản chính sách đang áp, danh mục thuế suất | cùng plugin POS, doanh nghiệp A theo TT99 năm dương lịch, B năm tài chính 01/7, C là hộ kinh doanh theo TT152: cấu hình phải khớp rulepack **có hiệu lực** cho từng đơn vị | hồ sơ `bizcity_vn_profile@1` + chọn rulepack 4 bước (R-VNC-4); DG-SET-1, DG-POL-1; rulepack C02, C03 | **Posting Gate** (thông tin) + **Compliance Report** |
| **3. Enterprise Conformance** | Tình trạng **thực tế** của doanh nghiệp có tuân thủ không? | dữ liệu vận hành theo kỳ: sổ, chứng từ, kho, công nợ, ngân hàng, việc cuối kỳ, hoá đơn, khoá kỳ | plugin đạt, cấu hình đúng, nhưng chưa đối chiếu ngân hàng, thiếu chứng từ gốc, tồn kho âm, chưa tính giá vốn / kết chuyển / khoá kỳ, hoá đơn đầu vào chờ quá 30 ngày | tự chẩn đoán L3 (DG-LEDGER-*, DG-EVENT-*, DG-TAX-1, DG-PLAN-*), `scripts/doi-chieu-ke-toan.sql`, bảng kiểm trước khoá kỳ | **Compliance Report** (+ Posting Gate khi liên quan chứng từ đang ghi) |

Quy tắc **không trộn**: một plugin đạt lớp 1 không làm doanh nghiệp "đạt"; một doanh nghiệp đạt lớp 3 ở kỳ này không "chứng nhận" plugin. Mỗi kết luận ghi rõ lớp, phạm vi, kỳ, phiên bản rulepack.

## 2. Bốn thành phần dùng chung

### 2.1 Regulatory Registry — quy định có hiệu lực ở cấp điều khoản

Đã có nền: `packages/vn-rulepacks/registry/legal-sources.json` (`bizcity_vn_legal_registry@1`, R-VNC-1). Engine dùng **cùng tệp** (đóng gói theo bản phát hành, không bảng CSDL ở MVP — D020-2).

Registry **không** là công tắc `TT200 = disabled, TT99 = enabled`. Nó mô hình bốn thứ tách nhau:

| Thứ | Trường | Ví dụ |
|---|---|---|
| Hiệu lực pháp lý | `effective_from / effective_to` của văn bản **và từng `provisions[]`** | Luật Quản lý thuế 108/2025/QH15: chung 01/7/2026, một số điều cho hộ kinh doanh từ 01/01/2026 |
| Phạm vi áp dụng | `applies_to.entity_types`, `domain` | TT99: doanh nghiệp; TT133: nhỏ và vừa (còn hiệu lực phần nào, điều kiện áp dụng); TT152/2025: hộ, cá nhân kinh doanh từ 01/01/2026 |
| Năm tài chính áp dụng | `applies_to.fiscal_year_start_from` | TT99: năm tài chính bắt đầu từ 01/01/2026 — đơn vị 01/7/2025–30/6/2026 vẫn theo TT200 tới hết năm tài chính |
| Quy định chuyển tiếp | provision riêng, `review_status` | TT99 thay phần lớn TT200 nhưng giữ một số nội dung (kế toán cổ phần hoá doanh nghiệp nhà nước giai đoạn chuyển tiếp) — là provision của TT200 còn hiệu lực, không phải "TT200 tắt" |

Hệ quả thiết kế: **mọi kết luận ghi cặp (nguồn, điều khoản) đã dùng**, và Engine chọn quy định theo **bối cảnh** (pháp nhân, năm tài chính, ngày giao dịch), không theo mã thông tư.

### 2.2 Test Packs — ca kiểm có phiên bản, có người duyệt

Đã có nền: `rulepack.schema.json`, `case.schema.json`, 3 rulepack nháp (C01, C02, C08). Mỗi ca khai lớp áp dụng (`layer: module | configuration | enterprise` — **bổ sung schema ở W2**), phạm vi, căn cứ, cách chứng minh, khoảng trống. Trạng thái duyệt fail-closed (R-VNC-3, SC-VNC-2).

### 2.3 Test Oracle — ai nói "đúng" là đúng

| Loại ca | Oracle | Không phải oracle |
|---|---|---|
| Bất biến kế toán (lớp 1, 3) | trigger CSDL + kiểm DG-* (toán học: Nợ = Có, số dư = Σ dòng, đảo một lần) | — |
| Hành vi module qua cửa thật (lớp 1) | test vitest qua `POST /documents`, action, MCP; `assertLedgerInvariants` | kiểm hàm nội bộ |
| Định khoản / thuế / hoá đơn theo quy định (lớp 2, 3) | **`expected_fixture` do người duyệt kế toán / thuế chốt và băm** (`golden.hash`) | số do AI "tính cho hợp lý"; suy từ bút toán hợp lệ |
| Trạng thái doanh nghiệp (lớp 3) | ngưỡng khai trong rulepack (vd hoá đơn chờ ≤ 30 ngày) có căn cứ, hoặc chính sách nội bộ đơn vị khai rõ là nội bộ | ngưỡng ngầm trong mã |

### 2.4 Evidence + Audit — kết luận có truy vết, bất biến

- Mỗi lượt chạy = một dòng bảng **chỉ thêm** `conformance_runs` (W2): `tenant_id`, `layer`, `scope` (module id / kỳ / chi nhánh), `profile_hash`, `rulepacks[]` (id, version, `rules_hash`), `registry_hash`, `result`, `report jsonb` (`bizcity_vn_conformance_report@1`), `evidence_hash`, `actor`, `created_at`. Giữ ≥ 10 năm như tài liệu kế toán (STD-CMP-6).
- Bằng chứng từng ca trỏ về thứ đã có: `diagnostic_runs`, `audit_logs` (chuỗi băm), `posting_log.policy_version`, mã bút toán / docKey (không số tiền, không tên khách — R-DIAG-6).
- Người chạy, lý do, thời điểm ghi `audit_logs` qua `writeEvidence` như mọi action (STD-EVD-1).

## 3. Ba cổng — chặn ở đâu, thông tin ở đâu

| Cổng | Khi nào | Lớp | Hành vi | Ai quyết |
|---|---|---|---|---|
| **Build Gate** | CI của module; `bizcity module check`; trước khi cài / bật module | 1 | **Chặn**: `check-report.json` phải `pass`, `sourceHash` khớp (CONFORMANCE §4). Rulepack C01 / C08 `approved` là một phần của cổng; `REVIEW_REQUIRED` không chặn cài nhưng ghi "chưa chứng nhận" | Core (máy) — đúng như hôm nay |
| **Posting Gate** | khi người dùng lập / duyệt chứng từ; trước khoá kỳ — **không** trong giao dịch ghi sổ (T4) | 2, 3 | **Thông tin, không chặn**; người dùng tiếp tục thì ghi một dòng bằng chứng xác nhận, AI không xác nhận thay (T3): Engine trả `advisories[]` cho chứng từ / kỳ đang thao tác (vd "loại thuế R08 hết hiệu lực sau 31/12/2026", "chế độ kế toán của đơn vị chưa khai, rulepack không chọn được", "kỳ này chưa đối chiếu ngân hàng"). Màn hiện cảnh báo + "Vì sao" + "Việc cần làm"; người dùng xác nhận tiếp hay dừng. **Không có cấu hình nào biến advisory thành tự từ chối** | **Người dùng** (kế toán, kế toán trưởng) |
| Bất biến Kernel *(đã có, không thuộc Engine)* | mọi lần ghi | — | **Chặn tuyệt đối** như hôm nay: Nợ = Có, kỳ khoá (`PERIOD_LOCKED`), tài khoản không có, RLS, trigger chỉ thêm (Tier 0) | Core |
| **Compliance Report** | theo lịch (đêm, sau sao lưu — R-DIAG-3), theo yêu cầu, cuối kỳ, trước khoá kỳ | 2, 3 | Báo cáo trạng thái doanh nghiệp theo chế độ, kỳ hiệu lực, thuế, sổ: nhãn `PASS / FAIL / REVIEW_REQUIRED` theo ca; nhãn tổng "Passed Bizcity VN Conformance [scope/version/date]" **chỉ** khi mọi ca P0 áp dụng PASS trên rulepack approved; xu hướng theo kỳ | chủ đơn vị đọc; **không** tự sửa gì |

Phân định với R-DIAG-4 (khoá kỳ bị chặn khi L3 có `error`): đó là bất biến sổ (Tier 0) **đã có**, vẫn giữ. Conformance advisory là lớp trên: "sổ cân nhưng chưa đối chiếu ngân hàng" — không chặn khoá kỳ, chỉ yêu cầu kế toán trưởng ghi lý do chấp nhận (có bằng chứng), đúng mô hình R-DIAG-4 cho `warn`.

## 4. Mô hình hiệu lực và chọn quy định (R-VNC-4)

```text
Bước 1  Bối cảnh      pháp nhân (enterprise / sme / micro / household) · năm tài chính (MM-DD) · ngày giao dịch · loại nghiệp vụ · chi nhánh
Bước 2  Chế độ        chế độ kế toán đã cấu hình + bản chính sách (posting_policy_versions) áp cho ngày hạch toán; điều kiện chuyển tiếp
Bước 3  Thuế / HĐ     theo NGÀY GIAO DỊCH và điều khoản có hiệu lực — độc lập với bước 2 (ba miền khác nhau, R-VNC-5)
Bước 4  Một bản       đúng một rulepack approved cho mỗi catalog; mơ hồ · thiếu nguồn · duyệt hết hạn ⇒ REVIEW_REQUIRED (fail closed)
```

Ví dụ cùng ngày đánh giá 15/3/2026:

| Đơn vị | Pháp nhân | Năm tài chính | Chế độ chọn được | Thuế GTGT ngày 15/3/2026 | Ghi chú |
|---|---|---|---|---|---|
| A | doanh nghiệp | 01/01/2026 | TT99 (năm tài chính bắt đầu ≥ 01/01/2026) | Luật 48/2024 + sửa đổi 149/2025 (01/01/2026); giảm 2% NQ 204 còn hiệu lực tới 31/12/2026 | ca C02.1 |
| B | doanh nghiệp | 01/07/2025 | **TT200** (năm tài chính đang chạy bắt đầu trước 01/01/2026) — không tự chuyển | như A | ca C02.2 — hôm nay **chưa mô hình được** (G1) |
| C | hộ kinh doanh | 01/01/2026 | TT152/2025 (từ 01/01/2026) | như A + điều khoản sớm Luật 108/2025 cho hộ | nguồn `pending`, chưa có rulepack |
| D | nhỏ và vừa | 01/01/2026 | TT133 nếu đủ điều kiện **hoặc** TT99 theo lựa chọn đã khai — hồ sơ không khai ⇒ REVIEW_REQUIRED | như A | G5 |

Engine không bao giờ "đoán" chế độ cho D; nó trả REVIEW_REQUIRED và việc cần làm: "Khai chế độ kế toán ở Thông tin đơn vị".

## 5. Bảng điểm và giao diện — theo ma trận BizCity

**Giữ nguyên cách chấm đã công bố** (`bizcity_scoreboard@1`, ADR-0006): ba điểm **không cộng lẫn** (Tuân chuẩn · Sẵn sàng · Độ phủ), hạng A ≥ 95 · B ≥ 85 · C ≥ 70 · D ≥ 50 · F; **kết luận ĐẠT / KHÔNG ĐẠT không dựa vào điểm** mà vào `fail` / `error`; "đạt rỗng không phải đạt" (R-DIAG-7); xu hướng so lần trước. Thêm lớp **ca pháp lý** với 6 trạng thái (`PASS · FAIL · ERROR · NOT_APPLICABLE · NOT_TESTED · REVIEW_REQUIRED`, R-VNC-8), không quy về điểm số: một ca `REVIEW_REQUIRED` hiện đúng là chưa chứng minh được, không phải 0 điểm.

**Màn Hệ thống → Kiểm chuẩn** (`HT06`, quyền `conformance:read` — cấp `owner`, `accountant`, `developer`; `conformance:run` cho `owner`, kế toán trưởng):

```text
┌ Kiểm chuẩn ─────────────────────────────────────────────────────────────────────┐
│ [Module] [Cấu hình] [Doanh nghiệp]        Kỳ: 2026-03 ▾   Hồ sơ: TT99 · 01-01 ▾ │
│ Nhãn: ◔ Review required — 0/3 rulepack approved     Lần chạy: 2026-03-15 02:10   │
├──────────────────────────────── MA TRẬN ─────────────────────────────────────────┤
│ Luật / ca                       │ Căn cứ (điều khoản)     │ Trạng thái │ Vì sao │ Việc │
│ C01.1 Nợ = Có                   │ LKT 88/2015 Đ.27 (pend) │ ◔ RR · KT ✔ │ …      │ —    │
│ C02.1 Chế độ TT99 năm 2026      │ TT99 PL II (pending)    │ ○ NT        │ G1     │ Khai │
│ C03.x Loại thuế R08 hết 31/12   │ NQ 204/2025 (pending)   │ ◔ RR        │ …      │ Rà   │
│ E-07 Đối chiếu ngân hàng tháng  │ nội bộ (quy chế)        │ ✘ FAIL      │ 2 TK   │ Mở   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Xu hướng 6 kỳ ▁▂▃▅▆▇   Ngoài phạm vi: C04 (chưa có), lane runtime (không chạy)    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Luật UX (kế thừa Matrix UI của BizCity và Bàn điều tra PHASE-019): hàng = ca / luật, cột = trạng thái có màu theo 6 mức; mỗi hàng có **Vì sao** (nguồn, điều khoản, hiệu lực, bằng chứng, phiên bản rulepack) và **Việc cần làm** (link sang màn thao tác sẵn có); **không có nút nào sửa sổ, định khoản lại, tắt kiểm, hay "bỏ qua"**; người dùng đơn vị chỉ thấy đơn vị mình (R-TEN); số liệu hiện là mã chứng từ / số bút toán, không số tiền trong thông báo (R-DIAG-6).

## 6. Dữ liệu, API, lịch chạy (đề xuất cho W2–W4)

| Thứ | Đề xuất | Luật |
|---|---|---|
| Bảng | `conformance_runs` (chỉ thêm, RLS, COMMENT ON, trigger no-update như `diagnostic_runs`) | R-DB-*, R-TEN-1, STD-EVD-2 |
| Action | `core.conformance.run` (`effect: read` về sổ; ghi một dòng run = bằng chứng; quyền `conformance:run`, idempotency theo scope + ngày), `core.conformance.status`, `core.conformance.report`, `core.conformance.advisories` (cho Posting Gate, chỉ đọc) | `defineAction`, STD-ACT-* |
| MCP | `conformance.status` chỉ đọc (Cell / chatbot hỏi "đơn vị tôi đạt đến đâu") — không có công cụ ghi | `bizcity_mcp@1`, AI chỉ đọc |
| Sự kiện | nghe `bizcity.module.installed`, `bizcity.period.locked`, `bizcity.ledger.entry.posted` (gom theo khung); phát `bizcity.conformance.evaluated` (mã, số lượng, không số liệu) | R-OUTBOX, R-DIAG-6 |
| Lịch | lớp 3 mỗi đêm sau sao lưu; lớp 2 khi đổi cấu hình / phát hành chính sách; lớp 1 khi cài module | R-DIAG-3 |
| Nơi đặt mã | mã: `packages/kernel/src/modules/conformance/` (đọc qua cổng công khai, không import `ledger.service`); dữ liệu rulepack / registry: gói chỉ chứa dữ liệu `packages/vn-rulepacks/` (ADR-0012 T7), bộ kiểm đọc cùng tệp | SC-KERNEL-6/7, R-VNC-7 |
| Tự chẩn đoán | thêm tầng **L5 Tuân thủ** vào RULE-SELF-DIAGNOSTICS §1 (L4 = tuân Standard trên mã; L5 = tuân quy định trên dữ liệu + cấu hình) | R-DIAG-1..9 áp dụng nguyên |

## 7. Ranh giới — Engine KHÔNG làm gì

- Không sửa sổ, không định khoản lại, không đảo bút toán, không đổi cấu hình, không "tự khắc phục" (R-DIAG-2, R-VNC-9 bước 8).
- Không chặn ghi sổ ngoài bất biến Tier 0 đã có; advisory luôn kèm lựa chọn tiếp tục của người dùng.
- Không là ý kiến pháp lý, không là chứng nhận của Bộ Tài chính / cơ quan Thuế; nhãn duy nhất là "Passed Bizcity VN Conformance [scope/version/date]".
- Không chạy khi không có người / lịch yêu cầu trên dữ liệu thật của đơn vị khác (RLS, R-TEN).
- Không coi mock nhà cung cấp hoá đơn là bằng chứng cơ quan thuế đã nhận (C04).

## 8. Đợt việc (nối vào [00-MASTER-PLAN §7](00-MASTER-PLAN.md))

| Đợt | Việc | Lớp | Cổng |
|---|---|---|---|
| W1 (tài liệu — **xong**) | kiến trúc này, ADR-0012, registry thêm TT152 / provision chuyển tiếp TT200 | — | — |
| W1a (mã, đang làm) | `selfcheck.mjs --certify`: một lệnh ba cổng + tuân thủ VN cho CI / máy dev; `profile.schema.json`; báo cáo + JUnit + CERTIFICATE.md | 1, 2 | Build |
| W2 | schema ca thêm `layer`; migration `conformance_runs`; module Kernel `conformance` chạy lớp 1 + 2 bằng check / rulepack đã có; action `run / status / report` | 1, 2 | Report |
| W3 | ca lớp 3 (Enterprise): đối chiếu ngân hàng, chứng từ thiếu, tồn kho âm, việc cuối kỳ, hoá đơn chờ, kỳ chưa khoá — mỗi ca có oracle rõ (DG-* / SQL đối chiếu / ngưỡng khai) | 3 | Report |
| W4 | màn Hệ thống → Kiểm chuẩn (ma trận, Vì sao, Việc cần làm, xu hướng); MCP `conformance.status` | 1–3 | Report |
| W5 | Posting Gate advisory: hook chỉ đọc ở màn lập / duyệt chứng từ và trước khoá kỳ; sự kiện `conformance.evaluated` | 2, 3 | Posting |
| W6 | nhãn + trang chứng nhận module; CI gate rulepack approved; RELEASE-CHECKLIST | 1 | Build |
