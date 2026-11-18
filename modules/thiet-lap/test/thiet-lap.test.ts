/** Logic thuần của hộp thoại Thiết lập nhanh (TI15): chọn khối, hàng hiện ở bước Nạp gì, trạng thái từng khối, kết quả lần chạy, MST. */
import { describe, expect, it } from 'vitest';
import { stepState } from '@bizcity/ui-kit';
import { activeRun, blocksParam, sampleCard, ownCompanyRows, runOutcome, stepLine, taxCodeError, tenantChanged, type SetupRun, type StepState } from '../web/lib/thiet-lap';

const step = (x: Partial<StepState>): StepState => ({ key: 'branches', label: 'Chi nhánh', total: 3, written: 0, skipped: 0, failed: 0, status: 'waiting', firstError: null, ...x });
const run = (x: Partial<SetupRun>): SetupRun => ({ id: '1', presetId: 'thuong-mai-ban-le', presetVersion: '1.0.0', status: 'done', firstRun: true, steps: [], error: null, startedAt: '', finishedAt: null, ...x });

describe('Thiết lập nhanh — chọn khối', () => {
  it('blocks gửi máy chủ: cấu hình luôn có, thứ tự cố định, không bao giờ có chứng từ mẫu', () => {
    expect(blocksParam([])).toBe('settings');
    expect(blocksParam(['products', 'branches'])).toBe('settings,branches,products');
    expect(blocksParam(['documents', 'partners'])).toBe('settings,partners');
  });

  it('bước Nạp gì của "công ty của tôi": cấu hình khoá, danh mục mẫu tick được, bỏ chứng từ mẫu', () => {
    const rows = ownCompanyRows(['settings', 'branches', 'partners', 'products', 'documents'].map((key) => ({ key, label: key, total: 1, existing: 0, toAdd: 1 })));
    expect(rows.map((r) => [r.key, r.locked])).toEqual([['settings', true], ['branches', false], ['partners', false], ['products', false]]);
  });
});

describe('Thiết lập nhanh — đang nạp', () => {
  it('trạng thái từng khối nói bằng lời', () => {
    expect(stepLine(step({}))).toEqual({ badge: 'badge-gray', text: 'chờ' });
    expect(stepLine(step({ status: 'running', written: 1, skipped: 1 }))).toEqual({ badge: 'badge-info', text: 'đang nạp 2/3' });
    expect(stepLine(step({ status: 'done', written: 2, skipped: 1 }))).toEqual({ badge: 'badge-ok', text: 'xong · ghi 2 · đã có 1' });
    expect(stepLine(step({ status: 'done', written: 2, failed: 1 })).badge).toBe('badge-bad');
  });

  it('kết quả lần chạy: lỗi một mục hay hỏng cả lần → cho Thử lại', () => {
    expect(runOutcome(null)).toBeNull();
    expect(runOutcome(run({ status: 'running' }))).toBe('running');
    expect(runOutcome(run({ steps: [step({ status: 'done', written: 3 })] }))).toBe('ok');
    expect(runOutcome(run({ steps: [step({ status: 'done', written: 2, failed: 1 })] }))).toBe('retry');
    expect(runOutcome(run({ status: 'failed' }))).toBe('retry');
  });

  it('mở lại giữa chừng: tìm lần chạy đang chạy', () => {
    expect(activeRun({ empty: true, kinds: [], canSetup: true, runs: [run({ id: '7', status: 'running' })] })?.id).toBe('7');
    expect(activeRun({ empty: false, kinds: [], canSetup: true, runs: [run({})] })).toBeNull();
  });

  it('thanh bước: trước là xong, hiện tại đang làm', () => {
    expect([0, 1, 2, 3].map((i) => stepState(i, 2))).toEqual(['xong', 'xong', 'on', 'cho']);
  });
});

describe('Thiết lập nhanh — công ty', () => {
  it('MST như máy chủ; chỉ lưu khi đổi', () => {
    expect(taxCodeError('')).toBeNull();
    expect(taxCodeError('0101234567')).toBeNull();
    expect(taxCodeError('0101234567-001')).toBeNull();
    expect(taxCodeError('12345')).toMatch('10 chữ số');
    const a = { name: 'Công ty A', taxCode: '', address: '', phone: '' };
    expect(tenantChanged(a, { ...a, name: ' Công ty A ' })).toBe(false);
    expect(tenantChanged(a, { ...a, phone: '0900' })).toBe(true);
  });
});

describe('Thiết lập nhanh — Công ty Mẫu (B5a)', () => {
  it('thẻ Xem công ty mẫu: mở khi bản cài có đơn vị mẫu và người dùng không ở trong đó', () => {
    const base = { empty: true, kinds: [], canSetup: true, runs: [] };
    expect(sampleCard({ ...base, sampleTenantCode: 'mau' })).toMatchObject({ open: true, code: 'mau' });
    expect(sampleCard({ ...base, sampleTenantCode: null }).open).toBe(false);
    expect(sampleCard({ ...base, isSample: true, sampleTenantCode: 'mau' }).open).toBe(false);
    expect(sampleCard(undefined).open).toBe(false);
    expect(sampleCard({ ...base, sampleTenantCode: null, sampleOnDemand: true })).toMatchObject({ open: false, create: true });
    expect(sampleCard({ ...base, sampleTenantCode: 'mau', sampleOnDemand: true }).create).toBe(false);
  });
});
