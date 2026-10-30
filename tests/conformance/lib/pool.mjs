// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * Chạy check song song trên worker_threads. Mỗi worker nhận một check, dựng ctx riêng, trả kết quả thuần JSON.
 * Một check treo quá `timeoutMs` → bị cắt, worker được thay mới, kết quả `error`.
 */
import { Worker } from 'node:worker_threads';

const WORKER = new URL('./worker.mjs', import.meta.url);

export async function runPool(tasks, { size, timeoutMs = 120_000 } = {}) {
  const results = new Array(tasks.length);
  let next = 0;

  async function lane() {
    let worker = new Worker(WORKER);
    try {
      while (next < tasks.length) {
        const i = next++;
        const r = await call(worker, tasks[i], timeoutMs);
        results[i] = r;
        if (r.crashed) { await worker.terminate().catch(() => {}); worker = new Worker(WORKER); }
      }
    } finally {
      await worker.terminate().catch(() => {});
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, tasks.length)) }, lane));
  return results;
}

function call(worker, task, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const done = (r) => { clearTimeout(timer); worker.off('message', onMessage); worker.off('error', onError); resolve(r); };
    const onMessage = (m) => done(m);
    const onError = (e) => done({ ok: false, crashed: true, error: String(e?.stack ?? e), ms: Date.now() - started });
    const timer = setTimeout(() => done({ ok: false, crashed: true, error: `quá ${timeoutMs} ms`, ms: timeoutMs }), timeoutMs);
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.postMessage(task);
  });
}
