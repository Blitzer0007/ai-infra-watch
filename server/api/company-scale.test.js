import test from 'node:test';
import assert from 'node:assert/strict';
import { annualFactRows } from './company-scale.js';

function annual(value, start, end, filed) {
  return { val: value, start, end, filed, form: '10-K', fp: 'FY' };
}

test('annualFactRows prefers the newest fiscal period when revenue tags have equal coverage', () => {
  const facts = {
    cik: '0001045810',
    facts: {
      'us-gaap': {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: {
            USD: [
              annual(26914000000, '2021-02-01', '2022-01-30', '2022-03-18'),
              annual(16675000000, '2020-01-27', '2021-01-31', '2021-03-01'),
              annual(10918000000, '2019-01-28', '2020-01-26', '2020-02-20'),
            ],
          },
        },
        Revenues: {
          units: {
            USD: [
              annual(215900000000, '2025-01-27', '2026-01-25', '2026-02-20'),
              annual(130500000000, '2024-01-29', '2025-01-26', '2025-02-26'),
              annual(60920000000, '2023-01-30', '2024-01-28', '2024-02-21'),
            ],
          },
        },
      },
    },
  };

  const rows = annualFactRows(facts, [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Revenues',
  ]);

  assert.equal(rows.length, 3);
  assert.equal(rows[0].tag, 'Revenues');
  assert.equal(rows[0].end, '2026-01-25');
  assert.equal(rows[0].filed, '2026-02-20');
});
