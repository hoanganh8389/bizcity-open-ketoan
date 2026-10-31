/**
 * documents.workflow (bizcity_document@1 §5, R-WF-1…7, PHASES 3.5; PHASE-012 S012-1): máy trạng thái khai báo bằng YAML.
 * Kiểm: mọi tệp *.workflow.yaml trong src đúng khuôn + đúng nghĩa; runtime quyết định chuyển (cấp duyệt, quyền theo trạng thái,
 * tách nhiệm, chỉ người lập, lý do, thông báo chặn); mỗi chuyển của hai luồng đã chuyển có action / route (STD-DOC-3).
 * Hành vi đầy đủ của hai luồng: payment-requests.test.ts, mua-hang*.test.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Permission } from '../src/core/auth.js';
import { parseWorkflow, STATUS_GROUPS, type WorkflowActor } from '../src/core/workflow.js';
import { paymentRequestActions, paymentRequestWorkflow } from '../src/phan-he/quy/payment-requests/payment-request.routes.js';
import { purchaseWorkflow } from '../src/phan-he/mua-hang/service.js';
import { buildApp } from '../src/app.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.workflow.yaml'));
const actor = (id: string, ...perms: Permission[]): WorkflowActor => ({ id, can: (p) => perms.includes(p) });
const code = (fn: () => unknown) => { try { fn(); return 'OK'; } catch (e) { return (e as { code?: string }).code ?? (e as Error).message; } };

const BASE = `
type: thu.phieu
label: Phiếu thử
states:
  draft:    { group: draft, label: Nháp }
  waiting:  { group: pending, label: Chờ duyệt }
  level1:   { group: pending, label: Đã duyệt cấp 1 }
  ok:       { group: approved, label: Đã duyệt }
  void:     { group: cancelled, label: Đã huỷ }
transitions:
  submit: { title: Gửi duyệt, from: [draft], to: waiting, permission: documents:write, owner: documents:edit-all }
  approve:
    title: Duyệt
    levels:
      - { from: waiting, to: level1, permission: payments:approve }
      - { from: level1, to: ok, permission: payments:approve-final, denied: Cần người duyệt cấp 2 }
  sign: { title: Ký, from: [waiting], to: ok, permission: payments:approve, sod: true }
  reject: { title: Từ chối, from: [waiting, level1], to: draft, permission: { waiting: payments:approve, level1: payments:approve-final }, requires: [reason] }
  cancel: { title: Huỷ, from: [draft, waiting], to: void, permission: documents:write, ledger: true, blocked: { ok: 'Đã duyệt: rút duyệt trước' } }
`;

describe('documents.workflow — tệp khai báo', () => {
  it('mọi *.workflow.yaml trong src đúng khuôn, đúng nghĩa; trạng thái thuộc 5 nhóm chuẩn (STD-DOC-4)', () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      const wf = parseWorkflow(readFileSync(path.join(SRC, f), 'utf8'), f);
      for (const st of Object.values(wf.spec.states)) expect(STATUS_GROUPS).toContain(st.group);
      expect(wf.statesIn('draft').length).toBeGreaterThan(0);
    }
  });

  it('nhãn, tên chuyển tuỳ chọn (như ví dụ bizcity_document@1 §5)', () => {
    const wf = parseWorkflow('type: thu.toi-gian\nstates:\n  draft: { group: draft }\n  sent: { group: pending }\ntransitions:\n  send: { from: [draft], to: sent, permission: documents:write }\n', 'x');
    expect(wf.label('sent')).toBe('sent');
    expect(wf.spec.transitions.send!.title).toBe('send');
    expect(wf.plan('send', { status: 'draft' }, actor('user:1', 'documents:write')).to).toBe('sent');
  });

  it('khai sai bị từ chối, nêu đủ chỗ sai', () => {
    const bad = (patch: string) => code(() => parseWorkflow(BASE.replace(/transitions:[\s\S]*/, `transitions:\n${patch}`), 'thu.yaml'));
    expect(code(() => parseWorkflow(BASE.replace('group: pending, label: Chờ duyệt', 'group: review, label: Chờ duyệt'), 'x'))).toMatch(/states\.waiting\.group/);
    expect(bad('  go: { title: Đi, from: [draft], to: nowhere, permission: documents:write }')).toMatch(/"nowhere" chưa khai/);
    expect(bad('  go: { title: Đi, from: [draft], to: ok, permission: documents:fly }')).toMatch(/permission/);
    expect(bad('  go: { title: Đi, from: [draft], to: waiting, permission: documents:write, ledger: true }')).toMatch(/R-WF-3/);
    expect(bad('  go: { title: Đi, from: [draft, waiting], to: ok, permission: { draft: documents:write } }')).toMatch(/thiếu quyền cho trạng thái nguồn "waiting"/);
    expect(bad('  go:\n    title: Đi\n    levels:\n      - { from: waiting, to: level1, permission: payments:approve }\n      - { from: waiting, to: ok, permission: payments:approve }')).toMatch(/levels\[1\]\.from phải là "level1"/);
    expect(bad('  go:\n    title: Đi\n    levels:\n      - { from: waiting, to: level1, permission: payments:approve }\n      - { from: level1, to: void, permission: payments:approve }')).toMatch(/cấp cuối/);
    expect(bad('  go: { title: Đi, from: [draft], to: ok, permission: documents:write, colour: red }')).toMatch(/colour|Unrecognized/);
  });
});

describe('documents.workflow — runtime quyết định chuyển', () => {
  const wf = parseWorkflow(BASE, 'thu.yaml');
  const doc = (status: string, levelsRequired = 1) => ({ status, createdBy: 'user:1', levelsRequired });

  it('duyệt nhiều cấp: số cấp chứng từ cần quyết định đích; cấp 2 cần quyền riêng', () => {
    const ktt = actor('user:2', 'payments:approve');
    expect(wf.plan('approve', doc('waiting', 1), ktt)).toMatchObject({ from: 'waiting', to: 'ok', level: 1, group: 'approved' });
    expect(wf.plan('approve', doc('waiting', 2), ktt)).toMatchObject({ to: 'level1', level: 1, group: 'pending' });
    expect(code(() => wf.plan('approve', doc('level1', 2), ktt))).toBe('FORBIDDEN');
    expect(wf.plan('approve', doc('level1', 2), actor('user:3', 'payments:approve-final'))).toMatchObject({ to: 'ok', level: 2 });
    expect(code(() => wf.plan('approve', doc('draft'), ktt))).toBe('CONFLICT');
  });

  it('quyền theo trạng thái nguồn, lý do bắt buộc, tách nhiệm, chỉ người lập, thông báo chặn riêng', () => {
    expect(code(() => wf.plan('reject', doc('level1', 2), actor('user:2', 'payments:approve'), { reason: 'x' }))).toBe('FORBIDDEN');
    expect(code(() => wf.plan('reject', doc('waiting'), actor('user:2', 'payments:approve'), { reason: '  ' }))).toBe('VALIDATION_ERROR');
    expect(wf.plan('reject', doc('waiting'), actor('user:2', 'payments:approve'), { reason: 'Thiếu hoá đơn' }).to).toBe('draft');
    expect(code(() => wf.plan('sign', doc('waiting'), actor('user:1', 'payments:approve')))).toBe('FORBIDDEN');
    expect(wf.plan('sign', doc('waiting'), actor('user:2', 'payments:approve')).to).toBe('ok');
    expect(code(() => wf.plan('submit', doc('draft'), actor('user:9', 'documents:write')))).toBe('FORBIDDEN');
    expect(wf.plan('submit', doc('draft'), actor('user:9', 'documents:write', 'documents:edit-all')).to).toBe('waiting');
    let msg = '';
    try { wf.plan('cancel', doc('ok'), actor('user:1', 'documents:write')); } catch (e) { msg = (e as Error).message; }
    expect(msg).toBe('Đã duyệt: rút duyệt trước');
    expect(wf.plan('cancel', doc('draft'), actor('user:1', 'documents:write')).ledger).toBe(true);
  });

  it('allowed: các chuyển người này làm được (giao diện hiện nút)', () => {
    expect(wf.allowed(doc('waiting', 2), actor('user:2', 'payments:approve', 'documents:write'))).toEqual(['approve', 'sign', 'reject', 'cancel']);
    expect(wf.allowed(doc('ok'), actor('user:2', 'documents:write'))).toEqual([]);
  });
});

describe('documents.workflow — hai luồng đã chuyển (PHASES 3.5)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('yêu cầu thanh toán: 7 trạng thái như cũ; mỗi chuyển là một action quy.payment-request.<chuyển>', () => {
    expect(paymentRequestWorkflow.labels()).toEqual({ draft: 'Nháp', submitted: 'Chờ duyệt', approved1: 'Đã duyệt cấp 1', approved: 'Đã duyệt', rejected: 'Bị từ chối', paid: 'Đã chi', cancelled: 'Đã huỷ' });
    expect(paymentRequestWorkflow.statesIn('pending')).toEqual(['submitted', 'approved1']);
    const ids = new Set(paymentRequestActions.map((a) => a.id));
    for (const verb of Object.keys(paymentRequestWorkflow.spec.transitions)) expect(ids, verb).toContain(`quy.payment-request.${verb}`);
  });

  it('chứng từ mua hàng: 4 trạng thái như cũ; mỗi chuyển có route POST /purchase/documents/:id/<chuyển>', () => {
    expect(Object.keys(purchaseWorkflow.spec.states)).toEqual(['draft', 'pending_approval', 'approved', 'cancelled']);
    for (const verb of Object.keys(purchaseWorkflow.spec.transitions)) {
      expect(app.hasRoute({ method: 'POST', url: `/api/v1/purchase/documents/:id/${verb}` }), verb).toBe(true);
    }
  });
});
