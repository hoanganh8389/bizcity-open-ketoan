// [2026-11-02 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: hiển thị phương án khắc phục có cấu trúc (bizcity_remedy@1) — bước ①②③ kèm nút mở màn, vai cần có, việc cấm, dải "dừng ghi sổ" cho lỗi Tier 0.
/**
 * RemedyView — một khuôn cho mọi nơi hiện cách khắc phục: dải cảnh báo ở phiếu / ACC14 / khoá kỳ, Kiểm chuẩn, Bàn đánh giá.
 * R-FIX-3: bước cần quyền mà người xem không có thì vẫn hiện, ghi "nhờ <vai>". Không có nút ghi sổ / tắt kiểm / bỏ qua (R-FIX-2).
 */
import { Link } from 'react-router-dom';
import { REMEDY_ROLE_LABELS, type Remedy } from '@ketoan/contracts';

export function RemedyView({ remedy, compact, onRecheck, rechecking }: { remedy: Remedy; compact?: boolean; onRecheck?: () => void; rechecking?: boolean }) {
  return (
    <div className={`rm${compact ? ' rm-compact' : ''}`}>
      {remedy.stopTheLine && <div className="rm-stop">Dừng ghi sổ · báo nhóm Lõi kèm mã tra cứu của lượt chẩn đoán</div>}
      <ol className="rm-steps">
        {remedy.steps.map((s, i) => (
          <li key={i}>
            <span className="rm-n">{i + 1}</span>
            <span className="rm-text">{s.text}</span>
            {s.screen && <Link className="btn btn-xs" to={s.screen.path}>Mở {s.screen.label} ({s.screen.code}) →</Link>}
            {s.role && s.role !== remedy.owner && <span className="rm-role">({REMEDY_ROLE_LABELS[s.role as keyof typeof REMEDY_ROLE_LABELS] ?? s.role})</span>}
          </li>
        ))}
        {(remedy.forbid ?? []).map((f) => <li key={f} className="rm-no"><span className="rm-n">✗</span><span className="rm-text">{f}</span></li>)}
      </ol>
      {!compact && (
        <div className="rm-meta">
          Ai làm: <b>{REMEDY_ROLE_LABELS[remedy.owner as keyof typeof REMEDY_ROLE_LABELS] ?? remedy.owner}</b>
          {' · '}Kiểm lại: {remedy.verify.code ? <code>{remedy.verify.code}</code> : null}
          {remedy.verify.screen ? <Link to={remedy.verify.screen.path}> {remedy.verify.screen.label}</Link> : null}
          {onRecheck && remedy.verify.code && <button type="button" className="btn btn-xs btn-primary" style={{ marginLeft: 8 }} disabled={rechecking} onClick={onRecheck}>{rechecking ? 'Đang kiểm…' : `Kiểm lại ${remedy.verify.code}`}</button>}
        </div>
      )}
    </div>
  );
}
