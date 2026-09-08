// ⚠️ 의도적으로 버그를 심어둔 파일입니다.
// add()가 뺄셈을 하고 있어서, 운영 중 합계가 틀리게 나오는 상황을 재현합니다.
function add(a, b) {
  return a - b; // 버그: 더해야 하는데 빼고 있음
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('DivisionByZeroError: b는 0이 될 수 없습니다');
  }
  return a / b;
}

module.exports = { add, divide };
