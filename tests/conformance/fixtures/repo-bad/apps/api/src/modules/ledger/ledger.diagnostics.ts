// @bizcity-layer K kernel/ledger
// SC-DIAG-1: GHOST_CHECK có trong app nhưng không có check DG-* cùng mã.
export const checks = [{ code: 'LEDGER_BALANCED', layer: 'L3' }, { code: 'GHOST_CHECK', layer: 'L3' }];
