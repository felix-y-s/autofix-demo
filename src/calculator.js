function add(a, b) {
  // 두 수를 더한 값을 반환
  return a + b;
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('DivisionByZeroError: b는 0이 될 수 없습니다');
  }
  return a / b;
}

module.exports = { add, divide };
