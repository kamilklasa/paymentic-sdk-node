import { assertRequestContract, assertResponseContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PaymenticClient, PaymenticNetworkError } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));
const operation = contract.paths['/payment/points/{pointId}/transactions'].get;

test('listTransactions sends contract filter and page names and returns typed rows with pagination', async () => {
  const requests = [];
  const row = {
    id: 'ABCD-123-XYZ-9876',
    status: 'PAID',
    amount: '123.45',
    title: 'Order #12345',
    commission: '1.23',
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    externalReferenceId: 'EXT-REF-123',
    paymentMethod: 'BLIK',
    paymentChannel: 'blik-psp',
    orderId: 'ORD-12345',
    blikId: 'BLIK123',
    cardBin: null,
    paidAt: '2024-01-15T11:55:00Z',
    createdAt: '2024-01-15T11:50:00Z',
  };
  const pagination = {
    page: 2,
    pageSize: 10,
    total: 12,
    totalPages: 2,
    from: 11,
    to: 12,
    links: {
      first: 'https://example.test/first',
      prev: 'https://example.test/prev',
      next: null,
      last: 'https://example.test/last',
    },
  };
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return Response.json({ data: [row], pagination });
    },
  });

  const filters = {
    filter: {
      status: 'PAID',
      amount: '123.45',
      externalReferenceId: 'EXT-REF-123',
      orderId: 'ORD-12345',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      blikId: 'BLIK123',
      cardBin: '411111',
      providerId: 'blik',
      createdAt: '2024-01-01T00:00:00Z,2024-12-31T23:59:59Z',
      paidAt: '2024-01-01T00:00:00Z,2024-12-31T23:59:59Z',
    },
    query: { full: 'John & Jane', customerName: 'John Doe', customerEmail: 'john@example.com', title: 'Order #12345' },
    page: { number: 2, size: 10 },
  };
  assert.deepEqual(Object.keys(row), Object.keys(contract.components.schemas.GetTransactionsResource.properties));
  assert.deepEqual(await client.listTransactions('b8e6e2fc', filters), { data: [row], pagination });
  assert.equal(requests.length, 1);
  assertRequestContract('/payment/points/{pointId}/transactions', 'get', requests[0].init.body);
  assertResponseContract('/payment/points/{pointId}/transactions', 'get', 200, { data: [row], pagination });
  const url = new URL(requests[0].input);
  assert.equal(url.origin + url.pathname, `${contract.servers[1].url}/payment/points/b8e6e2fc/transactions`);
  assert.deepEqual(
    [...url.searchParams.keys()],
    operation.parameters.slice(1).map((parameter) => parameter.name),
  );
  assert.equal(url.searchParams.get('filter[createdAt]'), filters.filter.createdAt);
  assert.equal(url.searchParams.get('query[full]'), 'John & Jane');
  assert.equal(url.searchParams.get('page[number]'), '2');
  assert.equal(url.searchParams.get('page[size]'), '10');
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
  assert.equal(requests[0].init.body, undefined);
});

test('listTransactions accepts an empty page and omits nullish optional values', async () => {
  const urls = [];
  const empty = {
    data: [],
    pagination: {
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
      from: null,
      to: null,
      links: { first: null, prev: null, next: null, last: null },
    },
  };
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async (input) => {
      urls.push(input);
      return Response.json(empty);
    },
  });

  assert.deepEqual(
    await client.listTransactions('point/id', {
      filter: { status: null, externalReferenceId: '', providerId: undefined },
      page: { number: 1, size: null },
    }),
    empty,
  );
  assert.equal(
    urls[0],
    `${contract.servers[1].url}/payment/points/point%2Fid/transactions?filter%5BexternalReferenceId%5D=&page%5Bnumber%5D=1`,
  );
  assert.deepEqual(await client.listTransactions('b8e6e2fc'), empty);
  assert.equal(urls[1], `${contract.servers[1].url}/payment/points/b8e6e2fc/transactions`);
});

test('listTransactions rejects invalid pagination and malformed list responses', async () => {
  let requests = 0;
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests++;
      return Response.json({ data: [], pagination: { page: '1' } });
    },
  });
  await assert.rejects(client.listTransactions('', {}), TypeError);
  await assert.rejects(client.listTransactions('point', { page: { number: 0 } }), TypeError);
  await assert.rejects(client.listTransactions('point', { page: { size: 101 } }), TypeError);
  assert.equal(requests, 0);
  await assert.rejects(client.listTransactions('point'), PaymenticNetworkError);
});

test('listTransactions rejects rows and pagination links with invalid optional field types', async () => {
  const pagination = {
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
    from: 1,
    to: 1,
    links: { first: null, prev: null, next: null, last: null },
  };
  const responses = [
    { data: [{ id: 'tx', status: 'PAID', amount: '1.00', title: 'Order', commission: 42 }], pagination },
    { data: [], pagination: { ...pagination, links: { ...pagination.links, next: 42 } } },
  ];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => Response.json(responses.shift()),
  });

  await assert.rejects(client.listTransactions('point'), PaymenticNetworkError);
  await assert.rejects(client.listTransactions('point'), PaymenticNetworkError);
});
