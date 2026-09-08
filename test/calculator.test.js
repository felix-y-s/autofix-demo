const { add, divide } = require('../src/calculator');

test('add()는 두 수를 더한 값을 반환해야 한다', () => {
  expect(add(2, 3)).toBe(5);
});

test('divide()는 0으로 나누면 에러를 던져야 한다', () => {
  expect(() => divide(10, 0)).toThrow('DivisionByZeroError');
});

test('divide()는 정상적으로 나눗셈을 수행한다', () => {
  expect(divide(10, 2)).toBe(5);
});
