import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const contract = JSON.parse(
  readFileSync(new URL('../../../../contracts/paymentic-openapi-v1.2.json', import.meta.url)),
);
const components = structuredClone(contract.components);

// The pinned document references Parameter Objects from response properties.
// JSON Schema must resolve those references to the parameter's schema instead.
components.parameters = Object.fromEntries(
  Object.entries(components.parameters).map(([name, parameter]) => [name, parameter.schema]),
);

// Known upstream defects, guarded so a contract update requires revisiting them.
const transactionId = components.schemas.TransactionIdSchema;
assert.equal(transactionId.minLength, 14);
assert.equal(transactionId.maxLength, 14);
assert.equal(transactionId.pattern, '^[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{4}$');
// The upstream lengths omit the three hyphens required by its own pattern.
transactionId.minLength = 17;
transactionId.maxLength = 17;
for (const name of ['firstName', 'lastName']) {
  const field = components.schemas.CustomerFullDataSchema.properties[name];
  assert.equal(field.pattern, "/^[\\p{L}'-]+$/u");
  field.pattern = "^[\\p{L}'-]+$";
}
const refund = components.schemas.CreateTransactionRefundRequest;
assert.deepEqual(refund.required, ['amount', 'title']);
assert.equal(refund.properties.title, undefined);
// The live API rejects title; see packages/sdk/README.md.
refund.required = ['amount'];

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addFormat('decimal', /^-?\d+(?:\.\d+)?$/);
ajv.addFormat('ulid', /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i);
ajv.addFormat('ISO-3166-1 alpha-2', /^[A-Z]{2}$/);
ajv.addFormat('ISO-4217', /^[A-Z]{3}$/);
ajv.addFormat('ISO-8601', ajv.formats['date-time']);
const validators = new Map();

function assertSchema(schema, value, label) {
  assert.ok(schema, `Missing contract schema: ${label}`);
  let validate = validators.get(schema);
  if (!validate) {
    validate = ajv.compile({ ...schema, components });
    validators.set(schema, validate);
  }
  assert.ok(validate(value), `${label} violates the contract: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
}

export function assertRequestContract(path, method, body) {
  const operation = contract.paths[path][method];
  if (!operation.requestBody) {
    assert.equal(body, undefined);
    return;
  }
  assertSchema(operation.requestBody.content['application/json'].schema, JSON.parse(body), `${method} ${path} request`);
}

export function assertResponseContract(path, method, status, body) {
  assertSchema(
    contract.paths[path][method].responses[status].content['application/json'].schema,
    body,
    `${method} ${path} response ${status}`,
  );
}

export function assertWebhookContract(event, payload) {
  assertSchema(contract.webhooks[event].post.requestBody.content['application/json'].schema, payload, event);
}
