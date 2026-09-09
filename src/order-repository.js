// 주문 관련 DB 조회를 담당합니다.
const { Pool } = require('pg');

let pool = null;

/**
 * DB 연결 풀을 가져옵니다. 없으면 만듭니다.
 * @returns {import('pg').Pool} 커넥션 풀
 */
function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

/**
 * 주문의 최종 결제 금액을 계산합니다.
 * 결제(charge)는 더하고 환불(refund)은 빼야 합니다.
 * @param {number} orderId 주문 ID
 * @returns {Promise<number>} 최종 금액
 */
async function calculateOrderTotal(orderId) {
  // 주문에 속한 결제 항목을 모두 합칩니다.
  const { rows } = await getPool().query(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0) AS total
       FROM payments
      WHERE order_id = $1`,
    [orderId],
  );

  return Number(rows[0].total);
}

/**
 * 특정 사용자의 주문 목록을 최신순으로 가져옵니다.
 * @param {number} userId 사용자 ID
 * @returns {Promise<Array>} 주문 목록
 */
async function findOrdersByUser(userId) {
  // 취소된 주문은 목록에서 제외합니다.
  const { rows } = await getPool().query(
    `SELECT id, user_id, status, created_at
       FROM orders
      WHERE user_id = $1 AND status <> 'cancelled'
      ORDER BY created_at DESC`,
    [userId],
  );

  return rows;
}

/**
 * 연결 풀을 닫습니다. 테스트 종료 시 호출합니다.
 */
async function closePool() {
  await pool?.end();
  pool = null;
}

module.exports = { calculateOrderTotal, findOrdersByUser, closePool };
