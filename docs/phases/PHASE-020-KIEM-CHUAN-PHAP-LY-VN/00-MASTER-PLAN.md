# PHASE-020 · 00 — Kế hoạch tổng
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — kế hoạch tổng bộ kiểm chuẩn pháp lý VN: phạm vi, ràng buộc, D020-*, Q020-*, sáu đợt W0–W5 theo ticket VNCONF-001…010. -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Đặc tả gốc: OKT-SPEC-VNCONF-001 v1.0-draft (2026-11-01). Tài liệu này là **bản đối chiếu đặc tả với repo thật**; chỗ nào đặc tả giả định sai về repo thì ghi ở §2 và theo repo.

## 1. Vì sao

Core đã giữ **sự thật kế toán** bằng trigger, test và lane diagnostics. Nhưng khi cộng đồng bán module / plugin cho doanh nghiệp Việt Nam, câu hỏi khách hàng và kiểm toán hỏi không phải "sổ có cân không" mà là **"theo văn bản nào, điều nào, hiệu lực từ bao giờ, ai đã xác nhận"**. Hôm nay câu trả lời nằm rải ở `docs/can-cu/` (tóm tắt cho người), `bizcity_compliance@1` §3 (định hướng thiết kế) và trong đầu người viết. Không có chỗ nào máy đọc được, không có trạng thái "đã rà / chưa rà", và không có gì ngăn một người ghi "đạt TT99" khi chưa ai đọc TT99.

Phase này đưa ba thứ vào repo: **kho nguồn pháp lý có trạng thái rà**, **rulepack / ca có phiên bản và cổng phê duyệt fail-closed**, **báo cáo bằng chứng** — bám bộ kiểm chuẩn đã có (ADR-0006), không dựng framework thứ hai.

## 2. Đặc tả nói gì, repo thật ra sao

| Đặc tả giả định | Repo thật (SHA `91b8c92`) | Quyết định |
|---|---|---|
| `tests/conformance/technical/` "nếu đã có thì giữ" | không có `technical/`; bộ kiểm là `checks/<nhóm>/*.check.mjs` + `diagnostics/*.diag.mjs`, khuôn `bizcity_check@1` | giữ nguyên cấu trúc có; VN thêm `checks/vietnam/` + dữ liệu `vietnam/` |
| Tạo `packages/vn-conformance` (`@bizcity/vn-conformance`) | bộ kiểm chạy không cần `npm install`; gói npm riêng chỉ có ý nghĩa khi publish SDK (Phase E) | **không** tạo gói ở W0–W4; xét ở W5 (VNCONF-009) |
| `TestStatus` 6 mức, `ConformanceRunRequest` | bộ kiểm có 7 trạng thái cho **mã nguồn** (`pass · debt · warn · fail · error · planned · skip`); chưa có khái niệm ca pháp lý | giữ 7 trạng thái cho bảng điểm; thêm 6 trạng thái cho **ca pháp lý** trong `bizcity_vn_conformance_report@1` (RULE-VN-CONFORMANCE §2) |
| Adapter `submitAccountingEvent / getReceipt / queryJournal / lockPeriod / runPluginAction / readDomainEvents` | cổng thật: `POST /api/v1/documents` (`bizcity_ledger_intake@1`), `ctx.ledger.submit`, `GET /evidence/:id`, `ledgerQuery` / `bizcity_read.*`, API kỳ kế toán, `defineAction`, `core.events.replay`, `@bizcity/kernel` gốc gói | runner (W1) map lên cổng thật; **không** import `kernel/internal` (SC-KERNEL-6 đã chặn) |
| Legal registry trong PostgreSQL | chưa cần quy trình động | tệp JSON trong Git, phát hành cùng rulepack (đặc tả §4 cũng cho phép) |
| Event `tenant_id + source + idempotency_key` | sự việc: UNIQUE (tenant_id, doc_key) + version; action: UNIQUE (tenant_id, action_id, idem_key) | ghi khoảng trống G4; hỏi Q020-3 |
| Doanh nghiệp có năm tài chính; TT99 áp theo năm tài chính | đơn vị **không có** năm tài chính; kỳ theo tháng dương lịch | khoảng trống G1 → đề xuất năng lực Core (Q020-2), không vá trong phase |
| TT133 là chế độ lựa chọn | chỉ có mã enum `vn-tt133-2016` | khoảng trống G5; C02 SME chờ nguồn + gói |
| Rulepack ví dụ `status: approved` với căn cứ pending | — | validator **từ chối**: SC-VNC-2 `approved-basis:*` (đúng ghi chú của đặc tả) |
| Nguồn pháp lý §3.1 (6 văn bản) | `docs/can-cu` có 17 văn bản (thêm Luật 149/2025, NĐ 181/2025, NQ 204/2025, TT 32/2025, Luật 56/2024…) | registry gộp cả hai, tất cả `pending`; người duyệt rà đợt đầu theo LEGAL-SOURCE-REGISTRY §3 |

## 3. Phạm vi

<!-- [2026-11-02 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — chủ duyệt D020-1 (sửa), D020-7..10, chốt Q020-2, Q020-6, Q020-7; nguyên tắc Core đơn giản, lean, chặt chẽ -->
**Nguyên tắc chủ chốt (2026-11-02):** Core giữ **đơn giản, lean, chặt chẽ, đúng nguyên tắc kế toán**. Conformance Engine **không thêm luật kế toán vào Core**, không thêm đường ghi sổ, không thêm phụ thuộc: mọi phân tích, cảnh báo, đánh giá chỉ để **phục vụ người dùng ra quyết định**. Quyết định ghi sổ, tiến hành hay dừng luôn là của người dùng; chỉ bất biến Tier 0 sẵn có của Kernel mới chặn.

<!-- [2026-11-02 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — mở rộng phạm vi theo chỉ đạo của chủ: Conformance Engine là trụ cột Kernel trong Core, menu Hệ thống, ba lớp Module · Cấu hình · Doanh nghiệp; bảng điểm theo ma trận BizCity; người dùng quyết định ghi sổ (ADR-0012, 20-KIEN-TRUC). -->
**Mở rộng 2026-11-02 (chủ chỉ đạo):** Conformance không chỉ là bộ kiểm CI cho module. Nó là **Conformance Engine — trụ cột cấp Kernel**, nằm trong Core, bật mặc định, hiện ở **Hệ thống → Kiểm chuẩn**, trả lời ba câu hỏi khác nhau: (1) module / plugin có đạt chuẩn không; (2) cấu hình cho doanh nghiệp này có đúng quy định đang có hiệu lực với nó không; (3) tình trạng thực tế của doanh nghiệp kỳ này có tuân thủ không. Kiến trúc: [20-KIEN-TRUC-CONFORMANCE-ENGINE](20-KIEN-TRUC-CONFORMANCE-ENGINE.md), quyết định: [ADR-0012](../../adr/ADR-0012-conformance-engine-tru-cot-kernel.md).

| Có | Không |
|---|---|
| Kho nguồn pháp lý máy đọc, có trạng thái rà từng văn bản / điều khoản | Ý kiến pháp lý; "chứng nhận" của cơ quan nhà nước |
| Rulepack / ca có phiên bản, phạm vi áp dụng, căn cứ, người duyệt, golden hash | Rulepack `approved` khi registry còn `pending` |
| Check tĩnh SC-VNC-1/2 (W0) → runner lane `runtime` C01 / C08 (W1) → C02 (W2) → C03 / C04 phạm vi hẹp, mock (W3) → CI gate + bằng chứng (W4) → SDK / POS mẫu / HTML (W5) | Sửa Kernel, migration, luật định khoản trong phase này (K0); vá Core cho G1–G5 (đi VERSIONING §5) |
| Ba miền kế toán / thuế / hoá đơn tách riêng | Suy tính hợp lệ về thuế từ bút toán hợp lệ |
| Giao tiếp nhà cung cấp hoá đơn bằng **mock** | Coi mock là cơ quan thuế đã chấp nhận |

## 4. Ràng buộc bất biến

1. **K0.** Không đụng Kernel, Platform, migration, luật định khoản. Runner chỉ đi cổng công khai (R-VNC-7).
2. **Fail closed.** Thiếu căn cứ / người duyệt / golden ⇒ `REVIEW_REQUIRED`; không cấu hình nào bỏ qua (SC-VNC-2 `block`, không baseline).
3. **Không duplicate.** Mọi kiểm viết vào `tests/conformance/` theo `bizcity_check@1`; không framework thứ hai; không chép lại kiểm đã có — rulepack **trỏ** tới chúng qua `verified_by`.
4. **Tiền chính xác.** Fixture: số nguyên hoặc chuỗi thập phân; không float (R-VNC-6).
5. **Không hardcode** VAT mặc định / hệ thống tài khoản chung trong rulepack.
6. **Dữ liệu test ở đơn vị giả lập riêng**, hai đơn vị A / B cho ca chéo đơn vị; đồng hồ cố định; không chạy trên đơn vị có dữ liệu thật.
7. **Người duyệt là người.** `reviewed_by`, `accounting_reviewer`, `tax_reviewer` không là agent / model (SC-VNC-2 `agent-name:*`, cùng tinh thần R-SIG-4).

## 5. Quyết định (D020-*, chờ chủ duyệt)

| ID | Quyết định đề xuất | Trạng thái |
|---|---|---|
| D020-1 | Bộ kiểm VN là **một phần của `tests/conformance/`** (dữ liệu `vietnam/`, check `checks/vietnam/`, runner = lane `runtime` của 4.3), không tạo `packages/vn-conformance` trước W5 | ✅ chủ duyệt 2026-11-02 — sửa: "không tạo gói" chỉ áp cho SDK; dữ liệu luật là gói chỉ chứa dữ liệu `packages/vn-rulepacks/` (ADR-0012 T7) |
| D020-2 | Kho nguồn pháp lý là **tệp JSON trong Git** phát hành bất biến cùng rulepack; không bảng CSDL ở MVP | ☐ |
| D020-3 | **Fail closed** là luật Tier 0 (R-VNC-3): SC-VNC-2 `block`, không baseline, không cờ bỏ qua; `REVIEW_REQUIRED` / `NOT_TESTED` không tính PASS | ☐ |
| D020-4 | Hai lớp trạng thái tách riêng: bảng điểm giữ 7 trạng thái **mã nguồn**; báo cáo VN có 6 trạng thái **ca pháp lý** | ☐ |
| D020-5 | Khoảng trống Core G1–G5 đi đường **đề xuất năng lực** (VERSIONING §5, ADR khi cần); phase này không vá | ☐ |
| D020-7 | **Conformance Engine là trụ cột Kernel trong Core** (K1): module `packages/kernel/src/modules/conformance/`, bật mặc định, menu Hệ thống → Kiểm chuẩn (`HT06`), quyền `conformance:read / run`; ba lớp Module · Cấu hình · Doanh nghiệp dùng chung Registry · Test Packs · Oracle · Evidence ([ADR-0012](../../adr/ADR-0012-conformance-engine-tru-cot-kernel.md)) | ✅ chủ duyệt 2026-11-02 — kèm T1 (tầng L5, dùng lại DiagCheck), T2 (lớp Module trên bản cài đọc check-report + sourceHash) |
| D020-8 | **Posting Gate chỉ thông tin, người dùng quyết định ghi sổ**: advisory kèm Vì sao + Việc cần làm; không cấu hình nào biến advisory thành tự từ chối; chỉ bất biến Tier 0 của Kernel mới chặn | ✅ chủ duyệt 2026-11-02 — kèm T3 (xác nhận là bằng chứng, AI không xác nhận thay), T4 (không tính trong giao dịch ghi sổ) |
| D020-9 | **Bảng điểm và UI theo ma trận BizCity**: giữ `bizcity_scoreboard@1` (ba điểm không cộng lẫn, A–F, kết luận không theo điểm, đạt rỗng ≠ đạt); 6 trạng thái ca pháp lý không quy về điểm; ma trận hàng = ca, cột = trạng thái; không nút sửa sổ / bỏ qua | ✅ chủ duyệt 2026-11-02 — kèm T5 (không "điểm tuân thủ %"; độ phủ bằng chứng + số ca theo trạng thái) |
| D020-10 | **Registry mô hình hiệu lực ở cấp điều khoản** (effective_from/to của provision, phạm vi pháp nhân, năm tài chính áp dụng, chuyển tiếp) — không có công tắc TT200 tắt / TT99 bật; thêm TT152/2025 (hộ, cá nhân kinh doanh) và provision chuyển tiếp của TT200 | ✅ chủ duyệt 2026-11-02 — kèm T6 (khai điều khoản dần theo ca P0) |
| D020-6 | Nhãn công bố duy nhất **"Passed Bizcity VN Conformance [scope/version/date]"**; trang chứng nhận plugin (VNCONF-010) chỉ hiện nhãn này + phạm vi + `known_exclusions` | ☐ |

## 6. Câu hỏi cần chủ quyết (Q020-*)

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| Q020-1 | Đưa phase vào `PHASES.md` / `roadmap.json` với mã việc mới (4.3b?) hay gắn vào 4.3 của PHASE-014? | Gắn 4.3 (lane runtime) + thêm 4.3b "rulepack pháp lý VN" khi W1 bắt đầu |
| Q020-2 | Năm tài chính / chế độ kế toán của đơn vị (G1): mở đề xuất năng lực ngay (ADR) hay chờ khách hàng có năm tài chính lệch? | ✅ **chủ chốt 2026-11-02:** mở đề xuất năng lực năm tài chính / chế độ kế toán của đơn vị ngay (ADR riêng, S020-22) — thiếu nó lớp Cấu hình chỉ ra REVIEW_REQUIRED |
| Q020-3 | Idempotency sự việc (G4): docKey có tiền tố nguồn (`pos:…`, `wp:…`) là đủ, hay thêm cột `source`? | docKey có tiền tố là đủ cho C01.3; ghi vào `bizcity_ledger_intake@1` thành quy ước |
| Q020-4 | Ai là người duyệt kế toán / thuế đợt đầu? Có thuê ngoài không? | ✅ **chủ chốt 2026-11-02** <!-- [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0014 -->: bản cài tự chủ tự duyệt (chủ đơn vị, kế toán trưởng) — [ADR-0015](../../adr/ADR-0015-duyet-rulepack-tai-ban-cai.md); nhãn "Đạt theo duyệt của đơn vị" tách khỏi nhãn Bizcity. Duyệt ở thượng nguồn (R-VNC-3) vẫn mở cho ai muốn đóng góp |
| Q020-6 | Lớp 3 (Doanh nghiệp): ca đầu tiên nào và oracle là gì? Đề xuất 6 ca: đối chiếu ngân hàng theo tháng, chứng từ gốc thiếu, tồn kho âm, giá vốn / kết chuyển / khoá kỳ chưa xong, hoá đơn đầu vào chờ > 30 ngày (DG-TAX-1), sự việc treo > 3 ngày (DG-EVENT-3) | ✅ **chủ chốt 2026-11-02:** đợt đầu 4 ca đã có cách kiểm sẵn: hoá đơn đầu vào chờ > 30 ngày (DG-TAX-1), sự việc treo > 3 ngày (DG-EVENT-3), tồn kho âm (SQL trên `inventory_movements`), cuối kỳ chưa xong (giá vốn, kết chuyển, khoá kỳ). Hoãn đối chiếu ngân hàng (chưa thấy dữ liệu sao kê) và chứng từ gốc thiếu (đính kèm mới có ở mua hàng). Ngưỡng là quy chế nội bộ, miền `internal`, kế toán trưởng chốt |
| Q020-7 | Dữ liệu rulepack / registry đóng gói cho runtime ở đâu? `packages/kernel/conformance/` (phát hành cùng Kernel) hay giữ `packages/vn-rulepacks/` và Kernel đọc tương đối? | ✅ **chủ chốt 2026-11-02:** gói chỉ chứa dữ liệu `packages/vn-rulepacks/` (JSON + schema, SemVer riêng); di chuyển cùng S020-18 |
| Q020-5 | Có mở nguồn kho pháp lý (Apache/GPL cùng repo) hay giữ riêng? | Cùng repo GPL: cộng đồng cùng rà; nhưng `reviewed` chỉ do người được chỉ định |

## 7. Sáu đợt = ticket VNCONF

| Đợt | Ticket | Việc | Cổng |
|---|---|---|---|
| **W1 (tài liệu)** ✅ 02/11 | — | kiến trúc Conformance Engine ([20-KIEN-TRUC](20-KIEN-TRUC-CONFORMANCE-ENGINE.md)), ADR-0012 đề xuất, registry +TT152 / chuyển tiếp TT200 | chủ duyệt ADR-0012, D020-7..10 |
| **W0** ✅ | 001, 002 | audit nền; registry + schema + catalog; 3 rulepack nháp; SC-VNC-1/2 + tự kiểm; luật R-VNC; quy trình | selfcheck `--strict` ĐẠT; `--self-test` ĐẠT |
| W1 | 003, 004, 005 | lane `runtime`: runner đọc rulepack, chạy ca `kind: runtime` qua cổng công khai trên PostgreSQL test (2 đơn vị, đồng hồ cố định); báo cáo JSON + JUnit; ca C01 (gồm C01.4) và C08 có bằng chứng thật | C01 / C08: mọi ca có `verified_by` hoặc fixture; không ca NOT_TESTED trừ G3 |
| W2 | 006 | C02: fixture vàng TT99; ca hệ thống tài khoản; đề xuất năng lực G1/G2/G5 | người duyệt kế toán ký ≥ 1 rulepack hoặc ghi rõ chưa |
| W3 | 007 | C03 / C04 phạm vi hẹp: registry rà đến điều-khoản-điểm; mock nhà cung cấp hoá đơn | `tax_reviewer` ký hoặc `REVIEW_REQUIRED` |
| W4 | 008 | CI gate: FAIL / ERROR P0 chặn; `evidence/`; `RELEASE-CHECKLIST.md` | job `conformance` có bước VN |
| W5 | 009, 010 | SDK / adapter POS mẫu; HTML dashboard; trang chứng nhận plugin | repo ngoài chạy được cùng rulepack không sửa Kernel |
