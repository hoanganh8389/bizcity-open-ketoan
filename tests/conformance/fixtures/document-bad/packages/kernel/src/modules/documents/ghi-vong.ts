// @bizcity-layer K kernel/intake
// Mẫu SAI: ghi thẳng bảng phiên bản sự việc ngoài document.repository.ts, và ghi bút toán không kèm sourceVersion.
export async function ghiVong(trx: any, docId: string): Promise<void> {
  await trx.insertInto('accounting_event_versions').values({ event_id: docId, version: 1, payload: '{}' }).execute();
  await trx.insertInto('document_links').values({ from_ref: 'a.b:1', to_ref: 'a.b:2', role: 'source' }).execute();
}
