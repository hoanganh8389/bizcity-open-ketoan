/**
 * GET /api/v1/m/pos/reports/channels?from&to&branchCodes — báo cáo "Bán hàng theo kênh" (phiếu NT-BH-031): kênh × cửa hàng × khoảng ngày —
 * số đơn, doanh thu (tiền khách phải trả sau khuyến mại, gồm thuế), khuyến mại (tiền giảm, tham khảo), trả hàng, thực thu = doanh thu − trả
 * hàng; tổng online / offline. Gộp đơn máy bán (bảng của module) + phiếu bán BH10 (module phieu-ban gửi số liệu qua action đọc
 * `phieu-ban.channel.summary` — không đọc bảng của module khác). Module phieu-ban chưa bật / người xem thiếu quyền phieu-ban:read → chỉ đơn
 * máy bán, meta.phieuBan = 'unavailable'. Màn xuất Excel từ bảng (DataGrid).
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: báo cáo bán hàng theo kênh (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { branchList } from '../admin.js';
import { listChannels, posChannelFacts } from '../channels.js';
import { channelReport, type ChannelFact } from '../domain/channels.js';
import { todayVn } from '../read.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.report.channels', title: 'Bán hàng theo kênh', tags: ['Kênh bán hàng'],
  permission: 'pos:report', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ from: day.optional(), to: day.optional(), branchCodes: z.string().max(4000).optional() }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/channels' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => {
    const from = i.from ?? todayVn();
    const to = i.to ?? from;
    let branches = branchList(i.branchCodes);
    // Phạm vi chi nhánh của người xem (NT-HT-003): không chọn = cả phạm vi; chọn = phần giao với phạm vi.
    const scope = ctx.branchScope;
    if (scope) branches = branches.length ? branches.filter((b) => scope.includes(b)) : [...scope];
    const empty = scope !== null && branches.length === 0;
    const { pos, channels } = await ctx.data.module(async (tx) => ({
      pos: empty ? [] : await posChannelFacts(tx, { from, to, branches }),
      channels: await listChannels(tx, ctx.tenant.id),
    }));
    let docs: ChannelFact[] = [];
    let phieuBan: 'ok' | 'unavailable' = 'ok';
    if (!empty) {
      try {
        const r = await ctx.actions.call<{ facts: Omit<ChannelFact, 'source'>[] }>('phieu-ban.channel.summary', { from, to, ...(branches.length ? { branchCodes: branches.join(',') } : {}) });
        docs = r.facts.map((f) => ({ ...f, source: 'phieu-ban' as const }));
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code !== 'NOT_FOUND' && code !== 'FORBIDDEN') throw e;
        phieuBan = 'unavailable';
      }
    }
    const rep = channelReport([...pos, ...docs], channels);
    ctx.meta('byKind', rep.byKind);
    ctx.meta('phieuBan', phieuBan);
    ctx.meta('from', from);
    ctx.meta('to', to);
    return rep.rows;
  },
});
