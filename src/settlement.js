// 일일 정산 처리입니다.
// 정산 전에 주문 데이터가 규칙을 지키고 있는지 검증합니다.
const { calculateOrderTotal } = require('./order-repository');

/**
 * 데이터 규칙 위반을 알리는 에러입니다.
 * 코드 버그가 아니라 저장된 값이 잘못된 상태임을 나타냅니다.
 */
class InvariantViolationError extends Error {
  /**
   * @param {string} message 사람이 읽을 설명
   * @param {object} options 부가 정보 { context } — 에러 시점의 관련 레코드
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'InvariantViolationError';
    // 에러를 던지는 이 지점이 "무엇이 문제인지" 이미 알고 있으므로,
    // 그 값을 함께 담아 보냅니다. ExceptionFilter는 이걸 그대로 실어 나릅니다.
    this.context = options.context;
  }
}

/**
 * 주문이 정산 가능한 상태인지 검증합니다.
 * @param {object} order 주문 레코드
 * @param {Array} payments 해당 주문의 결제 내역
 * @throws {InvariantViolationError} 데이터가 규칙을 위반한 경우
 */
function validateOrder(order, payments) {
  // 결제 완료 상태라면 결제 내역이 최소 1건은 있어야 합니다.
  if (order.status === 'paid' && payments.length === 0) {
    throw new InvariantViolationError(
      `결제 완료(paid) 상태인데 결제 내역이 없는 주문이 있습니다`,
      { context: { order, payments } },
    );
  }

  // 취소된 주문에는 환불이 있어야 합니다.
  if (order.status === 'cancelled') {
    const hasRefund = payments.some((p) => p.kind === 'refund');
    if (payments.length > 0 && !hasRefund) {
      throw new InvariantViolationError(
        `취소된 주문인데 환불 내역이 없습니다`,
        { context: { order, payments } },
      );
    }
  }
}

/**
 * 주문 목록을 정산합니다.
 * 개별 주문이 데이터 규칙을 위반하더라도(InvariantViolationError) 그 주문 하나만
 * 정산에서 제외하고 배치는 계속 진행합니다. 한 건의 잘못된 데이터 때문에
 * 나머지 정상 주문까지 전부 정산 실패로 처리되어서는 안 되기 때문입니다.
 * 다만 그 위반 사실 자체는 은폐하지 않고 콘솔에 남겨 모니터링(Sentry 등)이
 * 계속 감지할 수 있게 하고, skipped 목록으로도 호출자에게 알립니다.
 * @param {Array<{order: object, payments: Array}>} entries 정산 대상
 * @returns {Promise<{total: number, skipped: Array<{order: object, error: InvariantViolationError}>}>}
 *   total: 정산 총액, skipped: 데이터 규칙 위반으로 정산에서 제외된 주문 목록
 */
async function settleOrders(entries) {
  let total = 0;
  const skipped = [];

  for (const { order, payments } of entries) {
    try {
      // 검증을 통과한 주문만 정산에 포함합니다.
      validateOrder(order, payments);
    } catch (err) {
      if (err instanceof InvariantViolationError) {
        // 이 주문만 정산에서 제외합니다. 문제를 조용히 묻지 않고
        // 콘솔(운영에서는 로그 수집기/Sentry)로 남기고 결과에도 포함시킵니다.
        console.error('[settlement] 주문 데이터 규칙 위반으로 정산에서 제외:', err.message, err.context);
        skipped.push({ order, error: err });
        continue;
      }
      throw err;
    }
    total += await calculateOrderTotal(order.id);
  }

  return { total, skipped };
}

module.exports = { settleOrders, validateOrder, InvariantViolationError };
