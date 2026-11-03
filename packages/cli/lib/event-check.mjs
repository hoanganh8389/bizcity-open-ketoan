// [2026-11-03 02:15 PM Johnny Chu - Chu Hoàng Anh] G3-01 — `bizcity event check`: kiểm một chứng từ trước khi vào sổ bằng đúng hàm và API của cửa nạp
/**
 * KIỂM MỘT CHỨNG TỪ (skill validate-accounting-event). Mỗi lớp gọi nguồn thật, không viết lại luật:
 *
 *   L1  khuôn           ingestDocumentSchema (packages/contracts)               — không cần máy chủ, cần bản dựng
 *   L2  số học          totalsProblems → intakeFinding (cùng hàm cửa nạp)        — không cần máy chủ, cần bản dựng
 *   L1–L4 tiền kiểm     POST /api/v1/intake/preflight (danh mục thật của đơn vị) — cần --server + --key
 *   L5  định khoản thử  POST /api/v1/documents/submit?dryRun=1 → bút toán thật rồi huỷ
 *   nộp                 POST /api/v1/documents/submit (chỉ khi --submit và mọi lớp trước không FAIL)
 *
 * Kết quả mỗi lớp: PASS · FAIL · SKIP. SKIP luôn ghi lý do và lệnh để chạy được; không bao giờ đổi SKIP thành PASS.
 * verdict: FAIL nếu một lớp FAIL; PASS khi không lớp nào FAIL và L5 đã chạy (sổ đã dựng thử được); còn lại SKIP.
 * Lệnh không tính thuế, không chọn tài khoản, không sửa chứng từ: chỉ nói chứng từ có vào sổ được không và vì sao.
 */
import { loadContracts, loadTotals, BUILD_HINT } from './sources.mjs';
import { gateOf } from './gates.mjs';

const pass = (layer, title, detail = '') => ({ layer, title, status: 'PASS', detail });
const fail = (layer, title, detail = '') => ({ layer, title, status: 'FAIL', detail });
const skip = (layer, title, detail) => ({ layer, title, status: 'SKIP', detail });

const pathOf = (p) => p.reduce((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${k}` : String(k)), '') || null;

function normFinding(f, source) {
  return { code: f.code, level: f.severity ?? f.level ?? 'block', layer: f.layer ?? null, path: f.path ?? null, title: f.title ?? '',
    got: f.got, expected: f.expected, fix: f.fix ?? '', rule: f.ref ?? f.rule ?? null, source };
}

async function api(server, key, pathname, body, { fetchImpl, idempotencyKey } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Api-Key': key };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetchImpl(`${server.replace(/\/$/, '')}${pathname}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const apiError = (r) => {
  const e = r.json?.error;
  return e ? { code: e.code, message: e.message, details: e.details } : { code: `HTTP_${r.status}`, message: 'phản hồi không đúng khuôn { ok, data | error }' };
};

/**
 * @param {unknown} document chứng từ bizcity_ledger_intake@1
 * @param {{server?: string, key?: string, submit?: boolean, guard?: string, fetchImpl?: typeof fetch}} opts
 */
export async function checkEvent(document, { server, key, submit = false, fetchImpl = globalThis.fetch } = {}) {
  const rows = [];
  const findings = [];
  let entries = [];
  let guard;
  let parsed;
  let submitted = null;

  // [2026-11-03 05:40 PM Johnny Chu - Chu Hoàng Anh] G3-01 — cổng chờ (sản xuất): trả lời rõ cổng chưa mở, không chạy tiếp, không nộp
  const gate = gateOf(document?.docType);
  if (gate) {
    rows.push(skip('cổng', `Cổng ${gate.title}: đã giữ chỗ, Kernel chưa mở`, `docType ${document.docType} chưa thuộc hợp đồng. Hôm nay: ${gate.today} ${gate.forbid} Mở cổng: ${gate.skill}`));
    return { verdict: 'SKIP', rows, findings, entries, submitted, guard: null, gate: gate.id };
  }

  // ── L1 khuôn + L2 số học, không cần máy chủ ──
  const c = await loadContracts();
  if (!c.mod?.ingestDocumentSchema) {
    rows.push(skip('L1', 'Khuôn chứng từ (offline)', `${c.missing ?? 'bản dựng contracts thiếu ingestDocumentSchema'} — chạy: ${BUILD_HINT}`));
    rows.push(skip('L2', 'Tổng tiền khớp từng dòng (offline)', 'cần bản dựng contracts + kernel'));
  } else {
    const r = c.mod.ingestDocumentSchema.safeParse(document);
    if (r.success) {
      parsed = r.data;
      rows.push(pass('L1', 'Khuôn chứng từ (offline)', `docType ${parsed.docType}`));
    } else {
      for (const i of r.error.issues) findings.push({ code: 'IN-SHAPE', level: 'block', layer: 'L1', path: pathOf(i.path), title: i.message, fix: 'Sửa trường này ở hệ thống gửi; chạy kèm --server để có mã IN-SHAPE-00x chính xác', source: 'ingestDocumentSchema' });
      rows.push(fail('L1', 'Khuôn chứng từ (offline)', `${r.error.issues.length} trường sai`));
    }
    const t = await loadTotals();
    if (!parsed) rows.push(skip('L2', 'Tổng tiền khớp từng dòng (offline)', 'khuôn L1 chưa đạt'));
    else if (!t.fn) rows.push(skip('L2', 'Tổng tiền khớp từng dòng (offline)', `${t.missing} — chạy: ${BUILD_HINT}`));
    else {
      const probs = t.fn(parsed);
      for (const p of probs) findings.push(normFinding(c.mod.intakeFinding ? c.mod.intakeFinding(p.code, p.path, { got: p.message }) : { code: p.code, path: p.path, title: p.message }, 'totalsProblems'));
      rows.push(probs.length ? fail('L2', 'Tổng tiền khớp từng dòng (offline)', probs.map((p) => p.code).join(', ')) : pass('L2', 'Tổng tiền khớp từng dòng (offline)'));
    }
  }

  // ── L1–L4 tiền kiểm + L5 định khoản thử trên máy chủ ──
  if (!server || !key) {
    const why = 'chưa có --server và --key (khoá API màn HT02, phạm vi "Gửi chứng từ")';
    rows.push(skip('L1–L4', 'Tiền kiểm trên máy chủ: danh mục, phiên bản, hoá đơn trùng', why));
    rows.push(skip('L5', 'Định khoản thử (dryRun): bút toán thật rồi huỷ', why));
  } else if (typeof fetchImpl !== 'function') {
    rows.push(skip('L1–L4', 'Tiền kiểm trên máy chủ', 'Node không có fetch — cần Node ≥ 22'));
  } else {
    let blocked = false;
    try {
      const pf = await api(server, key, '/api/v1/intake/preflight', { document }, { fetchImpl });
      if (pf.json?.ok) {
        const fs = (pf.json.data.findings ?? []).map((f) => normFinding(f, 'POST /api/v1/intake/preflight'));
        findings.push(...fs);
        guard = pf.json.data.guard;
        blocked = fs.some((f) => f.level === 'block');
        const warn = fs.filter((f) => f.level === 'warn').length;
        rows.push(blocked
          ? fail('L1–L4', 'Tiền kiểm trên máy chủ', `điểm ${pf.json.data.score}/100 · ${fs.filter((f) => f.level === 'block').map((f) => f.code).join(', ')}`)
          : pass('L1–L4', 'Tiền kiểm trên máy chủ', `điểm ${pf.json.data.score}/100${warn ? ` · ${warn} cảnh báo cần kế toán xem` : ''}`));
      } else {
        const e = apiError(pf);
        findings.push({ code: e.code, level: 'block', layer: 'L1–L4', path: null, title: e.message, fix: '', source: 'POST /api/v1/intake/preflight' });
        rows.push(fail('L1–L4', 'Tiền kiểm trên máy chủ', `${e.code}: ${e.message}`));
        blocked = true;
      }

      if (blocked) rows.push(skip('L5', 'Định khoản thử (dryRun)', 'tiền kiểm còn lỗi chặn — sửa trước'));
      else {
        const dr = await api(server, key, '/api/v1/documents/submit?dryRun=1', { document, ...(guard ? { guard } : {}) }, { fetchImpl });
        if (dr.json?.ok) {
          entries = dr.json.data.entries ?? [];
          const debit = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
          const credit = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
          rows.push(pass('L5', 'Định khoản thử (dryRun): bút toán thật rồi huỷ', `${entries.length} dòng · Nợ ${debit} = Có ${credit} · trạng thái ${dr.json.data.status}`));
        } else {
          const e = apiError(dr);
          findings.push({ code: e.code, level: 'block', layer: 'L5', path: null, title: e.message, fix: '', source: 'POST /api/v1/documents/submit?dryRun=1' });
          rows.push(fail('L5', 'Định khoản thử (dryRun)', `${e.code}: ${e.message}`));
        }
      }
    } catch (err) {
      rows.push(skip('L1–L4', 'Tiền kiểm trên máy chủ', `không gọi được ${server}: ${err.message}`));
      rows.push(skip('L5', 'Định khoản thử (dryRun)', 'máy chủ không trả lời'));
    }
  }

  // ── Nộp thật ──
  const anyFail = rows.some((r) => r.status === 'FAIL');
  const l5 = rows.find((r) => r.layer === 'L5');
  if (submit) {
    if (anyFail || l5?.status !== 'PASS') rows.push(skip('nộp', 'Nộp vào sổ', 'chưa nộp: cần mọi lớp không FAIL và L5 PASS'));
    else {
      const d = /** @type {any} */ (document);
      const idem = `${String(d.docKey).slice(0, 110)}:v${d.version ?? 1}`.padEnd(8, '-');
      const sr = await api(server, key, '/api/v1/documents/submit', { document, ...(guard ? { guard } : {}) }, { fetchImpl, idempotencyKey: idem });
      if (sr.json?.ok) {
        submitted = { status: sr.json.data.status, entryIds: sr.json.data.entryIds ?? [], receipt: sr.json.meta?.receipt ?? null };
        entries = sr.json.data.entries ?? entries;
        rows.push(pass('nộp', 'Nộp vào sổ', `trạng thái ${submitted.status}${submitted.status === 'pending' ? ' (đơn vị đặt chế độ duyệt: chờ kế toán ở ACC14)' : ''}`));
      } else {
        const e = apiError(sr);
        findings.push({ code: e.code, level: 'block', layer: 'nộp', path: null, title: e.message, fix: '', source: 'POST /api/v1/documents/submit' });
        rows.push(fail('nộp', 'Nộp vào sổ', `${e.code}: ${e.message}`));
      }
    }
  }

  const verdict = rows.some((r) => r.status === 'FAIL') ? 'FAIL' : l5?.status === 'PASS' ? 'PASS' : 'SKIP';
  return { verdict, rows, findings, entries, submitted, guard: guard ?? null };
}

const money = (n) => (n ? Number(n).toLocaleString('vi-VN') : '');

export function formatCheck(r) {
  const L = [];
  const w = Math.max(...r.rows.map((x) => x.layer.length));
  L.push('Kiểm chứng từ trước khi vào sổ (bizcity_ledger_intake@1)');
  for (const x of r.rows) L.push(`  ${x.status.padEnd(4)}  ${x.layer.padEnd(w)}  ${x.title}${x.detail ? ` — ${x.detail}` : ''}`);
  if (r.findings.length) {
    L.push('', 'Phát hiện (giải thích từng mã: npx bizcity explain <MÃ>):');
    for (const f of r.findings) {
      L.push(`  ${f.level === 'block' ? '✘' : f.level === 'warn' ? '⚠' : 'ℹ'} ${f.code}${f.path ? ` @ ${f.path}` : ''} — ${f.title}${f.got !== undefined ? ` (gặp: ${typeof f.got === 'string' ? f.got : JSON.stringify(f.got)})` : ''}`);
      // [2026-11-03 04:15 PM Johnny Chu - Chu Hoàng Anh] G3-01 — chuẩn C6: mỗi lý do chưa đạt chỉ ra cách sửa và luật gốc
      if (f.fix) L.push(`      sửa: ${f.fix}`);
      if (f.rule) L.push(`      luật: ${f.rule}`);
    }
  }
  if (r.entries.length) {
    L.push('', 'Bút toán Kernel dựng (Nợ / Có do luật định khoản của đơn vị quyết, không do app):');
    for (const e of r.entries) L.push(`  ${e.accountCode.padEnd(8)} ${String(e.accountName ?? '').slice(0, 34).padEnd(34)} Nợ ${money(e.debit).padStart(12)}  Có ${money(e.credit).padStart(12)}`);
  }
  if (r.submitted?.receipt) L.push('', `Biên nhận: ${r.submitted.receipt.evidenceId ?? ''} ${r.submitted.receipt.hash ? String(r.submitted.receipt.hash).slice(0, 12) : ''}`);
  L.push('', `KẾT LUẬN: ${r.verdict}${r.verdict === 'SKIP' ? ' — chưa đủ bằng chứng; chạy lại với --server và --key để có L5' : ''}`);
  return L.join('\n');
}
