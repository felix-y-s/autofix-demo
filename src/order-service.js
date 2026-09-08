// 주문 생성/결제 처리입니다.
// ⚠️ 의도적으로 버그를 심어둔 파일입니다 (markAsPaid 참고).
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
    // 상태 변경과 결제 내역 기록은 하나의 트랜잭션으로 묶어야 합니다.
    await client.query('BEGIN');

    // 주문 상태를 결제 완료로 바꿉니다.
    await client.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [orderId]);

    // 그다음 결제 내역을 남깁니다.
    await client.query(
      `INSERT INTO payments (order_id, kind, amount) VALUES ($1, 'charge', $2)`,
      [orderId, amount],
    );

    await client.query('COMMIT');
  } catch (err) {
    // 둘 중 하나라도 실패하면 상태 변경까지 함께 되돌립니다.
    // ROLLBACK 자체가 실패해도 원래 실패 원인을 덮어쓰지 않도록 삼킵니다.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      err.rollbackError = rollbackErr;
    }
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

/**
 * 연결 풀을 닫습니다. 테스트 종료 시 호출합니다.
 */
async function closePool() {
  await pool?.end();
  pool = null;
}

module.exports = { createOrder, markAsPaid, cancelOrder, closePool };
