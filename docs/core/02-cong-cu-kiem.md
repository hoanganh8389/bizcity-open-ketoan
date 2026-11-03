# 02 · Công cụ kiểm, mã, bộ kiểm chuẩn
<!-- [2026-11-03 08:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — L5 định khoản thử đã nằm trong tiền kiểm (W5 merge) -->
<!-- [2026-11-03 07:23 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — sổ tay công cụ kiểm: lệnh nào trả lời câu hỏi nào, cách đọc kết quả, các loại mã, bộ kiểm chuẩn, lưới an toàn nhiều lớp -->
<!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-1: dòng C2 theo trạng thái item_id trên main -->

> Mục tiêu: bạn biết **chạy lệnh nào** khi muốn biết điều gì, **đọc kết quả thế nào**, và **mỗi loại lỗi bị bắt ở lớp nào**. Mọi lệnh chỉ **đọc**; không lệnh nào ghi sổ, tính giá vốn, kết chuyển hay khoá kỳ thay người.

## 1. Năm nhóm công cụ

| Nhóm | Lệnh | Trả lời | Cần |
|---|---|---|---|
| **Kiểm một chứng từ** | `bizcity event check <tệp.json> [--submit] [--json]` | Chứng từ có đúng khuôn, tổng tiền khớp, vào sổ được không, bút toán sẽ ra sao? | Offline: kiểm khuôn + tổng. Có `BIZCITY_SERVER` + `BIZCITY_API_KEY`: thêm tiền kiểm và bút toán thử (dryRun) |
| **Kiểm một chuỗi, một kỳ** | `bizcity flow check --sku <mã> --period YYYY-MM [--to YYYY-MM] [--branch CN01]` | Mặt hàng có liền mạch mua → kho → bán → giá vốn → lãi lỗ → đóng kỳ? | Máy chủ + khoá đọc báo cáo |
| **Kiểm code, module** | `bizcity module check <key>`, `bizcity module accounting-check <key> [--static]`, `node tests/conformance/selfcheck.mjs [--module …]` | Module có đúng chuẩn, có tự ghi sổ / điền tài khoản / tính giá vốn? | `selfcheck` và `accounting-check --static` không cần cài gì |
| **Kiểm sổ thật** | `bizcity ledger verify`, `bizcity doctor` | Sổ có toàn vẹn, môi trường có đủ (Node, bản dựng, CSDL, migration)? | CSDL |
| **Giải thích** | `bizcity explain <MÃ> [--role dev\|chief_accountant\|auditor\|tax_inspector]` | Mã này nghĩa là gì, vì sao, ai sửa, sửa ở đâu, kiểm lại bằng gì? | Không cần máy chủ (có máy chủ thì tra thêm danh mục tiền kiểm) |

Chưa `npm install`: thay `bizcity` bằng `node packages/cli/bin/bizcity.mjs`. Thêm `--json` để máy đọc.

### `event check`: các lớp

| Lớp | Kiểm | Cần máy chủ |
|---|---|---|
| L1 | Khuôn chứng từ (zod của hợp đồng) | Không |
| L2 | Tổng tiền khớp từng dòng (cùng hàm cửa nạp dùng) | Không |
| L1–L4 | Tiền kiểm: danh mục, nghiệp vụ, hoá đơn (`/api/v1/intake/preflight`) | Có |
| L5 | Bút toán thử rồi huỷ (`/api/v1/documents/submit?dryRun=1`): thấy Nợ / Có Kernel sẽ dựng | Có |
| nộp | Chỉ khi thêm `--submit`: gửi thật, khoá `Idempotency-Key = <docKey>:v<version>` | Có |

### `flow check`: các dòng

| Dòng | Hỏi | FAIL thường là việc của |
|---|---|---|
| C1.1 | Có hàng vào trước khi ra? | App (thiếu phiếu nhập) |
| C1.2 | Tồn không âm theo ngày? | App (nhập trễ ngày, sai kho) |
| C1.3 | Dòng xuất có giá vốn? | Kế toán (chưa Tính giá vốn) |
| C1.4 | Lãi gộp tính được? | Kế toán |
| C1.5 | Sổ kho khớp số dư tài khoản kho? | Kế toán |
| C5 | Sẵn sàng đóng kỳ? (bảng kiểm khoá kỳ) | Kế toán |
| L1 (với `--to`) | Tồn cuối kỳ trước = tồn đầu kỳ sau? | App (đổi mã giữa kỳ, sửa chứng từ kỳ cũ) |
| C2 | Định danh hàng bất biến? | Luôn **SKIP**: sổ và giá vốn đã theo `item_id`, nhưng chưa có thao tác đổi mã / gộp mã, API chưa nhận / trả `itemId` (PHASE-024 S024-11) |

### `module accounting-check`: các mục

| Mã | Bắt | Mức |
|---|---|---|
| AC-1 | Đụng bảng `ledger_*`, `inventory_movements`, `inventory_costs`, `accounting_events` (code và migration) | FAIL |
| AC-2 | Số tài khoản viết cứng (trừ module `ke-toan`) | FAIL |
| AC-3 | Tự điền giá vốn (`unitCost`, `cogs`, `cost`) | WARN |
| AC-4 | `docType` ngoài hợp đồng, của cổng chờ, hoặc chưa khai ở `ledger.submits` | FAIL |
| AC-5 | `docKey` không ổn định hoặc thiếu tiền tố `<key>:` | FAIL |
| AC-6 | Chứng từ mẫu `examples/*.json` qua `event check` | FAIL / WARN / SKIP |

Quét bằng biểu thức chính quy sau khi bỏ chú thích. **Có thể bỏ sót**: nó không thay test hợp đồng trên CSDL.

## 2. Đọc kết quả

| Kết quả | Nghĩa | Mã thoát |
|---|---|---|
| **PASS** | Có bằng chứng đạt | 0 |
| **FAIL** | Có bằng chứng không đạt | 1 |
| **SKIP** | **Chưa đủ bằng chứng** (thiếu máy chủ, thiếu bản dựng…). Không phải PASS | 2 |
| **WARN** | Cảnh báo; người quyết định | không đổi kết luận |
| **N/A** | Không áp dụng (module không gửi chứng từ vào sổ) | không đổi kết luận |

Ngoại lệ: `module accounting-check --static` trả 0 khi không có FAIL (dùng trong `module check`). `explain` trả 0 nếu biết mã, 1 nếu không.

**Luật chung:** không bao giờ báo "đạt chuẩn" khi còn SKIP. Ghi nguyên SKIP kèm lý do.

## 3. Các loại mã

| Mã | Ví dụ | Do ai sinh | Ai đọc | Tra bằng |
|---|---|---|---|---|
| `IN-<nhóm>-NNN` | `IN-SUM-001`, `IN-MD-004`, `IN-BIZ-005`, `IN-ITEM-009` | Cửa nạp, tiền kiểm. Nhóm: SHAPE, SUM, BIZ, MD, ITEM, GUARD | Dev, kế toán | `explain`, [BIZCITY-INTAKE-FINDINGS](../contracts/BIZCITY-INTAKE-FINDINGS-v1.md) |
| `ACC-…`, `PART-…`, `ITEM-…` | `ACC-HINT-…` | Kiểm danh mục (tài khoản, đối tượng, mặt hàng) | Kế toán | `explain`, [BIZCITY-FINDINGS](../contracts/BIZCITY-FINDINGS-v1.md) |
| `MÃ_LỖI_API` (chữ HOA gạch dưới) | `PERIOD_LOCKED`, `RATE_LIMITED` | API | Dev | `explain`, [BIZCITY-ERRORS](../contracts/BIZCITY-ERRORS-v1.md) |
| Mã tự chẩn đoán (chữ HOA gạch dưới) | `COGS_STALE`, `INVENTORY_NEGATIVE`, `INVENTORY_LEDGER_MISMATCH` | Chẩn đoán trong app (L1, L3, L5) | Kế toán trưởng, vận hành | `explain`, [DIAGNOSTICS](../ops/DIAGNOSTICS.md) |
| `DG-<nhóm>-N` | `DG-STK-3` | Lane chẩn đoán của bộ kiểm chuẩn (cùng SQL với mã tự chẩn đoán) | Nhóm Lõi | `explain` (ánh xạ qua `packages/vn-rulepacks/diag-codes.json`) |
| `F22-<NHÓM>-NN` | `F22-STK-11` | Danh mục 93 tình huống lỗi, mỗi ca có cách khắc phục theo vai | KTT, kiểm soát, thanh tra thuế | `explain F22-STK-11`, [danh mục F22](../phases/PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/10-DANH-MUC-GIA-DINH.md) |
| `SC-<nhóm>-N` | `SC-MOD-1`, `SC-SIG-1` | Bộ kiểm chuẩn (selfcheck) | Dev, người duyệt PR | Chạy `selfcheck`, xem bảng điểm |
| `AC-N` | `AC-2` | `module accounting-check` | Dev module | Mục 1 ở trên |
| `R-…`, `STD-…`, `CONF-…` | `R-ITEM-4`, `STD-MOD-2` | Luật (khai đúng một lần, bộ kiểm SC-CON-5 kiểm) | Mọi người | [docs/rules/](../rules/), [BIZCITY-MODULE](../contracts/BIZCITY-MODULE-v1.md) |

Mỗi phát hiện từ `event check` kèm hai dòng: `sửa:` (làm gì) và `luật:` (căn cứ). Nếu app của bạn hiện lỗi cho người dùng, hiện **mã, thông báo, gợi ý, `requestId`**.

## 4. Bộ kiểm chuẩn (conformance)

Một lệnh, hai lane, một bảng điểm. Chi tiết: [tests/conformance/README.md](../../tests/conformance/README.md), [docs/standard/CONFORMANCE.md](../standard/CONFORMANCE.md).

| Lệnh | Lane | Cần CSDL |
|---|---|---|
| `node tests/conformance/selfcheck.mjs --lane selfcheck` | Kiểm tĩnh toàn repo (đọc mã, hợp đồng, migration, tài liệu) | Không |
| `node tests/conformance/selfcheck.mjs --lane diagnostics` | Kiểm sổ thật bằng SQL chỉ đọc (DG-*) | Có |
| `node tests/conformance/selfcheck.mjs --module modules/<key> --strict` | Kiểm một module: manifest, dữ liệu, bảo mật | Không |
| `node tests/conformance/selfcheck.mjs --self-test` | Kiểm chính bộ kiểm trên dữ liệu mẫu | Không |

**Bốn cổng khi cài module** ([CONFORMANCE §1](../standard/CONFORMANCE.md)): manifest · tĩnh · migration · chạy thật (PostgreSQL). Chạy `module check` để đi qua cả bốn.

**Bảng điểm có bốn số:**

| Số | Đo gì |
|---|---|
| Tuân chuẩn | Các luật đã có kiểm, tỉ lệ đạt |
| Sẵn sàng Standard v1 | Core đã có bao nhiêu **năng lực** Standard v1 hứa. Là điểm của **Core**, không phải của module bạn viết |
| Độ phủ luật | Bao nhiêu luật có kiểm tự động |
| Diagnostics | Điểm lane sổ thật (bỏ qua nếu không có CSDL) |

Mỗi luật ra một ký hiệu: ✔ đạt · ◐ **nợ cũ** (phát hiện có trước khi bật luật, ghi ở `baseline.json`, không làm đỏ) · ▲ cảnh báo · ✘ không đạt · ! lỗi chạy · ○ chưa có năng lực để kiểm · · bỏ qua. Phát hiện **mới** (không nằm trong nợ cũ) làm đỏ bảng điểm.

**Mức chặn:** chỉ mục `error` của chẩn đoán L3 chặn khoá kỳ (R-DIAG-4); kế toán trưởng vẫn khoá được nếu ghi lý do chấp nhận. Mục `warn` không chặn (R-VNC-10). Bất biến của Kernel (Nợ = Có, kỳ khoá, sổ chỉ thêm) luôn chặn, không ai vượt.

## 5. Hai cổng và bể chờ

| Cổng | Kiểm gì | Nếu không đạt |
|---|---|---|
| **A: danh mục** (mặt hàng, đối tượng, tài khoản) | Dữ liệu danh mục đủ và đúng | Chỉ lỗi ✘ mới thành **bản nháp**; ⚠ kèm lý do vẫn kích hoạt |
| **B: nghiệp vụ** (chứng từ) | Tiền kiểm `POST /api/v1/intake/preflight` chạy **L1–L5**: khuôn, số học, danh mục, nghiệp vụ, rồi định khoản thử khi L1–L4 không còn lỗi chặn (hoàn tác hết, tối đa 3 giây, 20 lượt mỗi người mỗi phút; trường `l5` = `ran` / `blocked` / `rate` / `off`) | Vào **bể chờ** kèm mã, người sửa, bước sửa; không ghi sổ |

Nháp và bể nối nhau: kích hoạt mặt hàng thì chứng từ chờ được kiểm lại. Không có chặn im lặng. Xem [ADR-0019](../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md).

## 6. Lỗi nào bị bắt ở đâu

Cột "Lớp chặn thật" là theo tài liệu thiết kế; phần ghi **[chưa kiểm chứng ở đây]** nghĩa là tài liệu nói có nhưng chưa được chạy trên CSDL thật khi viết hướng dẫn này.

| Lỗi kế toán | Bắt sớm (trước khi chạy) | Bắt khi nộp / chạy |
|---|---|---|
| Module tự `UPDATE` bảng sổ | `module accounting-check` AC-1 | Vai trò CSDL riêng của module không thấy bảng sổ; trigger sổ chỉ thêm [chưa kiểm chứng ở đây] |
| Module tự điền số tài khoản | AC-2 | Kernel từ chối dòng có số tài khoản của module khác `ke-toan` (ADR-0015) [chưa kiểm chứng ở đây] |
| Gửi `docType` ngoài hợp đồng / chưa khai | AC-4 | Cửa nạp chặn loại không khai |
| `docKey` không bắt đầu bằng mã nguồn gửi | AC-5 | `IN-BIZ-003` (chặn: mỗi nguồn chỉ nộp, sửa chứng từ của mình; R-EVENT-13) |
| `docKey` đổi mỗi lần gửi (ghi hai lần), phiên bản lùi | AC-5 | `IN-BIZ-004` (chặn: phiên bản cũ hơn bản đã nhận), `IN-BIZ-005` (cảnh báo: cùng phiên bản nhưng nội dung khác) |
| Tổng tiền không khớp các dòng | `event check` L2 | `IN-SUM-*` |
| Tự tính giá vốn rồi gửi | AC-3 (cảnh báo) | Hai nguồn giá vốn: `flow check` C1.3, C1.4 |
| Tồn kho âm vì nhập trễ | — | `flow check` C1.2; `INVENTORY_NEGATIVE`; F22-STK-01 |
| Chứng từ kho sửa sau khi đã Tính giá vốn | — | `COGS_STALE`; F22-STK-04; `flow check` L1 |
| Sổ kho ≠ số dư tài khoản kho | — | `flow check` C1.5; `INVENTORY_LEDGER_MISMATCH`; F22-STK-11 |
| Phiếu trả hàng không nối phiếu gốc | — | Bảng kiểm khoá kỳ (`flow check` C5) |
| Đổi mã hàng giữa kỳ | — | `flow check --to` dòng L1 chỉ thấy **dấu vết**. Chặn thật chờ đổi mã qua `core.item.add-code` ☐ |
| Gửi nghiệp vụ sản xuất | AC-4 (cổng chờ) | `event check` trả SKIP "cổng chưa mở" |

## 7. Quy trình khuyến nghị cho dev

1. `event check` từng loại chứng từ tới PASS (có máy chủ để thấy bút toán).
2. Viết `toDocument()` thuần, có test; chứng từ mẫu để trong `examples/` (module) hoặc repo của bạn.
3. Nộp một chuỗi thật (nhập → bán → trả), rồi `flow check --sku … --period … --to …`.
4. Module: `module check <key>` phải ĐẠT. CI chạy `selfcheck` và các test CLI (`packages/cli/test/`).
5. Gặp mã lạ: `explain <MÃ>`. Gặp ☐ (FIFO, đổi mã, sản xuất): **dừng phần đó** và nói với người dùng, không tự chế ở app.
