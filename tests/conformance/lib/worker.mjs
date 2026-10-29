import { parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { createContext } from './context.mjs';
import { loadChecks } from './discover.mjs';

// Mỗi worker giữ ctx theo gốc để các check cùng gốc dùng chung cache tệp.
const contexts = new Map();

parentPort.on('message', async (task) => {
  const started = Date.now();
  try {
    const checks = await loadChecks(pathToFileURL(task.file).href);
    const check = checks.find((c) => c.id === task.id);
    if (!check) throw new Error(`không thấy check ${task.id} trong ${task.file}`);
    const k = `${task.root}|${task.core}|${task.mode}`;
    if (!contexts.has(k)) contexts.set(k, createContext({ root: task.root, core: task.core, mode: task.mode, args: task.args }));
    const result = await check.run(contexts.get(k));
    parentPort.postMessage({ ok: true, result, ms: Date.now() - started });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String(e?.stack ?? e), ms: Date.now() - started });
  }
});
