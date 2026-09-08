// 실제 postgres에 붙어 도는 테스트입니다.
// markAsPaid가 원자적으로 동작하는지 검증합니다.
// 운영에서 InvariantViolationError(결제 완료인데 결제 내역 없음)가 발생했는데,
// 원인은 markAsPaid가 트랜잭션 없이 UPDATE 후 INSERT를 따로 실행하기 때문입니다.
// INSERT가 실패해도 이미 커밋된 UPDATE(status='paid')는 되돌아가지 않습니다.
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createOrder, markAsPaid } = require('../src/order-service');
const { closePool } = require('../src/order-repository');

let setupPool;

beforeAll(async () => {
  setupPool = new Pool({ connectionString: process.env.DATABASE_URL });

  await setupPool.query('DROP TABLE IF EXISTS payments, orders CASCADE');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await setupPool.query(schema);
});

beforeEach(async () => {
  await setupPool.query('TRUNCATE payments, orders RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await setupPool.end();
  await closePool();
});

describe('markAsPaid', () => {
  it('결제 내역 저장이 실패하면 주문 상태도 paid로 바뀌면 안 된다', async () => {
    const order = await createOrder(331);

    // amount 자리에 정수로 변환할 수 없는 값을 넣어 INSERT가 실패하도록 만듭니다.
    // (payments.amount는 INTEGER NOT NULL)
    await expect(markAsPaid(order.id, 'not-a-number')).rejects.toThrow();

    const { rows } = await setupPool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    const { rows: paymentRows } = await setupPool.query(
      'SELECT * FROM payments WHERE order_id = $1',
      [order.id],
    );

    // UPDATE와 INSERT가 원자적이지 않으면 status만 'paid'로 남고 payments는 비어있게 된다.
    // 이것이 바로 운영에서 재현된 InvariantViolationError 상황이다.
    expect(rows[0].status).not.toBe('paid');
    expect(paymentRows).toHaveLength(0);
  });
});
