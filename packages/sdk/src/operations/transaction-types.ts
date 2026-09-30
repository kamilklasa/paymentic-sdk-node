import type { TransactionStatus } from '../transaction-status.js';

export type PaymentMethod = 'BLIK' | 'PBL' | 'BNPL' | 'CARD' | 'MOBILE_WALLET';
export type FilteredPaymentMethod = 'BLIK' | 'PBL' | 'BNPL' | 'CARD' | 'MW' | 'PAYSAFE';

export interface TransactionCustomer {
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  phone?: string | null;
  phoneVerified?: boolean | null;
  country?: string | null;
  locale?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fingerprint?: string | null;
}

export interface TransactionAddress {
  firstName?: string | null;
  lastName?: string | null;
  street?: string | null;
  buildingNumber?: string | null;
  flat?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  state?: string | null;
  country?: string | null;
  company?: string | null;
}

export interface TransactionOrder {
  id?: string | null;
  shippingMethod?:
    | 'VIRTUAL'
    | 'TRACKED_DELIVERY'
    | 'UNTRACKED_DELIVERY'
    | 'IN_STORE_PICKUP'
    | 'PARCEL_PICKUP'
    | 'LOCKER_PICKUP'
    | 'HYBRID'
    | 'OTHER'
    | null;
  trackingNumber?: string | null;
  customerType?: 'B2B' | 'B2C' | null;
}

export interface TransactionCartItem {
  name?: string | null;
  quantity?: number | null;
  unitPrice?: string | null;
  type?: 'PRODUCT' | 'SHIPPING' | 'DISCOUNT' | 'SURCHARGE' | 'GIFT_CARD' | null;
  productType?: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'VIRTUAL' | null;
  sku?: string | null;
}

export interface TransactionPaymentMethodFilter {
  paymentMethod: FilteredPaymentMethod;
  paymentChannel?: string | null;
}

export interface CreateTransactionRequest {
  amount: string;
  title: string;
  currency?: 'PLN' | 'EUR' | null;
  description?: string | null;
  externalReferenceId?: string | null;
  redirect?: { success?: string | null; failure?: string | null } | null;
  customer?: TransactionCustomer | null;
  order?: TransactionOrder | null;
  billingAddress?: TransactionAddress | null;
  shippingAddress?: TransactionAddress | null;
  cart?: TransactionCartItem[] | null;
  paymentMethod?: PaymentMethod | null;
  paymentChannel?: string | null;
  allowedPaymentMethods?: TransactionPaymentMethodFilter[] | null;
  hiddenPaymentMethods?: TransactionPaymentMethodFilter[] | null;
  createRegistration?: boolean | null;
  whitelabel?: boolean | null;
  autoCapture?: boolean | null;
  expiresAt?: string | null;
}

export interface CreateTransactionResponse {
  id: string;
  redirectUrl?: string;
  whitelabel?: Record<string, unknown> | null;
}

export interface TransactionDetails {
  id: string;
  status: TransactionStatus;
  amount: string;
  currency?: string;
  title?: string;
  commission?: string | null;
  description?: string | null;
  customer?: TransactionCustomer;
  order?: TransactionOrder;
  billingAddress?: TransactionAddress | null;
  shippingAddress?: TransactionAddress | null;
  externalReferenceId?: string | null;
  redirect?: { success?: string | null; failure?: string | null };
  paymentMethod?: string | null;
  paymentChannel?: string | null;
  whitelabel?: boolean;
  cart?: Pick<TransactionCartItem, 'name' | 'quantity' | 'unitPrice'>[] | null;
  autoCapture?: boolean;
  isCaptured?: boolean;
  capturedAt?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
}

export interface ListTransactionsParams {
  filter?: {
    status?: TransactionStatus | null;
    amount?: string | null;
    externalReferenceId?: string | null;
    orderId?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    blikId?: string | null;
    cardBin?: string | null;
    providerId?: string | null;
    createdAt?: string | null;
    paidAt?: string | null;
  };
  query?: {
    full?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    title?: string | null;
  };
  page?: {
    number?: number | null;
    size?: number | null;
  };
}

export interface TransactionListItem {
  id: string;
  status: TransactionStatus;
  amount: string;
  title: string;
  commission?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  externalReferenceId?: string | null;
  paymentMethod?: string | null;
  paymentChannel?: string | null;
  orderId?: string | null;
  blikId?: string | null;
  cardBin?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
}

export interface TransactionPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from?: number | null;
  to?: number | null;
  links?: {
    first?: string | null;
    prev?: string | null;
    next?: string | null;
    last?: string | null;
  };
}

export interface ListTransactionsResponse {
  data: TransactionListItem[];
  pagination: TransactionPagination;
}

export interface ProcessBlikTransactionRequest {
  type: 'CODE' | 'ALIAS';
  code: string;
  alias?: {
    value: string;
    label?: string;
    appId?: string;
  };
}

export interface ProcessBlikTransactionResponse {
  actionId: string;
  alias?: Record<string, unknown> | null;
}
