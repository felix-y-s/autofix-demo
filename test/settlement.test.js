// 일일 정산에서 발생한 InvariantViolationError(fingerprint 314ff3f980f2ca01)를 재현합니다.
// 운영 데이터: 주문 8842가 status='paid'인데 payments가 비어 있는 상태였습니다.
// 이 테스트는 그 데이터가 "어떻게 만들어지는지"를 실제 코드 경로로 재현합니다.
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

/**
 * 주문 한 건과 그 결제 내역을 읽어 정산 입력 형태로 만듭니다.
 * @param {number} orderId 주문 ID
 * @returns {Promise<{order: object, payments: Array}>} 정산 대상 한 건
 */
async function loadSettlementEntry(orderId) {
  // 정산 대상 주문을 읽습니다.
  const { rows: orders } = await setupPool.query(
    'SELECT id, user_id, status, created_at FROM orders WHERE id = $1',
    [orderId],
  );

  // 해당 주문에 붙은 결제 내역을 읽습니다.
  const { rows: payments } = await setupPool.query(
    'SELECT id, order_id, kind, amount FROM payments WHERE order_id = $1',
    [orderId],
  );

  return { order: orders[0], payments };
}

describe('결제 저장이 실패한 주문의 정산 (fingerprint 314ff3f980f2ca01)', () => {
  // 결제 금액이 INTEGER 범위를 넘어 payments INSERT가 실패하는 상황입니다.
  const OVERFLOW_AMOUNT = 99999999999;

  it('결제 내역 저장이 실패하면 주문 상태가 paid로 남으면 안 된다', async () => {
    const order = await createOrder(331);

    // 결제 내역 INSERT가 실패해 markAsPaid 전체가 실패합니다.
    await expect(markAsPaid(order.id, OVERFLOW_AMOUNT)).rejects.toThrow();

    // 결제가 실패했으므로 상태 변경도 함께 되돌아가야 합니다.
    const { rows } = await setupPool.query('SELECT status FROM orders WHERE id = $1', [order.id]);
    expect(rows[0].status).not.toBe('paid');
  });

  it('결제가 실패한 주문이 섞여 있어도 일일 정산은 통과해야 한다', async () => {
    const order = await createOrder(331);

    await expect(markAsPaid(order.id, OVERFLOW_AMOUNT)).rejects.toThrow();

    // 운영 에러와 동일한 조건(status='paid' + payments=[])이 만들어졌는지 확인합니다.
    const entry = await loadSettlementEntry(order.id);

    // 결제가 성립하지 않았으므로 정산 대상 금액은 0이어야 합니다.
    await expect(settleOrders([entry])).resolves.toBe(0);
  });
});
