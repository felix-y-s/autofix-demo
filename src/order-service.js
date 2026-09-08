// 주문 생성/결제 처리입니다.
const { Pool } = require('pg');

let pool = null;

/**
 * DB 연결 풀을 가져옵니다.
 * @returns {import('pg').Pool} 커넥션 풀
 */
function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

/**
 * 주문을 생성합니다.
 * @param {number} userId 사용자 ID
 * @returns {Promise<object>} 생성된 주문
 */
async function createOrder(userId) {
  const { rows } = await getPool().query(
    `INSERT INTO orders (user_id, status) VALUES ($1, 'pending') RETURNING *`,
    [userId],
  );
  return rows[0];
}

/**
 * 결제를 처리하고 주문을 결제 완료 상태로 바꿉니다.
 * @param {number} orderId 주문 ID
 * @param {number} amount 결제 금액
 * @returns {Promise<void>}
 */
async function markAsPaid(orderId, amount) {
  const client = await getPool().connect();

  try {
    // 상태 변경과 결제 내역 기록은 하나의 단위로 성공/실패해야 합니다.
    // 그렇지 않으면 UPDATE만 커밋되고 INSERT가 실패했을 때
    // "결제 완료 상태인데 결제 내역이 없는 주문"이 생깁니다.
    await client.query('BEGIN');

    // 주문 상태를 먼저 결제 완료로 바꿉니다.
    await client.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [orderId]);

    // 그다음 결제 내역을 남깁니다.
    await client.query(
      `INSERT INTO payments (order_id, kind, amount) VALUES ($1, 'charge', $2)`,
      [orderId, amount],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 주문을 취소합니다.
 * @param {number} orderId 주문 ID
 * @returns {Promise<void>}
 */
async function cancelOrder(orderId) {
  await getPool().query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
}

module.exports = { createOrder, markAsPaid, cancelOrder };
