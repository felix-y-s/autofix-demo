// 정산 검증 로직(src/settlement.js)이 실제 운영에서 만난 에러를 재현하는 테스트입니다.
// 실제 postgres에 붙어 도는 테스트입니다. DATABASE_URL 환경변수가 가리키는 DB를 사용합니다.
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createOrder, markAsPaid } = require('../src/order-service');
const { settleOrders } = require('../src/settlement');
const { closePool } = require('../src/order-repository');

let setupPool;

// 테스트 시작 전 스키마를 새로 만듭니다.
beforeAll(async () => {
  setupPool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 이전 실행의 잔재를 지우고 깨끗한 상태에서 시작합니다.
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

describe('markAsPaid 도중 결제 내역 기록이 실패하는 경우', () => {
  it('주문 상태 변경과 결제 내역 기록이 트랜잭션으로 묶여있지 않아, 실패 시 paid인데 결제 내역 없는 주문이 남는다', async () => {
    // 정상적인 사용자의 주문을 하나 만듭니다.
    const order = await createOrder(331);

    // amount에 NOT NULL 제약을 위반하는 값을 넘겨 결제 내역 INSERT만 실패시킵니다.
    // markAsPaid는 상태 UPDATE를 먼저 커밋하고 그 다음에 INSERT를 하므로,
    // INSERT가 실패해도 상태 UPDATE는 이미 반영된 채로 남습니다 (원자성 없음).
    await expect(markAsPaid(order.id, null)).rejects.toThrow();

    const { rows: orderRows } = await setupPool.query('SELECT * FROM orders WHERE id = $1', [
      order.id,
    ]);
    const { rows: paymentRows } = await setupPool.query(
      'SELECT * FROM payments WHERE order_id = $1',
      [order.id],
    );

    // 버그로 인해 주문은 paid 상태인데 결제 내역은 비어 있습니다.
    expect(orderRows[0].status).toBe('paid');
    expect(paymentRows).toHaveLength(0);

    // 운영 정산 배치가 이 주문을 만나면 InvariantViolationError로 죽어야 합니다.
    // (settleOrders 내부 validateOrder가 예외를 던지므로 이 테스트도 그 예외로 실패합니다.)
    await settleOrders([{ order: orderRows[0], payments: paymentRows }]);
  });
});
