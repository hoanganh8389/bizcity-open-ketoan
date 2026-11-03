# RULE · Nhận việc và đưa vào main — giữ chỗ trước, chốt thiết kế trước, code sau (R-FLOW)
<!-- [2026-11-03 09:55 PM Johnny Chu - Chu Hoàng Anh] FLOW — luật nhận việc: giữ chỗ vào main trước khi code, chốt thiết kế dùng chung bằng tài liệu trước, nhánh ngắn (chủ dự án chọn phương án chặt: giữ chỗ phải vào main) -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 1 · **Trạng thái:** chủ dự án đồng ý phương án 2026-11-03 (giữ chỗ **phải vào `main` trước**, chặt hơn và chậm hơn — chủ dự án chấp nhận cái giá đó). Thi hành bằng [Bước 0 trong AGENTS.md](../../AGENTS.md), lệnh `node scripts/nhan-viec.mjs` (`list`, `kiem`) và phép kiểm SC-FLOW-1 (xem cột "Kiểm bằng" và mục "Giới hạn của phép kiểm").
> Danh sách việc đang có người nhận: [docs/phases/CLAIMS.md](../phases/CLAIMS.md).

## Nguyên tắc một câu

> **Giữ chỗ và tài liệu vào `main` trước; code đi sau.** Hai phiên không cùng làm một việc, và không ai đổi thứ dùng chung khi chưa có chữ chốt. **`main` là nguồn sự thật duy nhất của tài liệu** (R-FLOW-7).

## Vì sao (đã xảy ra ngày 2026-11-03, không phải lo xa)

- **Hai phiên làm trùng một đợt.** W6 đợt 3 (chi nhánh, kho, ĐVT, ngân hàng) có hai PR độc lập (#49 và nhánh module-host); đợt 4 (`ctx.meta`, đối tượng) cũng hai bản (#50 và #45). Kế hoạch PHASE-014 *có đủ tài liệu* — cái thiếu là **không ai ghi "đợt này có người nhận"**.
- **Hai thiết kế cho một API dùng chung.** `ctx.meta` ra đời hai lần với hai hình dạng (hàm `ctx.meta(k, v)` so với object `Object.assign(ctx.meta, …)`), và hai chính sách nhật ký (giữ / bỏ `writeAudit`). Hợp đồng `BIZCITY-ACTION-v1` chưa chốt trước nên cả hai đều "đúng".
- **Nhánh sống lâu, xếp chồng.** Bốn PR chồng nhau (#42 → #44 → #46 → #48), mỗi nhánh lệch `main` 20–28 commit khi `main` nhận 49 commit trong 12 giờ; kết quả là năm tệp xung đột lặp lại ở cả bốn PR.
- **Luật vào `main` mà nhánh khác không biết.** Sơ đồ tổ chức thêm 6 route ghi thô trước khi phép kiểm SC-ACT-1 (chặn) vào `main`; chỉ đến lúc gộp mới lộ.

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-FLOW-1** | **Giữ chỗ trước, code sau.** Mỗi đợt việc (đợt, wave, `PHASE-xxx Wn`) phải có một dòng trong [CLAIMS.md](../phases/CLAIMS.md) **đã nằm trên `main`** trước commit code đầu tiên của đợt. Thêm dòng bằng PR **chỉ tài liệu**; chờ merge xong mới tạo nhánh code. Dòng ghi: đợt, phạm vi (đường dẫn), người / phiên nhận, nhánh, trạng thái, ngày | SC-FLOW-1 (bảng giữ chỗ); `nhan-viec.mjs kiem` (nhánh đang làm có dòng giữ chỗ) |
| **R-FLOW-2** | **Thứ dùng chung phải có chữ chốt trước.** Đụng một mục trong bảng ở §3 thì PR **tài liệu chốt thiết kế** (hợp đồng / ADR / luật) vào `main` trước, rồi mới đến PR code. Chữ chốt tối thiểu: vấn đề, lựa chọn, hình dạng cụ thể (chữ ký hàm, khuôn dữ liệu hoặc ví dụ), ảnh hưởng, kiểm bằng gì | `nhan-viec.mjs kiem` (tài liệu thuộc bảng §3 đã vào main kể từ ngày giữ chỗ); duyệt PR theo [CANON §5](../00-CANON.md) |
| **R-FLOW-3** | **Một phạm vi, một người.** Hai dòng đang làm không được chồng phạm vi (đường dẫn trùng hoặc chứa nhau). Phát hiện chồng: người đến sau **dừng**, báo người dùng, chọn việc khác hoặc thoả thuận sửa dòng của người đến trước | SC-FLOW-1 (hai dòng chồng phạm vi); `nhan-viec.mjs kiem` (tệp đổi ngoài phạm vi) |
| **R-FLOW-4** | **Nhánh ngắn, không xếp chồng sâu.** Một nhánh sống không quá một ngày làm việc, không quá khoảng 10 commit; không xếp chồng quá 2 tầng PR; đã xếp chồng thì merge từ dưới lên ngay khi xong | `nhan-viec.mjs kiem` (cảnh báo quá 10 commit hoặc quá 24 giờ); duyệt PR |
| **R-FLOW-5** | **Chỉ đẩy khi đã gộp `main` và bộ kiểm xanh.** Trước khi đẩy: `git fetch`, `git merge origin/main`, `git merge-tree --write-tree origin/main HEAD` không báo xung đột, `selfcheck --strict` ĐẠT. `main` đổi sau đó (PR khác merge) thì gộp lại trước khi merge. Không `push --force`, không rebase nhánh đã đẩy | `nhan-viec.mjs kiem` (đã gộp main, gộp thử không xung đột); `selfcheck --strict` |
| **R-FLOW-6** | **Trả chỗ trong cùng PR.** PR cuối của đợt xoá dòng khỏi CLAIMS.md và ghi nhật ký checklist. Dòng "đang làm" quá 3 ngày không có commit trên nhánh coi là đã nhả; người khác chỉ nhận sau khi hỏi người giữ hoặc chủ dự án | SC-FLOW-1 (khuôn bảng); `nhan-viec.mjs list` (cảnh báo dòng quá 3 ngày) |
| **R-FLOW-7** | **Nguồn sự thật của tài liệu là `main`.** <!-- [2026-11-03 10:35 PM Johnny Chu - Chu Hoàng Anh] FLOW — R-FLOW-7: nguồn sự thật của tài liệu là main (chủ dự án: "source of truth tài liệu phải ở nhánh main để nhiều session window, nhiều dev ko bị phân mảnh tài liệu kiến trúc chuẩn do Johnny Chu ban hành") --> Kiến trúc chuẩn, luật, hợp đồng, ADR và quyết định của chủ dự án (Johnny Chu – Chu Hoàng Anh) chỉ có hiệu lực khi đã nằm trong **tài liệu sở hữu trên `main`** (phase, rule, contract, ADR — bảng "đổi code X → sửa tài liệu Y" ở [CANON §5](../00-CANON.md)). Tài liệu ngoài repo (Claude artifact, Google Docs, ghi chú phiên, chat), nhánh chưa merge và bản vá là **bản làm việc**: khác `main` thì `main` thắng. Mỗi phiên, mỗi dev đọc tài liệu từ `origin/main` (`git fetch` rồi `git show origin/main:<tệp>`) trước khi làm, không đọc bản trong nhánh của mình hay bản làm việc. Quyết định mới vào tài liệu sở hữu bằng PR tài liệu trước (R-FLOW-2), không chỉ nằm trong chat hay artifact. Không sao chép tài liệu kiến trúc sang nơi khác để sửa riêng; muốn đổi thì mở PR | duyệt PR; `nhan-viec.mjs` đọc bảng giữ chỗ và chữ chốt từ `origin/main` |
| **R-FLOW-8** | **Một bảng việc, sinh từ `main`.** <!-- [2026-11-03 11:40 PM Johnny Chu - Chu Hoàng Anh] FLOW — R-FLOW-8 bảng việc sinh từ main (chủ dự án chọn phương án D: trạng thái việc chỉ ở main; không bảng ngoài) --> Trạng thái việc chỉ nằm ở ba chỗ trên `main`: [CLAIMS.md](../phases/CLAIMS.md) (ai giữ việc nào, phạm vi nào), `docs/phases/PHASE-xxx/40-MASTER-CHECKLIST.md` (từng việc con và bằng chứng), bảng sinh tự động `docs/phases/BANG-VIEC.md` + `bang-viec.json`. Không dùng bảng ngoài repo (Trello, GitHub Projects, artifact) làm nơi giữ trạng thái; một màn xem kiểu kanban được phép khi nó **chỉ đọc** `bang-viec.json` từ `main`. Đổi trạng thái = PR sửa checklist / CLAIMS, rồi chạy `node scripts/bang-viec.mjs --write`. Khuôn ở §4 | SC-FLOW-1 (mở rộng), SC-FLOW-3, SC-FLOW-4 |

## §3. Thứ dùng chung (R-FLOW-2)

Danh sách ngắn; bảng đầy đủ "đổi code X → sửa tài liệu Y" ở [CANON §5](../00-CANON.md).

| Đụng vào | Tài liệu chốt trước |
|---|---|
| API runtime của action và SDK: `packages/platform/src/core/actions.ts`, `packages/module-sdk` | [BIZCITY-ACTION-v1](../contracts/BIZCITY-ACTION-v1.md), `packages/module-sdk/API.md` |
| Khuôn, mã, hợp đồng dùng chung: `packages/contracts/src` | `docs/contracts/BIZCITY-*.md` tương ứng |
| Chính sách bằng chứng, nhật ký, idempotency | [BIZCITY-EVIDENCE-v1](../contracts/BIZCITY-EVIDENCE-v1.md), ADR |
| Luật lớp và biên module: `tests/conformance/lib/layers.mjs` | [RULE-MODULE-BOUNDARY](RULE-MODULE-BOUNDARY.md) |
| Migration mới hoặc đổi lược đồ | phase tương ứng; số lấy bằng `scripts/so-tiep-theo.mjs` |
| Phép kiểm mức **chặn** mới, đổi baseline | [RULE-QUALITY-GATE](RULE-QUALITY-GATE.md) |
| `docs/standard/*` | chính nó (đổi phiên bản theo hợp đồng) |

Không cần chữ chốt riêng: làm thêm theo **khuôn đã chốt** (vd chuyển thêm route sang action theo mẫu có sẵn) — chỉ cần giữ chỗ.

## §4. Bảng việc (R-FLOW-8)
<!-- [2026-11-03 11:40 PM Johnny Chu - Chu Hoàng Anh] FLOW — R-FLOW-8 bảng việc sinh từ main (chủ dự án chọn phương án D: trạng thái việc chỉ ở main; không bảng ngoài) -->

**Vấn đề.** 27 phase, 335 việc con nằm rải ở 27 checklist; `CLAIMS.md` ghi theo "đợt" và đường dẫn, không ghi mã việc, nên không biết việc `S###-n` nào đang có người giữ. Không có chỗ nhìn toàn dự án; dùng bảng ngoài (Trello, artifact) thì thành nguồn thứ hai (R-FLOW-7).

**Lựa chọn (chủ dự án duyệt 2026-11-03, phương án D).** Giữ nguồn ở `main`; sinh bảng từ nguồn. Đã loại: Trello (ngoài GitHub, CI và AI không đọc được, đồng bộ tay); GitHub Projects + Issues làm nguồn (mỗi việc ở hai nơi, cần bot ghi `main` để giữ R-FLOW-1).

**Hình dạng.**

1. `CLAIMS.md` thêm cột **Việc** (sau cột Đợt): danh sách mã `S###-n` dòng đó giữ, cách nhau dấu phẩy; `—` khi đợt chưa có dòng checklist (vd đợt tài liệu). Một mã chỉ nằm ở **một** dòng "đang làm" / "chờ merge". Mã phải có thật trong một `40-MASTER-CHECKLIST.md`.
2. Dòng việc trong checklist: `| S###-n | Việc | … | Trạng thái |`, ô cuối **bắt đầu bằng một ký hiệu**: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài · **⏸ hoãn (chủ để sau)** (ký hiệu mới, đã có trong PHASE-019). Dấu `|` trong nội dung ô viết `\|`.
3. Cột của bảng (mỗi việc đúng một cột):

| Cột | Điều kiện |
|---|---|
| Đang làm | mã nằm ở dòng CLAIMS "đang làm" |
| Chờ merge | mã nằm ở dòng CLAIMS "chờ merge" |
| Bị chặn | ⛔ (không có giữ chỗ) |
| Chưa ai nhận | ☐ (không có giữ chỗ) |
| Chờ đủ tín hiệu | 🟡 (không có giữ chỗ) |
| Hoãn | ⏸ |
| Xong | ✅ |

4. `node scripts/bang-viec.mjs --write` đọc 27 checklist + `CLAIMS.md`, ghi:
   - `docs/phases/BANG-VIEC.md`: tổng số theo cột, rồi từng cột nhóm theo phase (mã, việc rút gọn, ưu tiên, người giữ + nhánh, link tới dòng checklist);
   - `docs/phases/bang-viec.json` (`bizcity_task_board@1`): `{ contract, columns[], items: [{ id, phase, title, priority, status, column, claim: { who, branch, state, since } | null, file, line }] }`. **Không** ghi giờ sinh hay mã commit, để cùng nguồn luôn ra cùng tệp.
   - không có `--write`: in bảng ra màn hình, không ghi.
5. **Màn kanban chỉ đọc ở GitHub Pages** (chủ dự án quyết 2026-11-03) <!-- [2026-11-03 11:44 PM Johnny Chu - Chu Hoàng Anh] FLOW — chủ dự án quyết: màn kanban chỉ đọc đặt ở GitHub Pages; PR giữ chỗ không tự merge -->:
   - nguồn trang: `tools/bang-viec-web/` (HTML + JS tĩnh, không gói phụ thuộc, không gọi API nào ghi dữ liệu); đọc `bang-viec.json` của **chính commit** được dựng;
   - workflow `.github/workflows/bang-viec-pages.yml`: chạy khi đẩy vào `main` có đổi `docs/phases/**` hoặc `tools/bang-viec-web/**` (và chạy tay); quyền tối thiểu `contents: read`, `pages: write`, `id-token: write`; không dùng secret; action ghim theo SHA (R-SEC-8); dựng lại `bang-viec.json` bằng `scripts/bang-viec.mjs` và dừng nếu lệch tệp đã commit (cùng ý SC-FLOW-3);
   - trên trang: lọc theo phase, cột, người giữ, ưu tiên; mỗi thẻ có **Nhận việc** (mở `https://github.com/<repo>/edit/main/docs/phases/CLAIMS.md` để thành PR chỉ tài liệu), **Mở checklist** (tới đúng dòng trên GitHub); ghi rõ "chỉ đọc — đổi trạng thái bằng PR";
   - repo công khai nên trang công khai: chỉ hiện những gì đã có trong `docs/phases` (mã việc, tên việc, ưu tiên, tài khoản GitHub, nhánh), không thêm gì ngoài repo;
   - bật Pages (Settings → Pages → Source: GitHub Actions) là việc của chủ repo, một lần.

**Ảnh hưởng.** PR đổi trạng thái một việc (checklist hoặc CLAIMS) phải chạy lại `bang-viec.mjs --write` trong cùng PR (SC-FLOW-3 bắt khi quên, như `tru-cot-md.mjs`). Dòng CLAIMS cũ thêm cột Việc trong PR code đầu tiên. PR giữ chỗ **không** tự merge (chủ dự án quyết 2026-11-03, giữ mức chặt của R-FLOW): người duyệt merge tay sau khi SC-FLOW-1 xanh.

**Kiểm bằng.** SC-FLOW-1 mở rộng (cột Việc: mã có thật, không hai dòng cùng giữ); SC-FLOW-3 (bảng sinh khớp nguồn); SC-FLOW-4 (dòng checklist đúng khuôn, ô trạng thái bắt đầu bằng ký hiệu). Chi tiết ở [RULE-QUALITY-GATE](RULE-QUALITY-GATE.md).

## Ngoại lệ

Không cần giữ chỗ (R-FLOW-1) và không cần chữ chốt (R-FLOW-2), nhưng vẫn phải theo R-FLOW-5: sửa lỗi nhỏ (một tệp, không đổi hành vi dùng chung), tài liệu thuần, sửa nóng trên sản xuất.

## Giới hạn của phép kiểm

- `nhan-viec.mjs kiem` tin dòng giữ chỗ trên `main`; nó không biết người nhận có thật sự làm hay đã bỏ (chỉ cảnh báo dòng quá 3 ngày, R-FLOW-6).
- R-FLOW-2 chỉ thấy một tài liệu thuộc bảng §3 **đã được sửa trên `main` kể từ ngày giữ chỗ**; nó không đọc được tài liệu đó có chốt đúng điều cần chốt không. Phần đó vẫn là việc duyệt PR.
- Phép kiểm chạy ở máy người làm; khi chưa có CI thì không gì chặn ở `main`. Hai phiên giữ chỗ cùng một phút vẫn có thể va nhau — phép kiểm bắt ở lần đẩy đầu.

## Khi hai bên đã làm trùng

1. Giữ bản có **tài liệu và test**; nếu ngang nhau, giữ bản đã vào `main`.
2. Phần hay của bản còn lại được chuyển sang bản giữ, không bỏ.
3. Ghi trong mô tả PR: trùng với đâu, giữ bản nào, vì sao.
4. Hai bên khác nhau về **chính sách** (vd có giữ `writeAudit` hay không) thì dừng lại hỏi chủ dự án, rồi chốt bằng tài liệu (R-FLOW-2) — không tự chọn.

## Liên quan

[AGENTS.md — Bước 0](../../AGENTS.md) · `scripts/so-tiep-theo.mjs` (cùng ý, cho số migration / ADR) · [R-REV](RULE-REVIEW.md) (rà soát mỗi lần nhận việc) · [R-SIG](RULE-SIGNATURE.md) (dấu thay đổi).
<!-- [2026-11-03 10:35 PM Johnny Chu - Chu Hoàng Anh] FLOW — khớp luật với công cụ nhan-viec.mjs / SC-FLOW-1 -->
