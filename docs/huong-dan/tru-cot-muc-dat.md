# Trụ cột & mức đạt (HT10)
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — hướng dẫn màn HT10 và thẻ "Trụ cột" ở trang chủ phân hệ -->

**Màn này trả lời hai câu:** Core bảo đảm điều gì cho số liệu của bạn, và hôm nay phần mềm **đã làm được tới đâu** — phần nào còn phải tự kiểm bằng tay.

## Đọc thế nào

- Mỗi ô là một **trụ cột** (ví dụ *Sổ cái bất biến*, *Định danh bất biến, mã có phiên bản*, *Liên tục kế toán*); ô đầu là **nền móng** *Quản trị dữ liệu gốc*. Thanh % là mức đạt gộp của các tiêu chí bên trong (đạt = 1, một phần = ½, mới tài liệu = ¼, chưa = 0). Bấm ô để chỉ xem trụ cột đó.
- Bảng dưới: từng **tiêu chí** — *Mức* (Đạt / Một phần / Mới tài liệu / Chưa), *Bằng chứng* (migration, test, check nào chứng minh), *Khoảng cách* (còn thiếu gì), *Việc tiếp* (mã việc trong kế hoạch phase), *Ưu tiên* (P0 = nền tảng không được sai).
- Tích **chỉ tiêu chí chưa đạt** để thấy nhanh chỗ Core còn phải tự kiểm.

## Với kế toán

Tiêu chí **Đạt** nghĩa là phần mềm tự giữ, bạn không phải kiểm tay (ví dụ: dòng sổ cái không sửa được; đổi mã hàng không làm đứt giá vốn). Tiêu chí **Một phần / Chưa** là chỗ bạn nên có bước kiểm riêng cho tới khi đạt — cột *Khoảng cách* nói rõ phần nào.

## Với người phát triển

Bảng là **kim chỉ nam**: làm tiêu chí P0 chưa đạt trước; mỗi tiêu chí trỏ tới việc `S0xx-*` trong `docs/phases`. Mức đạt chỉ đổi khi có bằng chứng (test / check) — sửa ở `docs/standard/tru-cot.json`, rồi chạy `node scripts/tru-cot-md.mjs` để tài liệu khớp. Không có nút "đánh dấu đạt".

## Thẻ "Trụ cột" ở trang chủ phân hệ

Cạnh thẻ *Quy trình* và *Tất cả chức năng*: cùng bảng, chỉ hiện tiêu chí gắn với phân hệ đang mở — để người mới hiểu luật nào đang bảo vệ số liệu của phân hệ, và dev biết việc kế tiếp của phân hệ đó.

<!-- [2026-11-05 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — thẻ Nền móng (S029-30, ADR-0028) -->
## Thẻ "Nền móng"

Bấm **Nền móng** ở đầu màn (hoặc mở `/he-thong/tru-cot?xem=nen-mong`). Thẻ này nhìn Core theo **sáu năng lực lõi** — Định danh & danh mục, Phân quyền & ngữ cảnh, Cấu hình & chính sách, Chứng từ & luồng duyệt, Sự kiện & kế toán, Liên tục & kiểm chuẩn — và **17 trụ cột** chia bốn nhóm nền móng. Có năm góc nhìn:

- **Sáu năng lực lõi**: mỗi năng lực làm gì, dev nhận sẵn gì (không phải tự xây lại), gọi bằng gì, nằm ở thư mục mã nào, còn thiếu gì.
- **Ma trận 17 trụ cột**: mỗi trụ cột thuộc năng lực nào, mức đạt, thanh tín hiệu kiểm; bấm một dòng để xem từng tín hiệu và nguyên tắc ECP nó giữ.
- **ECP × trụ cột**: 13 nguyên tắc bất biến Enterprise Continuity do trụ cột nào thi hành.
- **Tín hiệu kiểm**: mọi check / mã chẩn đoán / test làm bằng chứng — *chạy được*, *ở nhánh* (chưa vào bản chính), *chưa có*.
- **Tinh gọn & SDK**: bảy nguyên tắc Small Core, Strong Contracts.

Mức **Đạt** chỉ có khi không còn tín hiệu *chưa có*; bộ kiểm SC-CORE-1 chặn ghi "đạt" sai và báo khi một tín hiệu đã có mà bảng chưa nâng. Nguồn: `docs/standard/nen-mong.json`.

<!-- [2026-11-10 10:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B2 (S034-4): năm thẻ của HT10 -->
## Năm thẻ của màn

Đầu màn có năm thẻ, đi từ trong ra ngoài: luật → nền → cổng giữ luật → bộ máy chạy luật → công cụ để dev xem bộ máy chạy.

<!-- [2026-11-11 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B6 (S034-10): dòng tổng -->
**Dòng tổng** ở trên cùng gom năm con số — Tiêu chí, Nền móng, Cổng & bộ kiểm, Bộ máy, Công cụ dev — mỗi số là mức của thẻ đó, tính đúng như trong thẻ. Bấm một số để mở thẻ. Thẻ nào chưa tải được thì ô đó hiện "—".

| Thẻ | Trả lời câu gì | Mở thẳng |
|---|---|---|
| **Tiêu chí theo trụ cột** | Core bảo đảm điều gì, mỗi tiêu chí đạt tới đâu | `/he-thong/tru-cot` |
| **Nền móng** | Sáu năng lực lõi × 17 trụ cột đạt tới đâu theo tín hiệu kiểm | `?xem=nen-mong` |
| **Cổng & bộ kiểm** | Dữ liệu đi qua những cổng nào, mỗi mã kiểm có cách sửa, có test, gắn trụ cột chưa | `?xem=cong-kiem` |
| **Bộ máy** | Mỗi engine (Ghi sổ, Inventory, Document SDK, Workflow, Phân quyền, …) theo hợp đồng nào, còn bao nhiêu mốc | `?xem=bo-may` |
| **Nhà phát triển** | Công cụ DEV01..09 dùng được tới đâu, chạy ngay tại màn này | `?xem=nha-phat-trien` |

Kế hoạch ở `docs/phases/PHASE-034-HT10-BANG-HOAN-THIEN-CORE`.

**Thẻ báo "Bản cài chưa có tệp …"**: bản cài Docker dựng từ mã cũ chưa chép tệp nguồn của bảng vào ảnh. Cập nhật bản cài (`./scripts/cap-nhat.sh`) là hết. Phép kiểm SC-REL-3 giữ cho lỗi này không lặp lại.

<!-- [2026-11-10 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3a (S034-5): thẻ Cổng & bộ kiểm -->
## Thẻ "Cổng & bộ kiểm"

Dữ liệu đi qua các **cổng** từ ngoài vào trong: *Cổng A* (danh mục → nháp), *Cổng B* (cửa nạp, bậc L1..L5), *Commit Guard* (ngay trước ghi sổ), *Cổng L* (thư viện dùng chung), *Tự chẩn đoán* (L1 · L3 · L5, chạy đêm và trước khoá kỳ). Mỗi cổng là một ô: bấm để chỉ xem mã của cổng đó.

<!-- [2026-11-11 02:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3b (S034-6): bốn ý, trigger và CI có sổ -->
- **Thanh mức** của cổng: trung bình các mã. Mỗi mã đủ bốn ý, mỗi ý ¼: có câu *Cách sửa*, có *phương án có cấu trúc* (bước, màn, vai, kiểm lại), có *test*, gắn *trụ cột*. Với *Trigger CSDL* và *Bộ kiểm CI*: gắn trụ cột ½ + có kiểm ½ (ca tự kiểm của check; trigger do phép kiểm LEDGER_TRIGGERS giữ).
- **Trụ cột** của mã gắn theo họ mã (ví dụ mọi `LEDGER_*` → Sổ cái bất biến) ở `docs/standard/cong-kiem.json`; mã mới chưa gắn thì phép kiểm SC-GATE-1 báo.
- **Khoá sổ**: mã chẩn đoán nuôi điều kiện khoá sổ nào (PC-…).
- **Lượt gần nhất**: kết quả của mã ở lượt tự chẩn đoán gần nhất của đơn vị bạn. Bấm mã để mở *Nhà phát triển → Toàn vẹn*.
- *Trigger CSDL* (mọi trigger khai trong migration) và *Bộ kiểm CI* (mọi check SC-* / DG-*) có sổ sinh từ mã. *Cổng C* (giá vốn sau ghi sổ) và *Khoá kỳ* hiện **chưa có sổ**: ô nói bước nào sẽ làm.

Mã lấy thẳng từ sổ đăng ký trong mã, không ai gõ tay; thêm mã mới trong mã nguồn là thẻ tự có.

<!-- [2026-11-10 11:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B4 (S034-7): thẻ Bộ máy -->
## Thẻ "Bộ máy"

**Bộ máy** (engine) là phần tính hoặc quyết định thay người mà module gọi vào chứ không tự viết lại: Ghi sổ, Inventory Engine (kho · lô · giá vốn), Document SDK, Đánh số chứng từ, Workflow, Phân quyền, Policy Registry, Thư viện, Kiểm chuẩn pháp lý VN, Truy vết, Kết chuyển & khoá kỳ, Thuế, Bảng điểm.

- **Thanh mức** của bộ máy = số **mốc** đã xong / số mốc. Mốc là mã việc `S0xx-*` trong checklist của các phase; mốc *chờ đủ tín hiệu* tính ½. Không ai gõ mức.
- **Chưa có mốc** nghĩa là chưa phase nào lên kế hoạch cho bộ máy đó — đó là khoảng trống, không phải "xong".
- Bấm một bộ máy để xem: làm gì, gọi bằng gì, hợp đồng, mã nguồn, test, mã kiểm nó phát ra (mở thẻ Cổng & bộ kiểm), và từng mốc với trạng thái.

Nguồn: `docs/standard/bo-may.json` cùng bảng việc `docs/phases/bang-viec.json`; phép kiểm SC-ENG-1 giữ sổ khớp repo.

<!-- [2026-11-11 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a (S034-8): thẻ Nhà phát triển -->
## Thẻ "Nhà phát triển"

Bảng chín công cụ của menu *Nhà phát triển* (Tổng quan, Tra mã, Nhật ký, Lỗi theo module, Ghi sổ, Sự kiện, Toàn vẹn, Kịch bản, Vận hành), mỗi công cụ chấm theo sáu tiêu chí:

| | Tiêu chí | Đạt khi |
|---|---|---|
| T1 | Có API riêng, chỉ đọc | mọi đường API của công cụ có trong mã |
| T2 | Có test API | có test gọi API của công cụ |
| T3 | Nguồn chưa bật thì nói cách bật | công cụ đọc Loki / Tempo / Prometheus thì màn nói cách bật khi nguồn tắt |
| T4 | Có hướng dẫn riêng | màn có trang hướng dẫn của riêng nó |
| T5 | Liên kết chéo | màn mở thẳng được công cụ khác |
| T6 | Chạy ở bản cài nhiều đơn vị | không chỉ chạy ở bản cài một đơn vị |

<!-- [2026-11-11 03:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5b (S034-9): Chạy ở đây -->
Rê chuột lên ✓ / ✗ để xem bằng chứng. **Chạy ở đây** mở công cụ ngay dưới bảng — đúng màn của menu Nhà phát triển, không phải bản rút gọn (mở thẳng: `/he-thong/tru-cot?xem=nha-phat-trien&cong-cu=DEV07`). **Mở ↗** sang màn riêng của công cụ. Cả hai cần quyền Nhà phát triển; ai đăng nhập cũng xem được bảng.

Tiêu chí sinh từ mã bằng `node scripts/cong-cu-dev.mjs --write` vào `docs/standard/cong-cu-dev.json`; phép kiểm SC-DEV-2 báo khi bảng lệch mã hoặc lệch menu.

<!-- [2026-11-11 03:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — S034-12: In cả năm thẻ -->
## In

- Nút **In** ở đầu màn in thẻ đang xem.
- Nút **In cả năm thẻ** dựng cả năm thẻ nối nhau, mỗi thẻ sang trang mới, có dòng tổng ở đầu. Hộp in tự mở khi dữ liệu tải xong; in xong màn trở lại thẻ đang xem. Dùng làm phụ lục khi báo cáo mức tuân chuẩn của phần mềm.

