// markAsPaid의 정상 경로를 검증합니다.
// 트랜잭션 도입 후 COMMIT이 빠지면 이 테스트가 실패합니다.
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createOrder, markAsPaid, closePool } = require('../src/order-service');

let setupPool;

// 테스트 시작 전 스키마를 새로 만듭니다.
beforeAll(async () => {
  setupPool = new Pool({ connectionString: process.env.DATABASE_URL });

  await setupPool.query('DROP TABLE IF EXISTS payments, orders CASCADE');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await setupPool.query(schema);
});

// 각 테스트 전에 데이터를 초기화합니다.
beforeEach(async () => {
  await setupPool.query('TRUNCATE payments, orders RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await setupPool.end();
  await closePool();
});

describe('markAsPaid 정상 경로', () => {
  it('결제가 성공하면 주문 상태와 결제 내역이 함께 커밋된다', async () => {
    const order = await createOrder(331);

    await markAsPaid(order.id, 30000);

    // 별도 커넥션에서 읽어 실제로 커밋되었는지 확인합니다.
    const { rows: orders } = await setupPool.query(
      'SELECT status FROM orders WHERE id = $1',
      [order.id],
    );
    expect(orders[0].status).toBe('paid');

    const { rows: payments } = await setupPool.query(
      'SELECT kind, amount FROM payments WHERE order_id = $1',
      [order.id],
    );
    expect(payments).toEqual([{ kind: 'charge', amount: 30000 }]);
  });

  it('결제 성공 후에는 커넥션이 반납되어 다음 결제도 처리된다', async () => {
    const first = await createOrder(331);
    const second = await createOrder(332);

    await markAsPaid(first.id, 10000);
    await markAsPaid(second.id, 20000);

    const { rows } = await setupPool.query(
      'SELECT COUNT(*)::int AS count FROM payments WHERE kind = $1',
      ['charge'],
    );
    expect(rows[0].count).toBe(2);
  });
});
