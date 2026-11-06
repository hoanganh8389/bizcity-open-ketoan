# ADR-0030 · Bản niêm phong của bằng chứng: tệp lưu trữ sinh từ bảng, sửa STD-EVD-4
<!-- [2026-11-06 07:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — ADR-0030: chủ dự án chọn phương án B ở Q030-5: bằng chứng ở CSDL vẫn là nơi ghi chính; mỗi ngày Platform xuất một tệp niêm phong + manifest chuỗi băm; ngoại lệ hẹp cho STD-EVD-4 / SC-EVD-1 -->

- Trạng thái: **Chấp nhận về nguyên tắc** (chủ dự án 2026-11-06: *"ok đồng ý"* với phương án B của Q030-5, [PHASE-030 · 21 §2.4](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/21-SO-CONG-VA-BANG-DIEU-HANH.md)). Hình dạng tệp và manifest ở §Quyết định là **chữ chốt** để viết mã (R-FLOW-2); mã đi PR riêng (S030-30).
- Nguồn: chủ dự án 2026-11-06 — *"mọi thứ cần có một nhật ký người dùng dạng filestore log để làm sổ cái của các gate, một trục xương sống liên quan đến nhật ký hành vi người dùng"*.
- Ngày: 2026-11-06 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 (luật, hợp đồng); thi hành ở Platform, không đụng Kernel.
- Luật / hợp đồng liên quan: [`bizcity_evidence@1`](../contracts/BIZCITY-EVIDENCE-v1.md) (sửa **STD-EVD-4**, thêm STD-EVD-9..10, §8), [RULE-SECURITY](../rules/RULE-SECURITY.md), R-ECP-CONS ([ADR-0028](ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md)), STD-EVD-2 / -5 / -8, R-OBS-1..9, [ADR-0029](ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md).

## Bối cảnh

Hợp đồng bằng chứng có luật **STD-EVD-4 (cấp 1): "Không ghi nhật ký nghiệp vụ ra tệp. Tệp chỉ cho log kỹ thuật (pino)"**, kiểm bằng `SC-EVD-1` (bắt `appendFile`, `createWriteStream`, và `writeFile` ở tệp nhắc `.jsonl`). Luật đúng với cách ghi tệp cũ: `phan-he/mua-hang/log.ts` ghi JSONL theo tháng, hàng đợi trong tiến trình, **không chuỗi băm**, mất đồng bộ khi chạy nhiều máy chủ, nên hợp đồng ghi nó là *"Bỏ"*.

Nhưng chủ dự án cần một thứ mà bảng CSDL không cho được, dù bảng đã chỉ-thêm và có chuỗi băm theo đơn vị (`audit_logs`, migration 0036):

| Mối lo | Bảng CSDL | Tệp niêm phong |
|---|---|---|
| Người có quyền cao trên CSDL sửa dòng rồi tính lại chuỗi, hoặc gỡ trigger (API chạy vai trò `ketoan` = superuser mặc định, [RULE-SECURITY](../rules/RULE-SECURITY.md) §3) | không tự phát hiện được | so băm cuối của manifest với CSDL → lộ ngay |
| Sao lưu và kiểm toán độc lập, ngoài CSDL | phải có quyền vào CSDL | đưa cho kiểm toán viên một thư mục, kiểm bằng một lệnh |
| Lưu trữ lâu (≥ 10 năm, STD-EVD-8) trên kho rẻ / WORM | phân vùng và sao lưu CSDL đắt | tệp nén được, đẩy được lên kho ngoài |
| "Sổ cái của các cổng" cầm được trong tay | chỉ có trong CSDL | một tệp mỗi ngày |

Vì vậy cần một **ngoại lệ hẹp**, không xoá luật.

## Quyết định

| Mã | Quyết định |
|---|---|
| **D-SEAL-1** | **Một nơi ghi, một nơi sự thật (LEAN-3).** Bảng bằng chứng (`audit_logs`) là nơi **duy nhất** nhận ghi. Tệp **không bao giờ** là đường ghi: không module, không action, không đường yêu cầu nào ghi tệp. Tệp chỉ sinh ra **từ** bảng, sau khi ngày đã đóng. |
| **D-SEAL-2** | **Ngoại lệ của STD-EVD-4 chỉ gồm đúng một việc:** *"Không ghi nhật ký nghiệp vụ ra tệp, **trừ bản niêm phong do tác vụ `evidence.seal` của Platform xuất từ bảng bằng chứng**."* Mã thực hiện nằm trong **đúng một tệp** `packages/platform/src/core/evidence-export.ts`. `SC-EVD-1` miễn đúng tệp đó (danh sách trắng theo đường dẫn, như chỗ hẹn giờ được phép ở `core/events.ts`); mọi nơi khác vẫn bị chặn. |
| **D-SEAL-3** | **Tác vụ `evidence.seal`.** Subscriber của đồng hồ hằng ngày (`bizcity.clock.daily`, `core/events.ts`), chạy sau 00:30 giờ Việt Nam. Với mỗi đơn vị, chốt ngày `D−1` (theo UTC+7) nếu chưa chốt: lấy các dòng `audit_logs` của ngày đó theo `chain_seq`, ghi tệp. Khoá `pg_advisory_xact_lock` theo (đơn vị, ngày) để chỉ một tiến trình ghi. Chạy lại an toàn: ngày đã niêm phong thì **kiểm lại** (băm tệp = băm trong manifest), không ghi lại. |
| **D-SEAL-4** | **Vị trí và cách ghi.** `DATA_DIR/bang-chung/<đơn vị>/<yyyy>/<mm>/<dd>.jsonl` và `<dd>.manifest.json` (cùng gốc `DATA_DIR` với đính kèm, ngoài thư mục web, quyền `0640`). Ghi **một lần**: tệp tạm cùng thư mục, `fsync`, mở bằng cờ loại trừ (`wx`), `rename` nguyên tử; có sẵn tệp thì **không bao giờ ghi đè**, chỉ so sánh. Ngày không có dòng nào vẫn có manifest `rows: 0` để chuỗi liên tục. |
| **D-SEAL-5** | **Dòng tệp (JSONL, một dòng một bản ghi bằng chứng) phải tự kiểm được không cần CSDL.** Mang **đúng các đầu vào của hàm băm** `audit_log_hash` (migration 0036): `id`, `tenant_id`, `chain_seq`, `prev_hash`, thời điểm tạo **ở đúng dạng chuỗi mà hàm băm dùng** (`createdAtHash`, UTC, micro giây), `actor`, `actor_kind`, `actor_via`, `on_behalf_of`, `action`, `module_id`, `module_version`, `object_type`, `object_id`, `subject`, `request_id`, `correlation_id`, `idempotency_key`, `input_hash`, `result_ok`, `result_code`, `dry_run`, và `before_data` / `after_data` **dưới dạng chuỗi `jsonb::text` nguyên văn** (`beforeDataText`, `afterDataText`) — để bộ kiểm không phải tái tạo định dạng riêng của PostgreSQL. Kèm `hash` và `hashVersion`. Các cột **ngoài** băm (vd `trace_id`) cũng được ghi để đọc, nhưng toàn vẹn của chúng **không** được niêm phong; trường cá nhân đã là băm (STD-EVD-5), IP chỉ đoạn đầu. Cột mới của sổ cổng (`gates`, `source`, `basis_used`, [PHASE-030 · 21 §2.1](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/21-SO-CONG-VA-BANG-DIEU-HANH.md)) chỉ được niêm phong khi đưa vào băm bằng **`hashVersion` 2**, ghi `chain_seq` bắt đầu áp dụng (D-SEAL-11). |
| **D-SEAL-11** | **Phiên bản thuật toán băm.** `hashVersion: 1` = hàm `audit_log_hash` hiện hành. Đổi tập cột được băm (vd thêm `gates`) là `hashVersion` 2, áp từ một `chain_seq` ghi trong bảng cấu hình và trong manifest; dòng cũ giữ băm cũ, bộ kiểm chọn thuật toán theo `chain_seq`. Không bao giờ băm lại dòng cũ (STD-EVD-2). |
| **D-SEAL-6** | **Manifest (`bizcity_evidence_seal@1`).** `{ contract, tenant, date, firstSeq, lastSeq, rows, prevHashOfFirst, lastHash, fileSha256, prevManifestSha256, sealedAt, sealer: "platform", alg: "sha256", signature?: { alg, keyId, value } }`. **`prevManifestSha256` nối các ngày với nhau**: xoá hoặc thay một ngày làm gãy manifest của ngày sau. `signature` **tuỳ chọn** (HMAC-SHA256 hoặc Ed25519), khoá lấy từ biến môi trường, không bao giờ trong git (R-SEC). Không có khoá thì manifest vẫn có băm nối chuỗi. |
| **D-SEAL-7** | **Kiểm.** `GET /api/v1/evidence/verify?from=&to=` (quyền `conformance:run`, chỉ đọc, trả số đếm và mã, **không trả nội dung dòng**) và `bizcity evidence verify` (CLI). So ba chiều: (a) chuỗi băm trong CSDL, (b) từng tệp tự kiểm (D-SEAL-5), (c) manifest ↔ CSDL ↔ tệp (số dòng, `firstSeq` / `lastSeq`, băm cuối, `prevManifestSha256`). Mã: `EVIDENCE_SEAL_MISSING` (ngày đã đóng quá hạn chưa niêm phong), `EVIDENCE_SEAL_FILE` (tệp hỏng / thiếu / sai băm), `EVIDENCE_SEAL_DB` (CSDL lệch tệp), `EVIDENCE_SEAL_CHAIN` (manifest nối sai). Đều là chẩn đoán L3 chỉ đọc (R-DIAG). |
| **D-SEAL-8** | **Không chặn nghiệp vụ.** Niêm phong thuộc tầng **Eventual / Reconciliation** (R-ECP-CONS): thất bại không làm hỏng action, không giữ chứng từ; ghi một dòng pino mức `error` cùng số đếm, và `EVIDENCE_SEAL_MISSING` nhắc sau 2 ngày. Kết quả niêm phong **không bao giờ** được đọc ngược để quyết quyền hay quyết ghi sổ. |
| **D-SEAL-9** | **Hạn giữ và vận hành.** Tệp giữ ≥ 10 năm như bằng chứng (STD-EVD-8); ứng dụng **không xoá** tệp. Thư mục vào danh sách sao lưu (R-BAK). Đẩy lên kho ngoài (WORM, S3 object-lock…) là bộ chuyển `EvidenceSealSink` tuỳ chọn, **chưa trong v1**; bản v1 giả định một `DATA_DIR` chung như đính kèm. |
| **D-SEAL-10** | **Không phục vụ nội dung qua HTTP trong v1.** Kiểm toán viên nhận thư mục từ quản trị hệ thống; endpoint tải tệp, nếu cần, mở bằng ADR riêng (quyền, ghi nhật ký người tải, giới hạn). |

## Phương án đã loại

- **Tệp làm nơi ghi chính (phương án C).** Trái STD-EVD-4, mất khi nhiều máy chủ, không truy vấn được cho bàn điều hành HT11, khoá ghi theo tiến trình như `mua-hang/log.ts`.
- **Chỉ bảng CSDL (phương án A).** Khớp luật hiện hành nhưng không trả lời được mối lo "CSDL bị sửa bởi người có quyền cao" và không cho kiểm toán độc lập.
- **Ghi tệp song song lúc chạy action.** Hai nơi ghi là hai nguồn sự thật, và đưa việc ghi tệp (chậm, có thể lỗi) vào đường yêu cầu.

## Hệ quả

**Được:** kiểm độc lập với CSDL; chuỗi niêm phong theo ngày phát hiện được xoá / sửa; nền cho "sổ cổng cầm được" ([PHASE-030 · 21](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/21-SO-CONG-VA-BANG-DIEU-HANH.md)); không đổi đường ghi, không đổi Kernel.

**Mất / chi phí:** thêm một tác vụ nền và một thư mục cần sao lưu; thuật toán băm phải được công bố và giữ đồng bộ giữa hàm CSDL `audit_log_hash` và bản TypeScript (bắt buộc có test so khớp); một ngoại lệ cho `SC-EVD-1` (một tệp). Niêm phong chỉ bảo vệ **sau** ngày đóng: sửa CSDL trong ngày chưa niêm phong chưa bị lộ qua tệp (vẫn có chuỗi băm CSDL và EVIDENCE_CHAIN).

**Việc phải làm** (chủ: Platform; theo S030-30):

| Mã | Việc | Phụ thuộc |
|---|---|---|
| S030-30a | Hợp đồng `bizcity_evidence@1` 1.2.0-draft (STD-EVD-4 sửa, STD-EVD-9..10, §8) — **trong PR này** | — |
| S030-30b | Mã: `evidence-export.ts`, tác vụ `evidence.seal`, `evidence/verify` (API + CLI), bản TypeScript của `audit_log_hash` + test so khớp từng dòng với hàm CSDL (`hashVersion` 1) | — |
| S030-30d | `hashVersion` 2 (đưa `gates`, `source`, `basis_used` vào băm), áp cùng migration của S030-29 | S030-29 |
| S030-30c | `SC-EVD-1` miễn đúng một tệp; `SC-EVD-9` (không nơi nào khác ghi dưới `bang-chung`, manifest đúng khuôn); chẩn đoán `EVIDENCE_SEAL_*` | S030-30b |

Niêm phong v1 chạy được trên các cột hiện có (`hashVersion` 1). **Sổ cổng chỉ được niêm phong trọn vẹn sau khi S030-29 thêm `gates`, `source`, `basis_used` vào băm bằng `hashVersion` 2** (D-SEAL-11): migration đổi hàm băm DB và bản TypeScript đi trong **một** PR, kèm test so khớp hai bản.
