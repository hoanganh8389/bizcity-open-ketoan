// [2026-11-05 11:00 PM Nguyễn Văn Thủy] SDTC — kiểu xem sơ đồ của màn Sơ đồ tổ chức (DM16)
/**
 * Vẽ cây Công ty → Miền → Chi nhánh → Tỉnh dạng sơ đồ khối. Chỉ đọc, bấm một khối để chọn nút đó.
 * Số liệu lấy từ cây đang có, sửa cây ở kiểu xem danh sách.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { OrgNode } from '@/lib/orgUnits';

const LINE = '#111827';
const BRANCH_LINE = '#60a5fa';
const box: CSSProperties = { border: '1px solid #64748b', borderRadius: 4, padding: '6px 10px', textAlign: 'center', cursor: 'pointer', color: '#111827', background: '#fff', fontSize: 13, lineHeight: 1.3 };
const STYLE: Record<number, CSSProperties> = {
  0: { background: '#ffff00', borderRadius: 10, padding: '14px 44px', fontSize: 20, fontWeight: 700 },
  1: { background: '#ffe29a', borderRadius: 8, padding: '10px 22px', fontSize: 15, fontWeight: 700, color: '#0f2f6b' },
  2: { background: '#c6e0b4', fontWeight: 700, minWidth: 104 },
  3: { minWidth: 104 },
};

function Box({ n, selected, onSelect }: { n: OrgNode; selected: boolean; onSelect: (n: OrgNode) => void }) {
  const code = n.level > 0 ? <div style={{ color: '#ea580c', fontWeight: 600 }}>({n.code})</div> : null;
  return (
    <div role="button" tabIndex={0} title={`${n.path}\n${n.totalBranches} điểm kinh doanh · bấm để chọn nút này`}
      style={{ ...box, ...STYLE[n.level], opacity: n.isActive ? 1 : 0.5, outline: selected ? '2px solid #2563eb' : undefined }}
      onClick={() => onSelect(n)} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(n); }}>
      {n.name}{code}
    </div>
  );
}

/** Hàng các nhánh con, nối vào đường ngang chung. */
function Row({ count, children }: { count: number; children: (i: number) => ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ position: 'relative', padding: '16px 10px 0' }}>
          {count > 1 && <div style={{ position: 'absolute', top: 0, height: 2, background: LINE, left: i === 0 ? '50%' : 0, right: i === count - 1 ? '50%' : 0 }} />}
          <div style={{ position: 'absolute', top: 0, left: '50%', width: 2, height: 16, background: LINE, marginLeft: -1 }} />
          {children(i)}
        </div>
      ))}
    </div>
  );
}

const Stem = () => <div style={{ width: 2, height: 16, background: LINE, margin: '0 auto' }} />;

export function SoDoToChucChart({ root, kids, selected, onSelect }: { root: OrgNode; kids: Map<string, OrgNode[]>; selected: string | null; onSelect: (n: OrgNode) => void }) {
  const of = (n: OrgNode) => kids.get(n.code) ?? [];
  const regions = of(root);
  const node = (n: OrgNode) => <Box n={n} selected={selected === n.code} onSelect={onSelect} />;
  return (
    <div style={{ overflowX: 'auto', padding: '12px 12px 20px' }}>
      <div style={{ width: 'max-content', minWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>{node(root)}</div>
        {regions.length > 0 && <Stem />}
        <Row count={regions.length}>{(r) => {
          const region = regions[r]!;
          const branches = of(region);
          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'center' }}>{node(region)}</div>
              {branches.length > 0 && <Stem />}
              <Row count={branches.length}>{(b) => {
                const branch = branches[b]!;
                const provinces = of(branch);
                return (
                  <>
                    {node(branch)}
                    {provinces.length > 0 && (
                      <div style={{ borderLeft: `2px solid ${BRANCH_LINE}`, marginLeft: 12, marginTop: 6, paddingTop: 2, display: 'grid', gap: 8 }}>
                        {provinces.map((p) => (
                          <div key={p.code} style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: 16, height: 2, background: BRANCH_LINE }} />
                            <div style={{ flex: 1 }}>{node(p)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              }}</Row>
            </>
          );
        }}</Row>
      </div>
    </div>
  );
}
