import { db } from '../../../../../../apps/api/src/db/client.js'; // với ra ngoài module
import pg from 'pg';                                             // thư viện ngoài danh sách cho phép

export async function run(reply: any) {
  setTimeout(() => {}, 60_000);                                  // hẹn giờ tự chế
  reply.status(500).send({});                                    // lỗi không qua Errors.*
  return [db, pg];
}
