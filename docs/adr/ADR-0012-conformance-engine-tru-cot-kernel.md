# ADR-0012 · Conformance Engine là trụ cột cấp Kernel: kiểm chuẩn module, cấu hình doanh nghiệp và trạng thái tuân thủ
<!-- [2026-11-02 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — đề xuất ADR-0012: Conformance Engine nằm trong Core, bật mặc định, menu Hệ thống; ba lớp, bốn thành phần, ba cổng; Posting Gate chỉ thông tin — người dùng quyết định ghi sổ. -->
<!-- [2026-11-02 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — chủ duyệt ADR-0012 kèm tinh chỉnh (dựng trên khung tự chẩn đoán, xác nhận cảnh báo có bằng chứng, không điểm tuân thủ %, điều khoản khai dần, gói dữ liệu vn-rulepacks); nguyên tắc Core đơn giản, lean, chặt chẽ — phân tích để người dùng quyết định -->

- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) duyệt 2026-11-02: "Core cần giữ được sự đơn giản, lean, giữ nguyên tắc kế toán, chặt chẽ. Các phân tích, cảnh báo, đánh giá nhằm mục đích phục vụ người dùng ra quyết định. Còn lại đồng ý theo đề xuất." Kế toán trưởng: chưa góp ý phần lớp 3
- Ngày: 2026-11-02 · Người quyết: chủ dự án · Mức Kernel: **K1** (module Kernel mới chỉ đọc + migration bảng chỉ thêm; không đổi đường ghi sổ)
- Luật / hợp đồng liên quan: [R-VNC-1..9](../rules/RULE-VN-CONFORMANCE.md), [R-DIAG-1..9](../rules/RULE-SELF-DIAGNOSTICS.md), `bizcity_compliance@1` (C-1..C-9), `bizcity_vn_conformance_report@1`, ADR-0006 (bộ kiểm một chỗ), ADR-0009 (chính sách có phiên bản), ADR-0011 (plugin ba mức tin cậy) · Kiến trúc chi tiết: [PHASE-020 · 20-KIEN-TRUC](../phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/20-KIEN-TRUC-CONFORMANCE-ENGINE.md)

## Bối cảnh

Hôm nay "kiểm chuẩn" sống ở ba nơi rời nhau: bộ kiểm `tests/conformance/` (mã nguồn, CI), tự chẩn đoán L1–L3 (`GET /system/diagnostics`, trước khoá kỳ), và ma trận pháp lý trong tài liệu. Chúng trả lời được "sổ có đúng không" và "mã có tuân Standard không", nhưng **không** trả lời được ba câu hỏi mà khách hàng, kiểm toán và cộng đồng plugin hỏi:

1. Plugin POS này có đạt chuẩn không? (Module)
2. Cấu hình cho doanh nghiệp A — chế độ kế toán, năm tài chính, thuế, giá xuất kho — có đúng quy định **đang có hiệu lực với A** không? (Cấu hình)
3. Doanh nghiệp A kỳ này có tuân thủ không: đã đối chiếu ngân hàng, đủ chứng từ, tồn kho không âm, xong việc cuối kỳ? (Doanh nghiệp)

Quy định Việt Nam còn có hiệu lực ở **cấp điều khoản** và theo **năm tài chính** (TT99 áp cho năm tài chính từ 01/01/2026 nhưng giữ một số nội dung TT200 cho giai đoạn chuyển tiếp; Luật Quản lý thuế 108/2025 hiệu lực chung 01/7/2026 nhưng một số điều cho hộ kinh doanh từ 01/01/2026; TT152/2025 cho hộ, cá nhân kinh doanh từ 01/01/2026). Một công tắc "TT200 tắt / TT99 bật" là sai.

## Nguyên tắc chủ chốt (2026-11-02)

Core giữ **đơn giản, lean, chặt chẽ, đúng nguyên tắc kế toán**. Conformance Engine **không thêm luật kế toán vào Core**, không thêm đường ghi sổ, không thêm phụ thuộc: mọi phân tích, cảnh báo, đánh giá chỉ để **phục vụ người dùng ra quyết định**. Quyết định ghi sổ, tiến hành hay dừng luôn là của người dùng; chỉ bất biến Tier 0 sẵn có của Kernel mới chặn.

## Quyết định

1. **Conformance Engine là trụ cột cấp Kernel**, ngang Accounting Kernel · Rules Engine · Event Contracts: nằm trong Core (`packages/kernel/src/modules/conformance/`), **bật mặc định**, có mục **Hệ thống → Kiểm chuẩn**, năng lực `conformance.engine`; chạy được trên bản cài offline, không cần Cell.
2. **Ba lớp tách biệt** — Module · Cấu hình · Doanh nghiệp — dùng **chung** bốn thành phần: Regulatory Registry (hiệu lực cấp điều khoản, phạm vi, năm tài chính, chuyển tiếp), Test Packs (rulepack / ca có phiên bản, người duyệt, fail-closed), Test Oracle (expected do người duyệt chốt và băm; bất biến sổ là toán học), Evidence + Audit (bảng chỉ thêm `conformance_runs`, giữ ≥ 10 năm).
3. **Ba cổng với ba hành vi khác nhau:**
   - **Build Gate** chặn (máy quyết): module phải đạt `check-report.json` trước khi cài / phát hành — như hôm nay.
   - **Posting Gate chỉ thông tin**: trước khi ghi sổ / khoá kỳ, Engine đưa advisory kèm "Vì sao" và "Việc cần làm"; **người dùng quyết định** tiếp hay dừng. Không có cấu hình nào biến advisory thành tự động từ chối. Bất biến Tier 0 (Nợ = Có, kỳ khoá, RLS, trigger) vẫn chặn như cũ — đó là Kernel, không phải Engine.
   - **Compliance Report**: trạng thái doanh nghiệp theo chế độ, kỳ hiệu lực, thuế, sổ; nhãn "Passed Bizcity VN Conformance [scope/version/date]" chỉ khi mọi ca P0 áp dụng PASS trên rulepack approved.
4. **Bảng điểm và UI theo ma trận BizCity**: giữ `bizcity_scoreboard@1` (ba điểm không cộng lẫn, hạng A–F, kết luận không dựa vào điểm, đạt rỗng ≠ đạt); thêm 6 trạng thái ca pháp lý không quy về điểm; màn ma trận hàng = ca, cột = trạng thái, mỗi hàng có căn cứ – điều khoản – bằng chứng – việc cần làm; **không có nút sửa sổ / bỏ qua**.
5. **Chỉ đọc tuyệt đối** (R-DIAG-2): Engine không sửa sổ, không định khoản lại, không đổi cấu hình, không tự khắc phục; mọi kết luận lưu bất biến kèm phiên bản registry / rulepack / profile.
6. Tự chẩn đoán thêm tầng **L5 Tuân thủ** (RULE-SELF-DIAGNOSTICS §1): L4 = mã tuân Standard, L5 = dữ liệu + cấu hình tuân quy định có hiệu lực.

## Tinh chỉnh khi duyệt (2026-11-02)

| # | Tinh chỉnh | Vì sao |
|---|---|---|
| T1 | **Không bộ chạy thứ hai.** Ca lớp 3 dùng lại sổ đăng ký `DiagCheck` và cùng mã kiểm với lane diagnostics; Engine là tầng **L5** của tự chẩn đoán. Bảng `conformance_runs` chỉ lưu ảnh chụp báo cáo | lean: một khung kiểm, một mã cho một ý nghĩa (R-DIAG-1) |
| T2 | **Lớp Module trên bản cài không chạy lại kiểm mã nguồn**: đọc `check-report.json` và so `sourceHash` với module đang nạp (ADR-0011) | kiểm mã thuộc CI / Build Gate; bản cài chỉ cần biết module đang chạy có đúng bản đã kiểm |
| T3 | **Xác nhận cảnh báo là bằng chứng**: người dùng xem cảnh báo rồi vẫn ghi sổ thì có một dòng `audit_logs` (người, mã cảnh báo, chứng từ / kỳ, thời điểm). AI / khoá API **không** xác nhận thay người; nháp do MCP lập thì cảnh báo hiện cho người duyệt. Khoá kỳ có cảnh báo mức `warn` thì kế toán trưởng ghi lý do (như R-DIAG-4) | cảnh báo phải truy vết được; người quyết định là người |
| T4 | **Cảnh báo không tính trong giao dịch ghi sổ**: tính lúc lập nháp, lúc duyệt, trước khoá kỳ, đọc từ lần chạy gần nhất; `postDocumentIn` không đổi | giữ cửa ghi sổ đơn giản, nhanh, không khoá bảng thêm |
| T5 | **Không công bố "điểm tuân thủ %" cho doanh nghiệp.** Mỗi lớp chỉ hiện độ phủ bằng chứng (tỉ lệ ca có bằng chứng) và số ca theo 6 trạng thái. Ma trận C-1..C-9 đo năng lực Core, Engine đo từng đơn vị: màn hình ghi rõ | con số gộp đọc như khẳng định pháp lý |
| T6 | **Registry khai điều khoản dần**: chỉ điều khoản mà ca P0 dẫn tới; hết hiệu lực phụ thuộc năm tài chính thể hiện bằng điều kiện áp dụng, không bằng ngày | tránh khối việc lớn bỏ dở |
| T7 | <!-- [2026-11-02 03:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — T7 làm 02/11: gói @bizcity/vn-rulepacks có thêm engine.mjs (bộ đánh giá thuần, không phụ thuộc) dùng chung cho --certify và Kernel. --> **Làm 2026-11-02:** gói `packages/vn-rulepacks/` chứa dữ liệu **và một bộ đánh giá thuần `engine.mjs`** (không I/O ngoài tệp của gói, không phụ thuộc) — một bộ đánh giá cho cả `--certify` và Kernel, không viết hai lần. Thiết kế ban đầu: **Dữ liệu rulepack / registry là gói chỉ chứa dữ liệu `packages/vn-rulepacks/`** (JSON + schema, không mã, không phụ thuộc), SemVer riêng theo nhịp luật; Kernel nạp lúc chạy, `selfcheck.mjs` đọc đường dẫn tương đối. Di chuyển làm cùng S020-18 khi Kernel bắt đầu nạp | một nguồn; luật đổi không bắt phát hành lại Kernel |
| T8 | **Ngưỡng nội bộ không trình bày như luật**: miền `internal` trong schema cho quy chế của đơn vị (vd 30 ngày chờ hoá đơn) | chặt chẽ về căn cứ |

## Hệ quả

**Được:** một chỗ trả lời ba câu hỏi với cùng bộ quy định, cùng cách chấm, cùng kho bằng chứng; cộng đồng plugin có cổng rõ; doanh nghiệp thấy mình đạt đến đâu theo kỳ; kiểm toán tra được "theo điều nào, bằng chứng đâu". Không dựng framework kiểm thứ hai (ADR-0006 giữ nguyên: bộ kiểm `tests/conformance/` là nguồn check; Engine là **runtime** của cùng check + rulepack trên bản cài).

**Mất / phải làm:** thêm module Kernel + migration (`conformance_runs`), quyền `conformance:read / run`, màn mới, lịch chạy đêm; registry và rulepack phải có người duyệt thật — chưa có thì mọi ca ra REVIEW_REQUIRED (chấp nhận: đúng hơn là "đạt" giả). Khoảng trống Core G1 (năm tài chính / chế độ của đơn vị) phải được lấp (ADR riêng) thì lớp 2 mới có ý nghĩa.

**Việc:** PHASE-020 W1a (`--certify`), W2–W6 theo [20-KIEN-TRUC §8](../phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/20-KIEN-TRUC-CONFORMANCE-ENGINE.md); cập nhật [kiến trúc §2](../architecture/README.md), [CONG-BO-KIEN-TRUC](../CONG-BO-KIEN-TRUC.md) ba lớp kiểm soát (thêm Engine vào lớp Compliance) và `bizcity-standard.json` (`conformance.engine`, `conformance.advisories` — `planned`) **sau khi** ADR được duyệt.

## Phương án đã cân nhắc

| Phương án | Vì sao không |
|---|---|
| A. Giữ Conformance là công cụ CI / dev (`tests/conformance/` + `--certify`), không vào app | trả lời được câu 1, không trả lời câu 2 và 3 trên dữ liệu thật của từng đơn vị; doanh nghiệp không thấy trạng thái của mình |
| B. Module cộng đồng (add-in) "Kiểm chuẩn" cài thêm | lớp 2 / 3 cần đọc sổ, cấu hình, chính sách có phiên bản, diagnostic_runs — là Kernel; add-in đọc qua SDK được nhưng không bảo đảm "bật mặc định" và không gắn được Posting Gate |
| C. Posting Gate chặn khi có advisory | trái nguyên tắc người dùng quyết định ghi sổ; quy định có ngoại lệ, chuyển tiếp, và registry có thể chưa rà kịp — chặn máy móc sẽ chặn sai. Chỉ Tier 0 mới chặn |
| D. Registry trong CSDL, sửa bằng màn hình | quy định đổi phải qua expert review + release bất biến (R-VNC-9); màn sửa tự do phá truy vết. Để tệp trong Git, phát hành cùng rulepack (D020-2); CSDL chỉ lưu kết quả chạy |
