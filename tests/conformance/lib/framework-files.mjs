// [2026-10-30 09:40 PM Johnny Chu - Chu Hoàng Anh] R-SIG — danh sách tệp framework phải mang chữ ký kiến trúc (R-SIG-1, docs/rules/RULE-SIGNATURE.md §3).
/**
 * Tệp FRAMEWORK của open-ketoan (docs/rules/RULE-SIGNATURE.md §3): Kernel + Platform, hợp đồng dùng chung, migration chưa phát
 * hành, hạ tầng, công cụ framework, tài liệu kiến trúc / luật / hợp đồng / chuẩn / vận hành / phase, tệp gốc.
 * Không gồm: phân hệ / module nghiệp vụ (lớp D, A, M, U), giao diện, hướng dẫn người dùng, dữ liệu mẫu.
 * Dùng chung cho SC-SIG-1 / SC-SIG-2 và công cụ ký bù.
 */
import { expectedLayer } from './layers.mjs';

/** Dấu thay đổi đúng khuôn: [YYYY-MM-DD HH:MM AM/PM <người>] <MÃ> — <mô tả>. */
export const STAMP_RE = /\[(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2} (?:AM|PM)) ([^\]]+)\] (\S+) — (\S.*)/;
export const OWNER = 'Johnny Chu - Chu Hoàng Anh';
/** Tên công cụ / model không được đứng ở chỗ người (R-SIG-4). */
export const AGENT_RE = /\b(claude|copilot|codex|cursor|gpt|chatgpt|gemini|openai|anthropic|llm|ai agent)\b/i;

const DOCS = /^docs\/(CONG-BO-KIEN-TRUC\.md|00-CANON\.md|architecture\/.+\.md|(standard|contracts|rules|adr|ops|framework|audits)\/[^/]+\.md|phases\/.+\.md)$/;
const ROOT = new Set(['AGENTS.md', 'CONTRIBUTING.md', 'README.md', 'SECURITY.md', 'TRADEMARK.md', '.github/copilot-instructions.md']);

/** @param {string} file đường dẫn tương đối repo  @param {Set<string>} locked tên tệp migration đã phát hành */
export function isFrameworkFile(file, locked = new Set()) {
  if (/(^|\/)(fixtures|output|node_modules)\//.test(file)) return false;
  if (ROOT.has(file) || DOCS.test(file)) return true;
  if (file.startsWith('apps/api/src/')) {
    if (!/\.(ts|mjs)$/.test(file)) return false;
    const layer = expectedLayer(file)?.layer ?? '';
    return layer.split('+').some((l) => l === 'K' || l === 'P');
  }
  if (/^packages\/contracts\/src\/.+\.ts$/.test(file) || /^packages\/module-sdk\/.+\.(ts|md)$/.test(file)) return true;
  if (/^db\/migrations\/[^/]+\.sql$/.test(file)) return !locked.has(file.split('/').pop());
  if (file.startsWith('infrastructure/')) return !file.endsWith('.json');
  if (/^docker-compose[^/]*\.yml$/.test(file) || file.startsWith('docker/') || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)) return true;
  if (/^scripts\/[^/]+\.(sh|mjs)$/.test(file)) return true;
  if (/^tests\/conformance\/.+\.mjs$/.test(file)) return true;
  return false;
}

/** Các dấu trong một văn bản: [{ line, date, time, author, code, text }]. */
export function stampsIn(text) {
  const out = [];
  text.split(/\r?\n/).forEach((t, i) => {
    const m = STAMP_RE.exec(t);
    if (m) out.push({ line: i + 1, date: m[1], time: m[2], author: m[3].trim(), code: m[4], text: m[5] });
  });
  return out;
}
