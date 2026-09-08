// 사칙연산 유틸리티

/**
 * 두 수를 더합니다.
 * @param {number} a 첫 번째 피연산자
 * @param {number} b 두 번째 피연산자
 * @returns {number} a와 b의 합
 */
function add(a, b) {
  return a + b; // 두 수를 더한 값을 반환
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('DivisionByZeroError: b는 0이 될 수 없습니다');
  }
  return a / b;
}

module.exports = { add, divide };
