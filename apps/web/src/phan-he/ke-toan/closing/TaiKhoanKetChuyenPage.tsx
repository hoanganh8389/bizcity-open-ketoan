// [2026-11-17 11:05 AM kiennt] ACC41A — màn Tài khoản kết chuyển: danh mục bút toán kết chuyển mẫu đứng riêng, ngay dưới Tài khoản ngầm định (đóng góp)
/**
 * TÀI KHOẢN KẾT CHUYỂN (ACC41A) — bộ bút toán kết chuyển mẫu mà Kết chuyển lãi / lỗ (ACC6) chạy theo, bố cục như danh mục
 * tài khoản kết chuyển của MISA: Thứ tự kết chuyển · Mã kết chuyển · Kết chuyển từ · Kết chuyển đến · Bên kết chuyển · Loại kết
 * chuyển · Diễn giải · Trạng thái · Chức năng. Mã, Loại suy từ TK đi / đến (hệ thống không lưu riêng); Kết chuyển số dư cuối ẩn sẵn.
 * Dữ liệu, kiểm tra, phiên bản: GET / PUT /api/v1/closing/rules (Kernel closing). Quyền sửa: thao tác "Sửa thứ tự / quy tắc
 * kết chuyển" của màn ACC6. Thêm / sửa dùng chung form với ACC6; thôi dùng một bước thì bỏ tích "Áp dụng".
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClosingRule } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useThaoTac } from '@/lib/manHinh';
import { PageHeader } from '@/components/PageHeader';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { CatalogueForm, LOAI_HINT, RuleHistory, type RulesData } from './ClosingPage';

/** Bên kết chuyển (cách gọi quen thuộc): debit = chuyển phát sinh Nợ, credit = chuyển phát sinh Có, balance = dư bên nào chuyển bên đó. */
const BEN: Record<ClosingRule['mode'], string> = { debit: 'Nợ', credit: 'Có', balance: 'Hai bên' };

type Row = { r: ClosingRule; index: number };
/** Loại kết chuyển (như MISA): đến 154 = gom chi phí sản xuất; còn lại = xác định kết quả kinh doanh. */
const loaiKetChuyen = (r: ClosingRule) => (r.toAccount.startsWith('154') ? 'Kết chuyển chi phí sản xuất' : 'Kết chuyển xác định kết quả kinh doanh');

export function TaiKhoanKetChuyenPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const tt = useThaoTac('ke-toan.ket-chuyen');
  const editable = can('settings:write') && Boolean(tt.cauHinh);
  const q = useQuery({ queryKey: ['closing-rules'], queryFn: () => api.get<RulesData>('/api/v1/closing/rules') });
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);
  const rules = q.data?.rules ?? [];
  const rows: Row[] = rules.map((r, index) => ({ r, index })).sort((a, b) => a.r.seq - b.r.seq || a.r.fromAccount.localeCompare(b.r.fromAccount));
  const save = useMutation({
    mutationFn: (v: { rules: ClosingRule[]; note: string }) => api.put('/api/v1/closing/rules', { rules: [...v.rules].sort((a, b) => a.seq - b.seq), note: v.note }),
    onSuccess: () => { for (const k of ['closing-rules', 'closing-rule-versions', 'closing-runs']) void qc.invalidateQueries({ queryKey: [k] }); },
  });
  // [2026-11-17 11:10 AM kiennt] ACC41A — cột theo màn Tài khoản kết chuyển của MISA; Mã / Loại kết chuyển suy từ TK đi / đến (đóng góp)
  const cols: Column<Row>[] = [
    { key: 'seq', header: 'Thứ tự kết chuyển', type: 'number', width: 130, showZero: true, title: 'Chạy từ nhỏ đến lớn; 911 → 421 luôn sau cùng', value: (x) => x.r.seq },
    { key: 'ma', header: 'Mã kết chuyển', type: 'code', width: 130, value: (x) => `${x.r.fromAccount}-${x.r.toAccount}` },
    { key: 'fromAccount', header: 'Kết chuyển từ', type: 'code', width: 120, title: 'Đầu số, gồm mọi tài khoản con', value: (x) => x.r.fromAccount },
    { key: 'toAccount', header: 'Kết chuyển đến', type: 'code', width: 120, title: 'Tài khoản chi tiết', value: (x) => x.r.toAccount },
    { key: 'mode', header: 'Bên kết chuyển', width: 120, value: (x) => BEN[x.r.mode], render: (x) => <span title={LOAI_HINT[x.r.mode]}>{BEN[x.r.mode]}</span> },
    { key: 'loai', header: 'Loại kết chuyển', width: 230, value: (x) => loaiKetChuyen(x.r) },
    { key: 'description', header: 'Diễn giải', width: 300, value: (x) => x.r.description },
    { key: 'includeOpening', header: 'Kết chuyển số dư cuối', type: 'check', width: 150, hidden: true, title: 'Cộng cả số dư đầu kỳ của tài khoản đi (bước 911 → 421)', value: (x) => x.r.includeOpening },
    { key: 'isActive', header: 'Trạng thái', width: 130, value: (x) => (x.r.isActive ? 'Đang sử dụng' : 'Ngừng sử dụng') },
    { key: 'sua', header: 'Chức năng', width: 90, noFilter: true, noSort: true, render: (x) => (editable ? <a href="#" onClick={(e) => { e.preventDefault(); setEditing({ index: x.index }); }}>Sửa</a> : null) },
  ];
  return (
    <>
      <PageHeader title="Tài khoản kết chuyển" code="ACC41A" subtitle="Các bước kết chuyển doanh thu, chi phí sang 911 và lãi lỗ sang 421 mà Kết chuyển lãi / lỗ (ACC6) chạy theo" helpKey="tai-khoan-ket-chuyen" />
      <div className="card">
        <CatalogToolbar
          phai canWrite={editable} hasSelection={false} busy={save.isPending}
          onAdd={() => setEditing({ index: null })} onRefresh={() => q.refetch()} onExport={() => exportRef.current?.()}
          extra={<button className="btn btn-sm btn-ghost" onClick={() => setShowHistory((x) => !x)}>{showHistory ? 'Ẩn lịch sử phiên bản' : 'Lịch sử phiên bản'}</button>}
        />
        {q.data?.errors.length ? <div className="alert alert-bad" style={{ marginBottom: 6 }}>Bút toán kết chuyển mẫu có lỗi, chưa kết chuyển được:<ul style={{ margin: '4px 0 0 18px' }}>{q.data.errors.map((e) => <li key={e}>{e}</li>)}</ul></div> : null}
        {q.data?.warnings.length ? <div className="alert alert-warn" style={{ marginBottom: 6 }}><ul style={{ margin: '0 0 0 18px' }}>{q.data.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div> : null}
        <ErrorBox error={q.error ? errorText(q.error) : save.error && !editing ? errorText(save.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="acc41a-tk-ket-chuyen" exportName="Tài khoản kết chuyển" exportRef={exportRef}
            rows={rows} rowKey={(x) => String(x.index)} onRowDoubleClick={(x) => editable && setEditing({ index: x.index })}
            rowClassName={(x) => (x.r.isActive ? '' : 'muted')} footerLabel={false} columns={cols}
          />
        )}
        {showHistory && <div style={{ paddingTop: 12 }}><RuleHistory /></div>}
      </div>
      {editing && (
        <CatalogueForm
          rules={rules} index={editing.index} saving={save.isPending} error={save.error ? errorText(save.error) : null}
          onClose={() => { setEditing(null); save.reset(); }}
          onSave={(next, note) => save.mutate({ rules: next, note }, { onSuccess: () => setEditing(null) })}
        />
      )}
    </>
  );
}
