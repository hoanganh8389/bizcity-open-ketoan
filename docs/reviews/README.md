# Review theo nhịp — phản tư Core sau mỗi ba phase
<!-- [2026-11-08 12:40 PM Johnny Chu - Chu Hoàng Anh] REVIEW — lập bộ docs/reviews/: tiêu chí 12 trục, bảng điểm matrix, nhịp 3 phase / 1 review, đóng phiên bản theo nhóm phase; R1 = review nền móng lần 1 cho PHASE-001…031 -->

> **Vì sao có thư mục này.** Phase là gói việc; checklist là trạng thái từng việc; bộ kiểm là máy chấm từng luật. Nhưng không có chỗ nào trả lời câu hỏi của chủ dự án: *"Core sau ba phase vừa rồi có còn **gọn, chặt bên trong, mềm bên ngoài** không? Sự kiện ngoài về có bị chặn cứng không? Lỗi có trace được, cảnh báo kịp, dễ dùng không? Có nhìn được toàn cảnh như mua hàng không?"* Review trả lời câu đó, chấm điểm theo **một ma trận cố định**, rồi quyết **đóng phiên bản** hay chưa.
>
> **Nguồn sự thật vẫn là `main`** (R-FLOW-7). Review là **ảnh chụp có chấm điểm**, không phải nguồn trạng thái thứ hai: mọi phát hiện phải trỏ về một việc `S###-n` / câu hỏi `Q###-n` / quyết định `D###-n` trong checklist của phase sở hữu, hoặc đề xuất việc mới ở đó. Đổi trạng thái vẫn bằng PR sửa checklist (R-FLOW-8).

## Tệp trong thư mục

| Tệp | Là gì | Ai sửa, khi nào |
|---|---|---|
| [TIEU-CHI.md](TIEU-CHI.md) | **12 trục đánh giá**, thang 0–4, trục cổng, luật kết luận, nhịp 3 phase / 1 review | nhóm Lõi; đổi trục = đổi phiên bản tiêu chí, ghi nhật ký cuối tệp |
| [BANG-DIEM.md](BANG-DIEM.md) | **Bảng điểm matrix**: trục × review (theo thời gian), trục × trụ cột 0–VIII, phase × phiên bản × trạng thái | mỗi lần review, cùng PR với biên bản |
| [PHIEN-BAN.md](PHIEN-BAN.md) | **Bản đồ phase → phiên bản Core**, điều kiện đóng từng phiên bản, nhật ký Kernel theo phiên bản (tóm tắt K0–K3; nguồn chi tiết là `CHANGELOG.md` gốc) | khi đóng phiên bản hoặc đổi nhóm phase (chủ dự án duyệt) |
| [review-board.json](review-board.json) | Bản máy đọc `bizcity_review_board@1`: trục, điểm, phát hiện, phiên bản | cùng PR với biên bản; là nguồn cho màn kanban / bảng điểm về sau (sinh tự động: đề xuất R2) |
| `REVIEW-R<n>-<ten>-<ngày>.md` | **Biên bản một lần review**: đo ở commit nào, điểm từng trục kèm bằng chứng `tệp:dòng`, phát hiện có mã `RV-R<n>-nn`, việc cần làm, kết luận | người review; chỉ thêm, không sửa biên bản cũ |

Biên bản đã có:

| Review | Ngày | Phạm vi | Kết luận |
|---|---|---|---|
| [R1 · Nền móng lần 1](REVIEW-R1-FOUNDATION-2026-11-08.md) | 2026-11-08 | PHASE-001 → PHASE-031, `main` @ `886f4f95` | **ĐẠT có điều kiện** — 27/48 điểm (56 %), 3 phát hiện chặn, 0 trục cổng dưới mức 2 |

## Nhịp

- **Cứ 3 phase mở mới thì 1 lần review** (chủ dự án quyết 2026-11-08). Phase 032, 033, 034 mở xong ⇒ R2 trước khi mở 035. Review phải xong **trước** khi đóng phiên bản có các phase đó.
- Review lần 1 (R1) là **nền móng**: quét cả 31 phase từ đầu, giữ bức tranh toàn cảnh cho cộng đồng đông người cùng phát triển mà triết lý Core không trôi. Các review sau chỉ chấm lại trục bị động chạm, nhưng **mọi trục đều phải có điểm** (điểm cũ giữ nguyên kèm ghi "không đổi").
- Phát hiện mức **chặn** của review ⇒ không đóng phiên bản, không phát hành (cùng tinh thần R-REV-5, R-REL-4). Phát hiện **nặng** ⇒ phải có việc `S###-n` kèm người nhận trước khi đóng phiên bản.
- Review **không âm thầm sửa mã**. Nó ghi việc, trỏ luật gốc, trỏ tệp mẫu làm đúng trong repo (R-REV-16), để người đóng góp tự sửa và lần sau không lặp.

## Cách làm một lần review (≤ 4 bước)

1. **Đo.** `git fetch`; dựng worktree sạch ở `origin/main`; chạy `node tests/conformance/selfcheck.mjs --strict` (có CSDL test thì thêm lane diagnostics); ghi commit, ngày, số đo.
2. **Đọc theo 12 trục.** Mỗi trục: đọc tài liệu phase sở hữu rồi **đối chiếu mã** (không chấm từ tài liệu). Ghi bằng chứng `tệp:dòng`; đánh dấu rõ cái gì **đã thấy trong mã** và cái gì là **suy luận**.
3. **Chấm và ghi.** Điền điểm 0–4 từng trục theo [TIEU-CHI.md](TIEU-CHI.md); cập nhật [BANG-DIEM.md](BANG-DIEM.md) và `review-board.json`; viết biên bản `REVIEW-R<n>-…`; mỗi phát hiện có mã `RV-R<n>-nn`, mức, trục, phase sở hữu, việc / câu hỏi tương ứng.
4. **Nối về nguồn.** Mở PR tài liệu: biên bản + bảng điểm + dòng `CHANGELOG.md`; phát hiện chưa có việc thì thêm dòng `S###-n` vào checklist phase sở hữu (cùng PR hoặc PR kế tiếp), rồi `node scripts/bang-viec.mjs --write`. Quyết định của chủ dự án về việc đóng phiên bản ghi vào [PHIEN-BAN.md](PHIEN-BAN.md).

## Liên quan

- Luật rà soát đóng góp theo PR / theo người: [RULE-REVIEW](../rules/RULE-REVIEW.md) (R-REV, thang 11 trục §7) — review theo nhịp ở đây chấm **Core**, không chấm một người.
- Phát hành, cổng phát hành: [RULE-RELEASE](../rules/RULE-RELEASE.md), [ops/RELEASE.md](../ops/RELEASE.md); đánh số: [standard/VERSIONING.md](../standard/VERSIONING.md).
- Trụ cột 0–VIII: [standard/tru-cot.json](../standard/tru-cot.json), [core/01-tru-cot.md](../core/01-tru-cot.md); 17 trụ nền móng: [standard/nen-mong.json](../standard/nen-mong.json).
- Các bản đánh giá trước khi có nhịp (ảnh chụp theo ngày): [audits/](../audits/).
