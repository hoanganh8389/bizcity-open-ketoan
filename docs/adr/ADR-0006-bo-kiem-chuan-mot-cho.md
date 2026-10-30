# ADR-0006 · Một bộ kiểm chuẩn duy nhất `tests/conformance/`
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

- Trạng thái: Chấp nhận
- Ngày: 2026-10-29 · Người quyết: chủ dự án
- Luật / hợp đồng liên quan: R-QG-1, R-QG-6, R-QG-8, CONFORMANCE (CONF-*), DIAGNOSTICS §2 và §4

## Bối cảnh

Hiện việc kiểm chuẩn nằm rải ở nhiều chỗ:

- `scripts/kiem-chuan.sh`: grep, nợ ghi trong các biến `DEBT_*`;
- `phan-he-ranh-gioi.test.ts`;
- kiểm schema chạy tay bằng ajv, kiểm liên kết chạy tay;
- diagnostics mới có trên giấy.

Mỗi chỗ trả kết quả theo một khuôn riêng, không có thang điểm chung. Không biết luật nào đã có kiểm, luật nào chưa. Module cộng đồng cần **một** lệnh để biết mình có cài được không (nguyên tắc P3).

## Quyết định

1. **Một chỗ.** Mọi kiểm hợp đồng, chuẩn và luật viết ở `tests/conformance/`, theo khuôn `bizcity_check@1` (`schema/check.schema.json`).
2. **Một lệnh, hai lane chạy song song:** `node tests/conformance/selfcheck.mjs`.
   - Lane **selfcheck**: kiểm tĩnh, chạy trên worker_threads, không cần CSDL, không cần `npm install`.
   - Lane **diagnostics**: chạy trên CSDL thật trong giao dịch `READ ONLY`, dùng cùng mã kiểm với `GET /system/diagnostics`.
3. **Một thư mục output riêng:** `tests/conformance/output/`, gồm `latest/`, `runs/` và `history.jsonl`, không đưa lên git. Khi kiểm một module, kết quả ghi vào `<module>/.bizcity/`.
4. **Bảng điểm `bizcity_scoreboard@1`.**
   - Ba điểm tách riêng: tuân chuẩn, sẵn sàng Standard v1, độ phủ luật.
   - Chia theo hợp đồng, theo cổng, theo phân hệ, và có xu hướng qua các lần chạy.
   - Điểm chỉ để theo dõi. Cổng ĐẠT / KHÔNG ĐẠT chỉ dựa vào `fail` / `error`.
5. **Baseline bánh cóc** thay cho các biến `DEBT_*`:
   - nợ đã biết không làm đỏ, nợ mới làm đỏ;
   - nợ đã hết phải dọn khỏi baseline (CI chạy `--strict`);
   - thêm nợ phải có người duyệt nhóm Lõi và `ref`.
6. **Bộ kiểm tự kiểm** (`--self-test`) trên fixtures cố ý sai và cố ý đúng. Check nào chưa có ca tự kiểm thì chưa được tin.
7. **Không sửa code ứng dụng** để có bộ kiểm. Các test vitest hiện có giữ nguyên, vì chúng chạy code thật. `scripts/kiem-chuan.sh` cũng giữ nguyên tới khi CI đã chạy bộ mới ổn một thời gian; sau đó nó chỉ còn là lệnh gọi `selfcheck.mjs --only SC-KERNEL,SC-QG`.

## Hệ quả

- **Được:**
  - một nơi trả lời câu "luật X được kiểm bằng gì";
  - module cộng đồng có lệnh `--module`, ra `check-report.json` gắn băm, đúng CONFORMANCE §3;
  - độ phủ luật đo được, đúng tinh thần "đo bằng test, không đo bằng tài liệu".
- **Mất:**
  - thêm một job CI (`.github/workflows/conformance.yml`);
  - kiểm SQL bằng cách đọc tệp chỉ gần đúng. Kiểm chính xác trên `pg_catalog` thuộc lane `runtime` ở Phase 4.
- **Việc tiếp:**
  - lane thứ ba `runtime` (CONF-RUN-1..17, CONF-UPG) ở Phase 4;
  - lệnh `bizcity module check` (packages/cli) gọi lại chính các check này;
  - `GET /system/diagnostics` dùng lại SQL trong `diagnostics/*.diag.mjs`.

## Phương án đã cân nhắc

- *Viết thành test vitest.* Cần `npm install`, cần CSDL ngay cả cho phần tĩnh, không chạy được trên thư mục module ngoài repo, và không có bảng điểm. Loại.
- *Mở rộng `kiem-chuan.sh`.* Bash + grep không kiểm được JSON Schema, manifest hay độ phủ luật, lại khó chạy trên Windows. Loại.
- *Dùng ajv / plugin eslint.* Thêm phụ thuộc cho một bộ kiểm lẽ ra phải chạy được trước `npm install`. Hoãn; có thể thay `lib/jsonschema.mjs` bằng ajv khi đã có `packages/cli`.
