import { assertRequestContract, assertResponseContract } from './helpers/contract.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PaymenticApiError, PaymenticClient, PaymenticNetworkError } from '../dist/index.js';

const contract = JSON.parse(readFileSync(new URL('../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)));
const path = '/payment/points/{pointId}/channels';

test('getPointChannels sends the v1.2 request and returns the channel fields', async () => {
  const requests = [];
  const channel = {
    id: 'mbank',
    available: true,
    method: 'PBL',
    name: 'mBank',
    image: { default: 'https://example.com/mbank.png' },
    amount: { minimum: '10.00', maximum: '10000.00' },
    aliases: ['m-bank'],
    currencies: ['PLN'],
    commission: { value: '1.65', minimum: '0.30', fixed: null },
    authorization: { type: ['REDIRECT', 'APP_NOTIFICATION'] },
    paymentType: 'INSTANT',
    compliance: [
      {
        id: 'info_gdpr',
        type: 'DISPLAYABLE',
        required: false,
        checked: null,
        content: { text: 'Privacy', html: '<b>Privacy</b>', markdown: '**Privacy**' },
        links: [{ id: 'privacy_policy', label: 'Privacy policy', url: 'https://example.com/privacy' }],
      },
    ],
    enablingAt: null,
    disablingAt: '2026-12-01T00:00:00Z',
  };
  const client = new PaymenticClient({
    apiKey: 'test-token',
    environment: 'sandbox',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return Response.json({ data: [channel] });
    },
  });

  assert.deepEqual(Object.keys(channel), Object.keys(contract.components.schemas.GetPointChannelsResource.properties));
  assert.equal(
    contract.paths[path].get.responses['200'].content['application/json'].schema.properties.data.items.$ref,
    '#/components/schemas/GetPointChannelsResource',
  );
  assert.deepEqual(await client.getPointChannels('point/id'), [channel]);
  assert.equal(requests.length, 1);
  assertRequestContract(path, 'get', requests[0].init.body);
  assertResponseContract(path, 'get', 200, { data: [channel] });
  assert.equal(requests[0].input, `${contract.servers[1].url}/payment/points/point%2Fid/channels`);
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(new Headers(requests[0].init.headers).get('authorization'), 'Bearer test-token');
  assert.equal(requests[0].init.body, undefined);
});

test('getPointChannels returns an empty channel list', async () => {
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => Response.json({ data: [] }),
  });
  assert.deepEqual(await client.getPointChannels('point'), []);
});

test('getPointChannels exposes API errors and rejects an invalid point ID', async () => {
  let requests = 0;
  const errors = [{ code: 'POINT_NOT_FOUND', message: 'Point not found.' }];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => {
      requests++;
      return Response.json({ errors }, { status: 404 });
    },
  });

  await assert.rejects(client.getPointChannels(' '), TypeError);
  assert.equal(requests, 0);
  await assert.rejects(client.getPointChannels('point'), (error) => {
    assert.ok(error instanceof PaymenticApiError);
    assert.equal(error.status, 404);
    assert.equal(error.errors[0].code, 'POINT_NOT_FOUND');
    assert.equal(error.errors[0].message, 'Point not found.');
    return true;
  });
  assert.equal(requests, 1);
});

test('getPointChannels rejects malformed channel responses', async () => {
  const responses = [
    { data: null },
    { data: [{ id: 'mbank', available: 'yes' }] },
    { data: [{ id: 'mbank', available: true, commission: { fixed: 2.5 } }] },
  ];
  const client = new PaymenticClient({
    apiKey: 'key',
    environment: 'sandbox',
    fetch: async () => Response.json(responses.shift()),
  });

  for (let index = 0; index < 3; index++) {
    await assert.rejects(client.getPointChannels('point'), PaymenticNetworkError);
  }
});
