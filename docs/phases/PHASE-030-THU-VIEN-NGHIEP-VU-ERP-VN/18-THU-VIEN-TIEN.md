# PHASE-030 · 18 — Thư viện tiền: `allocate`, `schedule`, `roundMoney` (chốt thiết kế)
<!-- [2026-11-06 02:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — chốt thiết kế dùng chung (R-FLOW §3) cho tiền: luật R-MONEY-1..6, API, mã tham chiếu đã chạy thử, bảng số golden T030-CORE-6, so sánh và cách chuyển các bản đang có, hướng dẫn dev; dòng CLAIMS S030-19 -->

> **Loại tài liệu:** PR chốt thiết kế cho thứ dùng chung ([R-FLOW §3](../../rules/RULE-FLOW.md)). Mã chỉ được viết **sau khi** PR này (kèm dòng CLAIMS S030-19) vào `main`.
> **Thuộc chuẩn:** STD-030-5 ([17](17-BO-CHUAN-STD-030.md)) · **Lý do:** [15 §0 #4](15-KINH-NGHIEM-COT-LOI.md) · **Bản mẫu chạy được:** [mockups/thu-vien-nghiep-vu.html#tien](mockups/thu-vien-nghiep-vu.html#tien)

## 0. Vì sao phải có đúng một bản

Hai module chia cùng một khoản ra hai con số khác nhau thì sổ chi tiết lệch sổ cái một vài đồng. Không ai bắt được lỗi này, vì mỗi module tự thấy mình đúng. Bằng chứng ở cả hai repo:

| Nơi | Cách chia / làm tròn | Lệch so với bản chuẩn |
|---|---|---|
| Erp-vn `lfood_voucher/models/tools.py:5` `allocate` | dư lớn nhất, đối xứng dấu, toàn 0 → chia đều | **là bản chuẩn** (8 module dùng) |
| Erp-vn `lfood_costing/models/calc.py:28` | dồn cả dư vào phần lớn nhất | khác khi có ≥ 2 phần có dư |
| Erp-vn `lfood_loan/models/loan_calc.py:22` | kỳ cuối nhận dư | là **lịch**, không phải chia (§2.2) |
| Erp-vn: 248 lời gọi `round()` | Python làm tròn **về chẵn**: 2,5 → 2 | lệch 1 đồng ở mọi số ,5 |
| open-ketoan `modules/mua-hang/domain/src/engine.ts:514` `allocate` | dư lớn nhất | tổng âm phân dư khác; toàn trọng số 0 → trả toàn 0 (**mất tổng**) |
| open-ketoan `apps/api/src/modules/assets/depreciation.ts:140` `splitByDays`, `:163` `splitByPercent` | làm tròn **từng phần**, phần cuối nhận còn lại (đơn vị xu, tròn 100) | phần cuối có thể lệch nhiều đồng so với tỷ lệ (ví dụ §4.3) |
| open-ketoan `packages/contracts/src/money.ts:29` `roundDong` = `Math.round` | nửa **lên** (về +∞) | −2,5 → −2 (không đối xứng với 2,5 → 3) |

`spreadOverMany` (`apps/api/src/phan-he/mua-hang/posting.ts:179`) **không** phải bản riêng: nó gọi `allocate` của mua hàng. Đính chính cho [15 §0 #4](15-KINH-NGHIEM-COT-LOI.md).

## 1. Luật R-MONEY (đề xuất Tier 0)

| Mã | Luật | Kiểm bằng |
|---|---|---|
| R-MONEY-1 | Tiền **ghi sổ** là số nguyên đồng (đã có ở contracts `money.ts`, R-DB `numeric(18,2)` giữ chỗ cho xu). Tính trung gian bằng số nguyên: đồng, hoặc xu qua `toCents`. Không cộng dồn số thực lặp | `SC-STD-5`; test |
| R-MONEY-2 | Làm tròn tiền **chỉ** bằng `roundMoney(x, unit)`: nửa xa số 0, bước `unit` (1 / 100 / 1.000) ghi rõ ở chỗ gọi. Không `Math.round`, `toFixed`, `Math.floor` trên đại lượng tiền trong `modules/**` | `SC-STD-5` |
| R-MONEY-3 | Chia **một** số tiền thành nhiều phần theo tỷ trọng **chỉ** bằng `allocate`. Bất biến: Σ phần = tổng, tuyệt đối | `SC-STD-5`; golden T030-CORE-6 |
| R-MONEY-4 | Rải một số tiền thành **lịch theo kỳ** (khấu hao, CCDC, trả trước, trả góp) **chỉ** bằng `schedule`. Bất biến: Σ kỳ = tổng; đúng số kỳ (+1 khi kỳ đầu lẻ ngày) | golden T030-TS-1, T030-CORE-6 |
| R-MONEY-5 | Tất định: cùng đầu vào → cùng kết quả; hoà phần dư → **dòng đứng trước** nhận. Thứ tự dòng là thứ tự nghiệp vụ (dòng chứng từ, `line_key`), không sắp lại trước khi chia | test bảng §4 |
| R-MONEY-6 | Đầu vào sai thì **ném lỗi**, không đoán: tổng không nguyên, trọng số âm / không hữu hạn, không có dòng mà tổng ≠ 0. Module chuyển lỗi thành `VALIDATION_ERROR` với finding | test |

## 2. API

Đặt ở `packages/contracts/src/money.ts` (cạnh `toCents`, `sumMoney`), xuất lại ở `@bizcity/module-sdk` (`packages/module-sdk/src/index.ts:44`, thêm ba tên). Kernel dùng được trực tiếp (giá vốn, phân bổ công nợ đã có `allocateDebt` là việc khác — đối trừ chứng từ, không phải chia tiền).

### 2.1 `roundMoney(amount, unit = 1): number`

Làm tròn nửa xa số 0 về bội số của `unit`: `roundMoney(2.5) = 3`, `roundMoney(-2.5) = -3`, `roundMoney(1_234_567, 1000) = 1_235_000`.

### 2.2 `allocate(total, weights, { unit = 1 } = {}): number[]`

Chia `total` (số nguyên) theo `weights` (≥ 0), bước `unit`:

1. Đổi ra số bước: `units = ⌊|total| / unit⌋`, phần lẻ dưới bước `tail = |total| − units·unit`.
2. Phần nguyên mỗi dòng `⌊units·wᵢ / Σw⌋`; phần dư `units − Σ phần nguyên` chia **mỗi dòng +1 bước** theo phần lẻ lớn → nhỏ, hoà thì dòng trước.
3. `tail` cộng vào dòng đầu tiên trong thứ tự nhận dư.
4. Áp lại dấu của `total` (đối xứng: chia −100 là đảo dấu của chia 100).
5. Trọng số toàn 0 → coi như bằng nhau. Dòng trọng số 0 nhận 0 khi còn dòng dương.

Dùng cho: phân bổ phí mua / vận chuyển theo giá trị hoặc lượng, chiết khấu tổng đơn xuống dòng, chia chi phí theo chi nhánh / bộ phận / tỷ lệ %, rải ngân sách theo tháng có trọng số, chia khấu hao một tháng cho các chi nhánh theo số ngày dùng.

### 2.3 `schedule(total, periods, { firstDays?, daysInFirstMonth?, unit = 1 } = {}): number[]`

Lịch đều, kỳ cuối nhận phần còn lại (cách của TT45 cho khấu hao theo ngày, Erp-vn `lfood_asset/models/depr_tools.py:21`):

1. `monthly = roundMoney(total / periods, unit)`.
2. Kỳ đầu lẻ ngày (`firstDays < daysInFirstMonth`) = `roundMoney(monthly · firstDays / daysInFirstMonth, unit)`; khi đó lịch có `periods + 1` kỳ.
3. Các kỳ giữa = `monthly` (tối thiểu 1, không quá phần còn lại); **kỳ cuối = phần còn lại**.

Khác Erp-vn ở một chỗ: Erp-vn chạy vòng `while remaining > 0`, nên `100 / 3 kỳ` ra **4 kỳ** (33, 33, 33, 1). Ở đây kỳ thứ `periods` (hoặc `periods + 1`) nhận đủ phần còn lại: ra 33, 33, 34.

Tại sao không gộp vào `allocate`? Hai việc có nghĩa nghiệp vụ khác nhau. `allocate` chia theo **tỷ lệ**: dư rơi vào dòng có phần lẻ lớn nhất. `schedule` làm lịch **đều**: các kỳ bằng nhau, chênh dồn kỳ cuối, đúng cách kế toán trình bày khấu hao. Một hàm hai chế độ thì dev chọn nhầm chế độ, chính là lỗi đang thấy ở tài sản (§4.3).

## 3. Mã tham chiếu (đã chạy thử)

Đã chạy với Node trên mọi ca ở §4, cộng 20.000 ca ngẫu nhiên (1–8 dòng, có trọng số 0, tổng âm / dương tới 10¹², bước 1 / 100 / 1.000): Σ = tổng ở mọi ca. Khi code, chép nguyên văn rồi thêm kiểu.

```ts
// packages/contracts/src/money.ts — thêm vào sau moneyEquals
/** Làm tròn nửa xa số 0 về bội số của `unit` (R-MONEY-2). */
export function roundMoney(amount: number, unit = 1): number {
  const r = Math.floor(Math.abs(amount) / unit + 0.5) * unit;
  return amount < 0 ? -r : r;
}

/** Chia `total` theo tỷ trọng, dư lớn nhất, Σ = total tuyệt đối (R-MONEY-3). */
export function allocate(total: number, weights: readonly number[], opts: { unit?: number } = {}): number[] {
  const unit = opts.unit ?? 1;
  if (!Number.isSafeInteger(total)) throw new RangeError('allocate: total phải là số nguyên');
  if (!Number.isSafeInteger(unit) || unit < 1) throw new RangeError('allocate: unit phải là số nguyên ≥ 1');
  if (weights.length === 0) { if (total !== 0) throw new RangeError('allocate: không có dòng để chia'); return []; }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new RangeError('allocate: trọng số phải ≥ 0');
  const w = weights.every((x) => x === 0) ? weights.map(() => 1) : weights;
  const W = w.reduce((s, x) => s + x, 0);
  const abs = Math.abs(total), units = Math.floor(abs / unit), tail = abs - units * unit;
  const raw = w.map((x) => (units * x) / W);
  const out = raw.map(Math.floor);
  const order = w.map((_, i) => i).filter((i) => w[i]! > 0)
    .sort((i, j) => (raw[j]! - out[j]!) - (raw[i]! - out[i]!) || i - j);
  for (let k = 0, rest = units - out.reduce((s, x) => s + x, 0); rest > 0; k++, rest--) out[order[k % order.length]!]! += 1;
  const res = out.map((x) => x * unit);
  res[order[0]!]! += tail;
  return res.map((x) => (total < 0 ? -x : x) + 0);
}

/** Lịch đều theo kỳ, kỳ đầu lẻ ngày, kỳ cuối nhận phần còn lại (R-MONEY-4). */
export function schedule(total: number, periods: number,
  opts: { firstDays?: number; daysInFirstMonth?: number; unit?: number } = {}): number[] {
  const unit = opts.unit ?? 1;
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('schedule: total phải là số nguyên ≥ 0');
  if (!Number.isInteger(periods) || periods < 1) throw new RangeError('schedule: periods phải ≥ 1');
  const partial = opts.firstDays != null && opts.daysInFirstMonth != null && opts.firstDays < opts.daysInFirstMonth;
  const count = periods + (partial ? 1 : 0);
  const monthly = roundMoney(total / periods, unit);
  const out: number[] = [];
  let remaining = total;
  for (let i = 0; i < count && remaining > 0; i++) {
    let amount = i === 0 && partial ? roundMoney((monthly * opts.firstDays!) / opts.daysInFirstMonth!, unit) : monthly;
    amount = i === count - 1 ? remaining : Math.min(Math.max(amount, 1), remaining);
    out.push(amount);
    remaining -= amount;
  }
  return out;
}
```

Giới hạn ghi rõ: tính bằng `number` an toàn tới 2⁵³ (≈ 9 triệu tỷ đồng); `units · w` vượt mức đó thì phải chuyển sang `bigint` (chưa cần ở quy mô doanh nghiệp VN; test chặn bằng `Number.isSafeInteger`).

## 4. Bảng số — golden T030-CORE-6

Mỗi dòng là một `it` trong `packages/contracts/test/money.test.ts` (bảng) và trong `apps/api/test/golden/T030-CORE.test.ts`.

### 4.1 `allocate`

| # | Gọi | Kết quả | Σ |
|---|---|---|---|
| a | `allocate(100, [1,1,1])` | 34, 33, 33 | 100 |
| b | `allocate(1_000_000, [3,3,1])` | 428.572, 428.571, 142.857 | 1.000.000 |
| c | `allocate(-100, [1,1,1])` | −34, −33, −33 | −100 |
| d | `allocate(10_000_000, [1,1,1], { unit: 1000 })` | 3.334.000, 3.333.000, 3.333.000 | 10.000.000 |
| e | `allocate(10_000_500, [1,1,1], { unit: 1000 })` | 3.334.500, 3.333.000, 3.333.000 | 10.000.500 |
| f | `allocate(10, [0,0])` | 5, 5 | 10 |
| g | `allocate(5, [1,0,1])` | 3, 0, 2 | 5 |
| h | `allocate(10_000_000, [240e6,160e6,100e6])` (kịch bản mua hàng `kich-ban.ts:133`) | 4.800.000, 3.200.000, 2.000.000 | 10.000.000 |
| i | `allocate(200, [1,1,1])` | 67, 67, 66 | 200 |
| j | `allocate(100, [-1, 2])` | ném `RangeError` | — |

### 4.2 `schedule`

| # | Gọi | Kết quả |
|---|---|---|
| k | `schedule(1_000_000_000, 60, { firstDays: 15, daysInFirstMonth: 30 })` (T030-TS-1: 1 tỷ / 5 năm từ 16/09/2026) | 8.333.334, 16.666.667 × 59, 8.333.313 — 61 kỳ, Σ 1.000.000.000 |
| l | `schedule(120_000_000, 12)` | 10.000.000 × 12 |
| m | `schedule(100, 3)` | 33, 33, 34 |
| n | `schedule(200, 3)` | 67, 67, 66 |
| o | `schedule(1_000_000_000, 60, { firstDays: 1, daysInFirstMonth: 30 })` | 555.556, 16.666.667 × 59, 16.111.091 — 61 kỳ |

### 4.3 `roundMoney` và chỗ khác với bản cũ

| Ca | Bản mới | Bản cũ |
|---|---|---|
| `roundMoney(2.5)`, `roundMoney(-2.5)` | 3, −3 | `roundDong`: 3, **−2** · Python `round`: 2, −2 |
| `allocate(-100, [1,1,1])` | −34, −33, −33 | mua hàng `allocate`: −33, −33, −34 |
| `allocate(10, [0,0])` | 5, 5 | mua hàng `allocate`: 0, 0 (**Σ = 0 ≠ 10**) |
| chia 500 xu thành 3 phần đều, tròn 100 xu | `allocate(500, [1,1,1], { unit: 100 })` → 200, 200, 100 | `splitByPercent` → 200, 200, 100 (trùng) |
| chia 1.000 xu theo 45 / 45 / 10 % | `allocate(1000, [45,45,10], { unit: 100 })` → 500, 400, 100 | `splitByPercent` → 500, 500, **0** (phần 10 % mất trắng) |
| chia 1.000 xu theo 35 / 35 / 30 % | → 400, 300, 300 | → 400, 400, 200 |
| chia 200 xu theo 30 / 30 / 30 / 10 % | → 100, 100, 0, 0 | → 100, 100, 100, **−100** (phần **âm**) |
| chia 2.500 xu đều 4 phần | → 700, 600, 600, 600 | → 600, 600, 600, 700 (dư dồn cuối thay vì đầu — khác quy ước, không sai tổng) |

Hai dòng in đậm là lý do phải đổi. Làm tròn từng phần rồi để phần cuối nhận số còn lại thì phần cuối bị ăn mòn khi các phần trước cùng làm tròn lên, tới mức thành số âm: một chi nhánh nhận **chi phí khấu hao âm**. Số đã chạy bằng mã ở §3 và thân `splitByPercent` hiện tại (`depreciation.ts:163`, `toDong = Math.round(c / 100) * 100`).

## 5. Chuyển các bản đang có

| Bản | Việc | Đổi số? | Điều kiện |
|---|---|---|---|
| `modules/mua-hang/domain/src/engine.ts:514` `allocate` | thay thân hàm bằng `export { allocate } from '@ketoan/contracts'` (giữ tên để `posting.ts`, `reports.ts`, `kich-ban.ts` không đổi import) | chỉ với tổng âm hoặc trọng số toàn 0 | test mua hàng + `kich-ban` xanh; ghi CHANGELOG |
| `apps/api/src/modules/assets/depreciation.ts:140` `splitByDays`, `:163` `splitByPercent` | đổi lõi sang `allocate(totalCents, weights, { unit: 100 })`, giữ chữ ký hàm | có, khi làm tròn từng phần làm lệch (§4.3) | chỉ áp cho **kỳ chưa ghi sổ**; bút toán đã ghi không đổi (R-POST-8); test tài sản cập nhật số có giải thích |
| `apps/api/src/modules/assets/asset.service.ts:704` (phần trích bổ sung tròn trăm xu) | `roundMoney(x, 100)` | không với số dương | — |
| `packages/contracts/src/money.ts:29` `roundDong` | **giữ nguyên**, gắn `@deprecated` trỏ `roundMoney` | — | đổi hành vi `roundDong` là việc Kernel K-level riêng, sau khi chẩn đoán xác nhận không có số tiền ,5 âm trên sổ |
| `apps/api/src/phan-he/**` | không sửa (ADR-0024 đóng băng); ghi nợ N030-2 | — | sửa khi chuyển sang `modules/` |

## 6. Bộ tính đi kèm (bậc sau, không trong dòng CLAIMS này)

`prorateByDays(monthly, fromDay, toDay, daysInMonth)` (TS06 thanh lý giữa tháng, Erp-vn `prorate_until`), `progressive(amount, brackets)` (TNCN 5 bậc, dự phòng theo bậc), `workingDays(from, to, calendar)` (Erp-vn `holiday.py`). Thuộc K-030-10, mở dòng riêng khi module lương / tài sản cần.

## 7. Hướng dẫn cho dev

Sau khi PR mã vào `main`:

```bash
git pull origin main && npm ci
```

```ts
import { allocate, schedule, roundMoney } from '@bizcity/module-sdk';

// 1) Phân bổ phí vận chuyển 1.500.000 đ vào 3 dòng theo giá trị hàng
const fees = allocate(1_500_000, lines.map((l) => l.amount));         // Σ fees === 1_500_000

// 2) Chiết khấu tổng đơn 250.000 đ xuống các dòng, làm tròn nghìn
const disc = allocate(250_000, lines.map((l) => l.amount), { unit: 1000 });

// 3) Lịch phân bổ CCDC 36 tháng, bắt đầu 10/03 (tháng 3 có 31 ngày)
const plan = schedule(54_000_000, 36, { firstDays: 22, daysInFirstMonth: 31 });

// 4) Thuế, bảo hiểm: nhân tỷ lệ rồi làm tròn MỘT lần
const bhxh = roundMoney((salary * 8) / 100);
```

Ba điều không làm:
- không `Math.round(x)` trên tiền;
- không tự viết vòng "phần cuối nhận còn lại";
- không sắp lại dòng trước khi chia.

`bizcity module check` (SC-STD-5) sẽ chỉ ra đúng dòng nếu lỡ viết.

## 8. Dòng CLAIMS và điều kiện xong

- **Việc:** S030-19 · **Phạm vi:** `packages/contracts/src/money.ts`; `packages/contracts/test/money.test.ts`; `packages/module-sdk/src/index.ts` (một dòng xuất); `modules/mua-hang/domain/src/engine.ts` (thân `allocate`); `apps/api/src/modules/assets/depreciation.ts` (`splitByDays`, `splitByPercent`); `apps/api/test/golden/T030-CORE.test.ts`; `tests/conformance/checks/module/money.check.mjs` (SC-STD-5) · **Nhánh:** `feat/phase-030-thu-vien-tien`.
- **Xong khi:**
  - bảng §4 xanh, kèm 20.000 ca ngẫu nhiên Σ = tổng;
  - test mua hàng, tài sản xanh, số đổi có giải thích;
  - SC-STD-5 bắt được hai mẫu xấu trong `fixtures/repo-bad`;
  - `npm run typecheck` xanh, selfcheck ĐẠT;
  - CHANGELOG ghi "allocate / schedule / roundMoney vào contracts; roundDong deprecated".
