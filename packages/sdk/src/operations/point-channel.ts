import { PaymenticNetworkError, type Request, type RequestOptions } from '../internal/transport.js';
import {
  assertPointId,
  isOptionalBoolean,
  isOptionalNullableString,
  isOptionalString,
  isRecord,
  isStringArray,
} from '../internal/validation.js';

export interface PointChannel {
  id?: string;
  available?: boolean;
  method?: string;
  name?: string;
  image?: { default?: string | null };
  amount?: { minimum?: string; maximum?: string };
  aliases?: string[] | null;
  currencies?: string[];
  commission?: { value?: string | null; minimum?: string | null; fixed?: string | null };
  authorization?: { type?: Array<'REDIRECT' | 'MULTI_FACTOR' | 'SCAN_CODE' | 'APP_NOTIFICATION'> };
  paymentType?: 'INSTANT' | 'PRE_AUTHORIZATION' | 'OFFLINE';
  compliance?: Array<{
    id?: string;
    type?: 'DISPLAYABLE' | 'ACCEPTABLE';
    required?: boolean;
    checked?: boolean | null;
    content?: { text?: string; html?: string; markdown?: string };
    links?: Array<{ id?: string; label?: string; url?: string }>;
  }> | null;
  enablingAt?: string | null;
  disablingAt?: string | null;
}

export async function getPointChannels(
  request: Request,
  pointId: string,
  options: RequestOptions = {},
): Promise<PointChannel[]> {
  assertPointId(pointId);
  const body = await request(`/payment/points/${encodeURIComponent(pointId)}/channels`, 'GET', undefined, options);
  if (!isPointChannelsEnvelope(body)) {
    throw new PaymenticNetworkError();
  }
  return body.data;
}

function isPointChannelsEnvelope(value: unknown): value is { data: PointChannel[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(
      (channel) =>
        isRecord(channel) &&
        ['id', 'method', 'name'].every((name) => isOptionalString(channel[name])) &&
        isOptionalBoolean(channel.available) &&
        (channel.image === undefined || (isRecord(channel.image) && isOptionalNullableString(channel.image.default))) &&
        (channel.amount === undefined ||
          (isRecord(channel.amount) &&
            isOptionalString(channel.amount.minimum) &&
            isOptionalString(channel.amount.maximum))) &&
        (channel.aliases === undefined || channel.aliases === null || isStringArray(channel.aliases)) &&
        (channel.currencies === undefined || isStringArray(channel.currencies)) &&
        (channel.commission === undefined ||
          (isRecord(channel.commission) &&
            isOptionalNullableString(channel.commission.value) &&
            isOptionalNullableString(channel.commission.minimum) &&
            isOptionalNullableString(channel.commission.fixed))) &&
        (channel.authorization === undefined ||
          (isRecord(channel.authorization) &&
            (channel.authorization.type === undefined ||
              (Array.isArray(channel.authorization.type) &&
                channel.authorization.type.every((type) =>
                  ['REDIRECT', 'MULTI_FACTOR', 'SCAN_CODE', 'APP_NOTIFICATION'].includes(type),
                ))))) &&
        (channel.paymentType === undefined ||
          ['INSTANT', 'PRE_AUTHORIZATION', 'OFFLINE'].includes(channel.paymentType as string)) &&
        (channel.compliance === undefined ||
          channel.compliance === null ||
          (Array.isArray(channel.compliance) && channel.compliance.every(isPointChannelCompliance))) &&
        ['enablingAt', 'disablingAt'].every((name) => isOptionalNullableString(channel[name])),
    )
  );
}

function isPointChannelCompliance(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOptionalString(value.id) &&
    (value.type === undefined || value.type === 'DISPLAYABLE' || value.type === 'ACCEPTABLE') &&
    isOptionalBoolean(value.required) &&
    (value.checked === null || isOptionalBoolean(value.checked)) &&
    (value.content === undefined ||
      (isRecord(value.content) &&
        isOptionalString(value.content.text) &&
        isOptionalString(value.content.html) &&
        isOptionalString(value.content.markdown))) &&
    (value.links === undefined ||
      (Array.isArray(value.links) &&
        value.links.every(
          (link) => isRecord(link) && ['id', 'label', 'url'].every((name) => isOptionalString(link[name])),
        )))
  );
}
