// [2026-11-10 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — S014-16: fixture SC-ACT-2 — action ghi sổ qua dây gọi nhưng không khai 'ledger'; khai errors thiếu PERIOD_LOCKED; ghi thử không tính
declare const defineAction: (a: unknown) => unknown;
declare const db: { insertInto: (t: string) => { values: (v: unknown) => { execute: () => Promise<void> } } };

const alphaLedger = {
  async writeEntry(v: unknown) { await db.insertInto('ledger_entries').values(v).execute(); },
};
async function postAlpha(v: unknown, opts: { force?: boolean } = {}) { void opts; await alphaLedger.writeEntry(v); }
export function trialPosting(v: unknown) { return postAlpha(v); }

export const actions = [
  defineAction({
    id: 'alpha.doc.post', effect: 'write', sideEffects: ['documents'],
    handler: (_c: unknown, i: unknown) => postAlpha(i),
  }),
  defineAction({
    id: 'alpha.doc.repost', effect: 'write', sideEffects: ['documents', 'ledger'], errors: ['NOT_FOUND'],
    handler: (_c: unknown, i: unknown) => postAlpha(i),
  }),
  defineAction({
    id: 'alpha.doc.check', effect: 'write', sideEffects: ['analysis'],
    handler: (_c: unknown, i: unknown) => trialPosting(i),
  }),
];
