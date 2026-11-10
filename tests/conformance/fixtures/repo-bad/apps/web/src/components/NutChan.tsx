// [2026-11-10 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-22: fixture SC-UI-1 — nút mờ theo điều kiện không nói lý do (2 chỗ); đang lưu, có title, có BlockedHint thì không tính
declare const BlockedHint: (p: { blocked?: { why: string } | null; children: unknown }) => null;
export function NutChan({ busy, locked, rows }: { busy: boolean; locked: boolean; rows: number }) {
  return (
    <div>
      <button disabled={locked}>Lưu</button>
      <button className="btn" disabled={rows === 0} onClick={() => {}}>Xoá dòng chọn</button>
      <button disabled={busy}>Đang lưu…</button>
      <button disabled={locked} title="Kỳ đã khoá. Nhờ kế toán trưởng mở khoá">Ghi sổ</button>
      <BlockedHint blocked={locked ? { why: 'Kỳ đã khoá' } : null}>
        <button disabled={locked}>Duyệt</button>
      </BlockedHint>
    </div>
  );
}
