/**
 * 두 수를 더한 값을 반환한다
 * @param a 첫 번째 피연산자
 * @param b 두 번째 피연산자
 * @returns a와 b의 합
 */
function add(a, b) {
  // 덧셈 연산 수행
  return a + b;
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('DivisionByZeroError: b는 0이 될 수 없습니다');
  }
  return a / b;
}

module.exports = { add, divide };
