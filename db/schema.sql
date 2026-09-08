-- 주문과 결제 내역을 담는 최소 스키마입니다.
-- 테스트가 시작될 때마다 이 파일로 테이블을 새로 만듭니다.

CREATE TABLE IF NOT EXISTS orders (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL,
  status     TEXT        NOT NULL,      -- paid | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 한 주문에 여러 건의 결제 항목이 붙습니다.
-- kind = 'charge'  : 결제 (양수)
-- kind = 'refund'  : 환불 (양수로 저장하고, 합계 계산 시 빼야 합니다)
CREATE TABLE IF NOT EXISTS payments (
  id       SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind     TEXT    NOT NULL,
  amount   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
