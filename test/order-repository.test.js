// 실제 postgres에 붙어 도는 테스트입니다.
// DATABASE_URL 환경변수가 가리키는 DB를 사용하며,
// 에이전트가 컨테이너에서 실행될 때는 일회용 테스트 DB가 주입됩니다.
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { calculateOrderTotal, findOrdersByUser, closePool } = require('../src/order-repository');

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

describe('calculateOrderTotal', () => {
  it('결제만 있으면 그 합계를 반환한다', async () => {
    await setupPool.query("INSERT INTO orders (id, user_id, status) VALUES (1, 100, 'paid')");
    await setupPool.query(
      "INSERT INTO payments (order_id, kind, amount) VALUES (1, 'charge', 30000), (1, 'charge', 20000)",
    );

    await expect(calculateOrderTotal(1)).resolves.toBe(50000);
  });

  it('환불이 있으면 결제 합계에서 빼야 한다', async () => {
    await setupPool.query("INSERT INTO orders (id, user_id, status) VALUES (1, 100, 'paid')");
    await setupPool.query(
      "INSERT INTO payments (order_id, kind, amount) VALUES (1, 'charge', 50000), (1, 'refund', 20000)",
    );

    // 50000 결제 - 20000 환불 = 30000
    await expect(calculateOrderTotal(1)).resolves.toBe(30000);
  });

  it('결제 내역이 없으면 0을 반환한다', async () => {
    await setupPool.query("INSERT INTO orders (id, user_id, status) VALUES (1, 100, 'paid')");

    await expect(calculateOrderTotal(1)).resolves.toBe(0);
  });
});

describe('findOrdersByUser', () => {
  it('취소된 주문은 제외하고 최신순으로 반환한다', async () => {
    await setupPool.query(`
      INSERT INTO orders (id, user_id, status, created_at) VALUES
        (1, 100, 'paid',      now() - interval '2 day'),
        (2, 100, 'cancelled', now() - interval '1 day'),
        (3, 100, 'paid',      now())
    `);

    const orders = await findOrdersByUser(100);

    expect(orders.map((o) => o.id)).toEqual([3, 1]);
  });

  it('다른 사용자의 주문은 섞이지 않는다', async () => {
    await setupPool.query(`
      INSERT INTO orders (id, user_id, status) VALUES
        (1, 100, 'paid'),
        (2, 200, 'paid')
    `);

    const orders = await findOrdersByUser(100);

    expect(orders).toHaveLength(1);
    expect(orders[0].user_id).toBe(100);
  });
});
