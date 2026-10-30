# Reflect 2026-10-30 · Chữ ký kiến trúc và dấu thay đổi theo phase
<!-- [2026-10-30 09:40 PM Johnny Chu - Chu Hoàng Anh] R-SIG — reflect chữ ký trên toàn bộ framework, ký bù theo từng phase, mở luật R-SIG + SC-SIG-1 / -2. -->

> **Yêu cầu của chủ dự án:** "đảm bảo bên open-ketoan cũng có rule về signature, nhất là signature ở toàn bộ framework, flow, architecture, infrastructure có Johnny Chu comment và các lần chỉnh sửa, update theo từng phase framework. Reflect và bổ sung."
> **Luật:** [RULE-SIGNATURE](../rules/RULE-SIGNATURE.md) (R-SIG-1…8), cùng quy ước R-STAMP của `bizcity-twin-ai`.

## 1. Trước reflect

- open-ketoan **không có** quy ước dấu thay đổi. Chữ ký tác giả chỉ có ở mức tài liệu:
  - [Bản công bố §0](../CONG-BO-KIEN-TRUC.md), [LICENSE](../../LICENSE), README, AGENTS.md.
- Mã và hạ tầng **không** cho biết ai chỉ đạo, phase nào đổi gì.
- Các hồ sơ phase có ghi chú `<!-- [2026-10-30] … -->` nhưng **thiếu giờ và thiếu người**: 45 dòng, sai khuôn.

## 2. Đã làm

| Việc | Kết quả |
|---|---|
| Luật | `docs/rules/RULE-SIGNATURE.md`: khuôn dấu, cú pháp theo loại tệp, R-SIG-1…8, danh sách tệp framework, ví dụ |
| Agent đọc luật | AGENTS.md (mục "Chữ ký và dấu thay đổi"), `.github/copilot-instructions.md` (mới — Copilot tự đọc), CONTRIBUTING, mẫu PR, CANON (R-SIG + §5), Bản công bố §5 |
| Bộ kiểm | **SC-SIG-1** (block): mọi tệp framework có ít nhất một dấu Johnny Chu - Chu Hoàng Anh. **SC-SIG-2** (block): dấu đúng khuôn, không tên agent / model ở chỗ người. Có ca tự kiểm. SC-CON-4 bỏ qua dòng dấu khi đọc "đầu tệp" hợp đồng |
| Công cụ | `scripts/ky-dau.mjs`: in dòng dấu đúng giờ Asia/Ho_Chi_Minh, đúng cú pháp chú thích; từ chối tên agent |
| Ký bù | **694 dấu trên 333 tệp framework**: một dòng cho mỗi commit của chủ dự án đã chạm tệp, **giờ = giờ commit thật** trong git |
| Sửa dấu cũ | 45 dòng `<!-- [2026-10-30] … -->` trong hồ sơ phase chuẩn hoá đúng khuôn. Giờ và mã lấy theo commit đã tạo dòng (`git blame`) |

### 2.1 Bảng commit → mã phase (dùng để ký bù)

| Commit | Giờ | Mã | Nội dung |
|---|---|---|---|
| `23a834c` | 2026-10-29 10:24 PM | INIT | khởi tạo Bizcity Core Framework |
| `792007e` · `1d96e41` · `627d2d8` · `474efce` · `b06e667` · `ccfc341` | 10-29 10:39 PM → 10-30 12:37 AM | PHASE-001 | chuẩn MCP / gói định khoản / Cell; luật phát hành, Kernel, bảo mật; bộ kiểm xanh; lộ trình máy đọc; migration đúng chuẩn, vai trò CSDL |
| `70a32eb` | 10-30 09:58 AM | PHASE-002 | nhãn lớp, đồ thị phụ thuộc, bản nháp API SDK |
| `6ef88ed` · `776e36c` · `a201a6a` · `a8a37ca` | 10:29 AM → 11:45 AM | PHASE-003 | tự chẩn đoán; runtime action; bằng chứng chuỗi băm; MCP |
| `93b3cfc` | 12:10 PM | ADR-0007 | mã lỗi, quan sát, giám sát, cài nhanh, kiến trúc, đóng góp |
| `03d35bf` · `fbd1c18` | 12:50 PM · 01:11 PM | CONG-BO | bản công bố kiến trúc; tuyên bố tối thượng, AP, ba lớp kiểm soát, ma trận tuân thủ |
| `d37d1df` · `0b190a9` | 01:17 PM · 01:22 PM | README · R-LICENSE | tuyên ngôn; GPL-2.0-or-later + nhãn hiệu |
| `363eb72` · `b761958` | 01:36 PM · 01:37 PM | AUDIT | thư mục phase, đánh giá kiến trúc |
| `2b6f034` | 07:06 PM | PHASE-004 | một cửa ghi sổ |
| `da2a85e` | 07:46 PM | PHASE-006 | transactional outbox |
| `ac602b1` | 08:00 PM | PHASE-009 | MCP ghi |
| `e66d623` | 08:42 PM | PHASE-008 | PITR |
| `00c964a` | 09:03 PM | PHASE-005 | chính sách kế toán có phiên bản |
| `864512e` | 09:23 PM | PHASE-007 | RLS |
| `484b746` | 09:36 PM | PHASE-010 | cổng công khai Kernel |

### 2.2 Phân bổ

| Nhóm tệp | Tệp đã ký |
|---|---|
| Mã Kernel / Platform (`apps/api/src`, lớp K / P) | 102 |
| Tài liệu kiến trúc, luật, hợp đồng, chuẩn, vận hành, phase, audit | 122 |
| Bộ kiểm chuẩn (`tests/conformance`) | 40 |
| Hợp đồng dùng chung (`packages/`) | 22 |
| Hạ tầng (`infrastructure/`, Docker, CI) | 20 |
| Công cụ (`scripts/`) | 14 |
| Migration chưa phát hành (`0034`–`0041`) | 8 |
| Tệp gốc (AGENTS, CONTRIBUTING, README, SECURITY, TRADEMARK) | 5 |

Theo mã (số tệp có dấu của mã đó):

| Mã | Tệp |
|---|---|
| INIT | 191 |
| PHASE-002 | 96 (nhãn lớp chạm mọi tệp mã) |
| PHASE-001 | 49 |
| AUDIT | 45 |
| ADR-0007 | 43 |
| PHASE-003 | 39 |
| CONG-BO | 36 |
| PHASE-006 | 34 |
| PHASE-004 | 29 |
| PHASE-005 | 26 |
| PHASE-009 | 17 |
| PHASE-007 | 16 |
| PHASE-010 | 15 |
| PHASE-008 | 12 |
| R-LICENSE | 4 |
| README | 1 |

## 3. Cố ý không ký

| Gì | Vì sao |
|---|---|
| 32 migration đã phát hành (`0001`–`0033`, khoá checksum) | R-SIG-6 / R-DB-14: không sửa một byte. Lịch sử của chúng ở migration mới và tài liệu |
| Commit của người đóng góp khác (`e2ada98`, `ffe02bc`, `494a600` — Nguyễn Văn Thủy) | Không ghi tên Johnny Chu lên việc người khác làm (R-SIG-7). Tệp vẫn có chữ ký kiến trúc từ các commit khác |
| Tệp `.json` (roadmap, compliance-matrix, bizcity-standard, dashboard Grafana) | Không có chú thích; dùng trường `updated` / `note` |
| Phân hệ / module nghiệp vụ, giao diện, hướng dẫn người dùng, dữ liệu mẫu | Không thuộc framework (RULE-SIGNATURE §3); vẫn nên có dấu thay đổi |

## 4. Rút ra

| # | Điều | Áp dụng từ nay |
|---|---|---|
| R1 | Ghi chú phase chỉ có ngày không trả lời được "ai, lúc nào" khi nhiều phiên làm cùng ngày | khuôn đủ ngày + giờ + người + mã; SC-SIG-2 chặn khuôn thiếu |
| R2 | Chú thích dấu làm lệch phép kiểm đọc "đầu tệp" (SC-CON-4) | phép kiểm đọc đầu tệp phải bỏ qua dòng dấu (`STAMP_RE` chung ở `tests/conformance/lib/framework-files.mjs`) |
| R3 | Dấu viết tay dễ sai giờ (lần này lỡ ghi 09:45 PM khi mới 09:39 PM — đã sửa) | dùng `scripts/ky-dau.mjs`, không gõ giờ tay |
| R4 | Ký bù bằng giờ commit giữ đúng lịch sử, không bịa thời điểm | ký bù chỉ theo git; thay đổi mới ký lúc làm |
