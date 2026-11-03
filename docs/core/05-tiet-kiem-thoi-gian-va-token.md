# 05 · Tiết kiệm được gì: nghiệp vụ kế toán, thời gian, token
<!-- [2026-11-03 07:37 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — phân tích tiết kiệm cho dev thiếu nghiệp vụ kế toán: phân loại đã đo / giả định / chưa có, mô hình ước tính, cơ chế tiết kiệm token, cách đo thật -->

> **Đọc trước:** tài liệu này tách ba loại số, và README chỉ được trích theo đúng loại.
> **ĐÃ ĐO** = đếm từ mã nguồn của repo, chạy lại được bằng `node scripts/do-bang-chung-core.mjs`.
> **GIẢ ĐỊNH** = số giờ, số token, đơn giá của một mô hình ước tính, chạy bằng `node scripts/uoc-tinh-tiet-kiem.mjs`. **Chưa có dự án thật nào được đo.**
> **CHƯA CÓ** = việc Core không làm, hoặc đo chưa làm.

## 1. Ai hưởng lợi

Developer làm ERP nội bộ cho công ty mình, hoặc một module bán hàng, POS, CRM, quản lý sản xuất (MRP), nhân sự (HRM), mà **thiếu nghiệp vụ kế toán và sổ sách**. Không có Core, họ phải tự học định khoản, thuế, giá vốn, khoá kỳ, rồi tự viết, tự kiểm. Với Core, họ **kể sự việc** theo hợp đồng, Core ghi sổ đúng nguyên tắc ([01](01-bay-tru-cot.md)).

## 2. Nghiệp vụ mà dev không phải tự làm: Core đã có gì (ĐÃ ĐO)

Chạy `node scripts/do-bang-chung-core.mjs` (đo ngày 2026-11-03). Số route và số ca test đếm theo mẫu viết nên là **mức tối thiểu**.

| Nhóm công việc | Dev phải biết và làm nếu tự xây | Core đã có |
|---|---|---|
| **1. Chuẩn hoá dữ liệu ban đầu** | Hệ thống tài khoản, chi nhánh, đối tượng, mặt hàng và nhóm hạch toán, mã thuế, đơn vị tính, kỳ | Dữ liệu mẫu và danh mục chuẩn đọc qua API (`/branches`, `/tax-codes`, `/products`, `/partners`), 61 migration |
| **2. Ghi nhận giao dịch và sổ sách** | Định khoản Nợ / Có, sổ cái, sổ kho, công nợ, hoá đơn, phiên bản chứng từ | **10 loại chứng từ**, **6 tệp luật định khoản**, sổ chỉ thêm, **453+ route API** |
| **3. Thiết lập quy tắc ghi nhận** | Lý do định khoản, nhóm hạch toán, giá vốn, khoá kỳ, kết chuyển | Gói định khoản theo chế độ, lý do, Tính giá vốn (ACC49), Kết chuyển (ACC6), Khoá kỳ (ACC2) |
| **4. Kiểm soát sai sót và lịch sử** | Đảo bút toán, giữ nguồn và phiên bản, không mất chứng từ lỗi | **22 mã phát hiện ở cửa nạp**, bể chờ, **28 kiểm tự chẩn đoán**, **93 ca lỗi F22** có cách khắc phục theo vai |
| **5. Kết nối với phần mềm kinh doanh** | Học hợp đồng, ánh xạ mã, khoá API | Hợp đồng nạp, API, MCP, SDK module, CLI, **7 skill** cho AI. *Nhóm này không giảm giờ, xem §4* |
| **6. Kiểm thử và đối chiếu số liệu** | Tự dựng ca kiểm, đối chiếu kho với sổ cái, kiểm chuỗi mua → bán | **1.087+ ca test** API, **26 tệp luật** bộ kiểm chuẩn, `event check`, `flow check`, API đối chiếu kho ↔ sổ cái |

Tổng khối lượng mã Core + API + SDK + CLI (không tính test): **319 tệp, 48.677 dòng**. Đây là *khối lượng đã có*, **không phải** số giờ một dev sẽ viết nếu tự làm: không quy đổi dòng mã ra giờ ở đây vì năng suất mỗi người khác nhau.

## 3. Theo loại ứng dụng

| Ứng dụng | Phần kế toán dev thiếu | Core giúp | **Core chưa giúp** |
|---|---|---|---|
| **ERP nội bộ** | Gần như toàn bộ | Phân hệ bán hàng, mua hàng, kho, quỹ, tài sản, thuế, kế toán (`apps/api/src/phan-he/`) | Sản xuất |
| **POS** | Định khoản bán, thanh toán nhiều hình thức, thuế | `sale`, `sale_return`, `customer_payment`; ví dụ chạy được [pos-mini](../../examples/pos-mini/README.md) | — |
| **Bán hàng online** | Giao thành công, COD thu sau, hoàn hàng | `sale`, `customer_payment`, `sale_return` có `originalDocKey` | Phí sàn, phí vận chuyển: không có loại chứng từ riêng (gửi làm chứng từ nguồn) |
| **CRM** | Công nợ khách, thu nợ | Đồng bộ đối tượng, đọc công nợ thật (`/partners/:code/balances`, `/debt-items`), phân bổ thu nợ | — |
| **MRP, sản xuất** | Giá thành, xuất NVL, nhập thành phẩm | Mua NVL (`purchase`), bán thành phẩm (`sale`) | **Chứng từ sản xuất và giá thành là cổng chờ** ([skill mở cổng](../../skills/contribute-production-module/SKILL.md)). Lợi ích ở nhóm này thấp nhất |
| **HRM** | Chi phí lương, các khoản phải trả | Ghi nhận bằng `manual_journal` ([hướng dẫn](../api/15-phieu-ke-toan-module.md)) theo lý do loại journal do kế toán khai (năng lực `ledger.manual-journal` ghi `available`; tài khoản do lý do quyết, module không chọn) | **Không có bảng lương, BHXH, thuế TNCN.** App HRM tự tính lương. Chưa chạy thử đường `manual_journal` trên CSDL thật khi viết tài liệu này |
| **Tài sản, CCDC** | Thẻ tài sản, khấu hao | API thẻ tài sản, khấu hao do kế toán chạy (ACC31) | Tự ghi tăng tài sản từ hoá đơn mua: hỏi kế toán quy trình |

**Hệ quả thật thà:** lợi ích lớn nhất khi ứng dụng là bán hàng, POS, mua hàng, kho. Với MRP và HRM, Core chỉ giúp phần mua, bán và ghi nhận; phần nghiệp vụ riêng vẫn phải tự làm hoặc đợi cộng đồng mở cổng.

## 4. Thời gian build (GIẢ ĐỊNH)

Mô hình của dự án cho một ứng dụng quản lý kinh doanh **quy mô vừa**. Công thức và dữ liệu nằm ở `scripts/uoc-tinh-tiet-kiem.mjs`; test `packages/cli/test/saving-model.test.mjs` khoá để README luôn khớp script.

| Nhóm công việc | Tự xây (giờ) | Dùng Core (giờ) | Tránh được |
|---|---:|---:|---:|
| Chuẩn hoá dữ liệu ban đầu | 40 | 15 | 25 |
| Ghi nhận giao dịch và sổ sách | 120 | 15 | 105 |
| Thiết lập quy tắc ghi nhận | 75 | 30 | 45 |
| Kiểm soát sai sót và lịch sử điều chỉnh | 80 | 20 | 60 |
| Kết nối với phần mềm kinh doanh | 45 | 50 | **−5** |
| Kiểm thử và đối chiếu số liệu | 95 | 40 | 55 |
| **Tổng** | **455** | **170** | **285** |

- **285 giờ ≈ 7,1 tuần công** (40 giờ/tuần), không phải rút ngắn 7 tuần lịch cho mọi dự án.
- **Nhóm "Kết nối" mất thêm 5 giờ**: dev vẫn phải học hợp đồng, ánh xạ mã, xin khoá API. Mô hình không giấu điều này.
- **Nhóm lớn nhất là "Ghi nhận giao dịch và sổ sách"** (105 giờ): đây chính là phần nghiệp vụ kế toán dev thiếu.
- **Thời gian tìm hiểu nghiệp vụ kế toán không có dòng riêng** trong mô hình: được coi là nằm trong ba nhóm đầu. Nếu bạn muốn tách, đo riêng và nạp bằng `--input` (xem §8).

### Quy ra tiền và độ nhạy

Với chi phí developer 300.000 đồng/giờ: 285 × 300.000 = **85,5 triệu đồng**. Cộng phí API giảm 3,432 triệu: **88,932 triệu đồng** cho một dự án. Số này là giá trị **nguồn lực được giải phóng**, không phải tiền mặt tiết kiệm.

Tổng giá trị (triệu đồng) khi phần tiết kiệm thực tế chỉ đạt một phần bảng giả định:

| Đạt \ đồng/giờ | 150.000 | 300.000 | 500.000 |
|---|---:|---:|---:|
| 100% | 46,2 | **88,9** | 145,9 |
| 60% | 27,7 | 53,4 | 87,6 |
| 30% | 13,9 | 26,7 | 43,8 |

Chạy `node scripts/uoc-tinh-tiet-kiem.mjs --sensitivity` để tái tạo, hoặc đổi `--rate`, `--realize`.

## 5. Token AI

### Giả định của mô hình

| | Tự phát triển | Dùng Core | Giảm |
|---|---:|---:|---:|
| Input token | 35,0 triệu | 11,0 triệu | 24,0 triệu (68,6%) |
| Output token | 7,0 triệu | 2,2 triệu | 4,8 triệu (68,6%) |
| Tổng | 42,0 triệu | 13,2 triệu | 28,8 triệu |
| Phí quy đổi | 5.005.000 đồng | 1.573.000 đồng | **3.432.000 đồng** |

Đơn giá giả định: 2,5 USD/triệu input, 15 USD/triệu output, 26.000 đồng/USD. **Thay bằng giá của mô hình bạn đang dùng** (`--price-in`, `--price-out`).

**Token chỉ chiếm khoảng 3,9% giá trị tiết kiệm** (3,432 / 88,932 triệu). Phần lớn lợi ích là **thời gian developer và độ tin cậy của sổ**, không phải tiền API. Đừng bán dự án này như một công cụ "tiết kiệm token".

### Vì sao có thể tiết kiệm token (cơ chế)

Đây là cơ chế, không phải số đo.

| Cơ chế | Thể hiện ở |
|---|---|
| **AI không phải suy luận luật kế toán.** Đọc hợp đồng và skill thay vì tự dựng định khoản, thuế, giá vốn | [04](04-huong-dan-cho-ai.md), skill `open-ketoan-standard` |
| **Vòng sai → sửa ngắn.** Lỗi trả về có cấu trúc: mã, `sửa:`, `luật:`; `explain` tra mã tại chỗ, không phải tìm web | `event check`, `explain` |
| **Kiểm không tốn token mô hình.** `event check` L1, L2 chạy offline; bút toán thử (dryRun) do Core dựng, không phải AI suy | `event check` |
| **Nạp theo lớp.** Skill chỉ nạp tên và mô tả trước, đọc thân khi cần | `skills/` |
| **Ít code sinh ra.** Định khoản, giá vốn, kết chuyển, khoá kỳ đã có, AI không sinh | Core |

### Cái ĐÃ ĐO về token

Bộ tài liệu tối thiểu một AI cần đọc để nối một app vào sổ (`node scripts/do-bang-chung-core.mjs`):

| Phần | Ký tự | Từ | Token (ước lượng) |
|---|---:|---:|---:|
| AGENTS.md, mục Xây app ghi sổ | 1.999 | 301 | ~500–800 |
| Skill nền `open-ketoan-standard` | 11.446 | 2.338 | ~2.900–4.600 |
| Một skill theo việc (POS) | 7.533 | 1.347 | ~1.900–3.000 |
| Hợp đồng nạp chứng từ | 12.411 | 1.983 | ~3.100–5.000 |
| **Cộng** | **33.389** | **5.969** | **~8.300–13.400** |

**Cách đọc:** token là *ước lượng* theo 2,5–4 ký tự/token (tiếng Việt thường nhiều token hơn tiếng Anh), chưa đo bằng bộ tách token của nhà cung cấp. Nếu giả định 13,2 triệu token của cột "Dùng Core" ở trên đúng, riêng việc **đọc tài liệu chỉ khoảng 0,06–0,1%**; token chủ yếu nằm ở việc **sinh và sửa code**. Mỗi phiên AI nạp lại tài liệu thì cộng thêm. Repo không chứa toàn văn thông tư, nên **chi phí của cách tự làm không so được ở đây**.

## 6. Thời gian tìm hiểu nghiệp vụ kế toán: dev bớt phải học gì

| Dev tự xây phải hiểu | Với Core bạn chỉ cần |
|---|---|
| Định khoản bán, mua, trả, chuyển kho (Nợ / Có) | Chọn `docType`, `reasonCode`; Kernel dựng |
| Thuế GTGT đầu ra, đầu vào, hoá đơn | Mã thuế từ `/tax-codes`; tiền thuế là số trên hoá đơn đã chốt |
| Giá vốn bình quân, tồn kho | Không tính; kế toán bấm Tính giá vốn; đọc `/inventory/costs` |
| Sổ cái, sổ chi tiết, nhật ký, báo cáo | Có sẵn ([hướng dẫn từng màn](../huong-dan/00-bat-dau.md)) |
| Khoá kỳ, kết chuyển lãi lỗ | Việc của kế toán; `flow check` cho biết đã sẵn sàng chưa |
| Công nợ, đối trừ | `ctx.ledger.allocateDebt`, `/debt-items` |
| Sửa chứng từ đã ghi | Cùng `docKey`, `version + 1`: Core đảo và ghi lại |
| Chế độ kế toán hiện hành (TT99/2025) | Gói định khoản của đơn vị, app không đọc thông tư |

**Giới hạn:** Core không thay kế toán. Dev **vẫn phải hiểu sự việc kinh tế của chính app mình** (khi nào hàng đã đi, khi nào tiền đã đổi tay). Kế toán trưởng vẫn quyết chính sách, lý do, nhóm hạch toán, duyệt gói. Tài liệu này không phải tư vấn pháp lý, không phải chứng nhận tuân thủ ([README, mục Lộ trình](../../README.md#lộ-trình-và-trạng-thái-dự-án)).

## 7. Bảng phân loại

| Mục | Loại |
|---|---|
| Số loại chứng từ, tệp luật, route, migration, test, mã phát hiện, ca F22, kiểm chẩn đoán, luật bộ kiểm chuẩn, skill, dòng mã | **Đã đo** (script) |
| Kích thước bộ tài liệu AI phải đọc (ký tự, từ) | **Đã đo** |
| Số token của bộ tài liệu đó | **Ước lượng** theo khoảng ký tự/token |
| Số giờ "tự xây" và "dùng Core" từng nhóm; quy ra tuần công và tiền | **Giả định** (mô hình, chưa đo dự án thật) |
| Số token "tự phát triển" và "dùng Core" của một dự án; phí API | **Giả định** |
| Đơn giá token, tỉ giá, chi phí developer | **Giả định**, thay bằng số của bạn |
| Mức giảm số vòng sửa nhờ `event check` | **Chưa đo** |
| Giá trị cho MRP, HRM | **Thấp hơn bảng**, vì thiếu cổng sản xuất, thiếu bảng lương |

## 8. Cách đo thật trên dự án của bạn

Để biến giả định thành bằng chứng: ghi lại ở dự án thật, nạp vào script.

1. Với mỗi nhóm công việc, ghi **giờ thật** (dự án trước làm tay, hoặc ước theo kinh nghiệm của chính nhóm) và **giờ thật khi dùng Core**. Tách thêm một dòng "Tìm hiểu nghiệp vụ kế toán" nếu muốn.
2. Lấy **token thật** từ nhật ký của công cụ AI bạn dùng (input, output).
3. Ghi **số lần `event check` FAIL trước khi PASS** và số vòng sửa mỗi loại chứng từ.
4. Nạp bằng `--input`:

```json
{
  "groups": [
    { "name": "Tìm hiểu nghiệp vụ kế toán", "build": 30, "core": 6 },
    { "name": "Ghi nhận giao dịch và sổ sách", "build": 100, "core": 20 }
  ],
  "tokens": { "build": { "in": 30000000, "out": 6000000 }, "core": { "in": 9000000, "out": 2000000 } }
}
```

```bash
node scripts/uoc-tinh-tiet-kiem.mjs --input do-that.json --rate 250000 --usd 25500
```

Khi có số thật, thay bảng giả định ở README bằng số của bạn và ghi rõ nguồn, ngày đo, quy mô dự án.

## 9. Bản demo

| Hệ thống | Địa chỉ | Là gì |
|---|---|---|
| Kế toán | https://ketoan.bizcity.vn/ (mã đơn vị `demo`, email `admin@ketoan.local`; mật khẩu mặc định như mục [Cài đặt](../../README.md#cài-đặt) của README) | Bản chạy của open-ketoan: các màn sổ cái, báo cáo, Tính giá vốn, Khoá kỳ |
| Quản trị kho, POS | https://quantri.bizcity.vn/ | Hệ thống quản trị kho và POS (theo mô tả của ban quản trị). Tài khoản không công bố trong repo, liên hệ ban quản trị |

**Chưa kiểm chứng:** cả hai địa chỉ trả HTTP 200 khi truy cập không đăng nhập (đo ngày 2026-11-03); chưa ai đăng nhập để đối chiếu nội dung với tài liệu này. Bản demo có thể chạy phiên bản **cũ hơn** repo: chức năng mới (đối chiếu kho ↔ sổ cái, `module accounting-check`) có thể chưa có ở đó. Bản demo là hệ thống chung: **đừng nhập dữ liệu thật**, dữ liệu có thể được đặt lại.
