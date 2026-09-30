import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRequestContract, assertResponseContract, assertWebhookContract } from './helpers/contract.mjs';

const path = '/payment/points/{pointId}/transactions';
test('contract validation catches required fields, types, enums and nested fields', () => {
  for (const body of [
    { amount: '1.00' },
    { amount: 1, title: 'Order' },
    { amount: '1.00', title: 'Order', paymentMethod: 'UNKNOWN' },
    { amount: '1.00', title: 'Order', customer: { emailVerified: 'false' } },
    { amount: '1.00', title: 'Order', cart: [{ unitPrice: 1 }] },
  ]) {
    assert.throws(() => assertRequestContract(path, 'post', JSON.stringify(body)), /violates the contract/);
  }
  assert.throws(
    () =>
      assertResponseContract(`${path}/{transactionId}`, 'get', 200, {
        data: { id: 'ABC1-AB2-AB3-ABC4', status: 'PAID', amount: '1.00', isCaptured: 'false' },
      }),
    /violates the contract/,
  );
  assert.throws(
    () =>
      assertWebhookContract('PAYMENT.TRANSACTION_STATUS_CHANGED', {
        transactionId: 'ABC1-AB2-AB3-ABC4',
        pointId: 'b8e6e2fc',
        status: 'UNKNOWN',
        amount: '1.00',
        currency: 'PLN',
      }),
    /violates the contract/,
  );
});
