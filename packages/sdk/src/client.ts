import * as pingOperation from './operations/ping.js';
import * as transaction from './operations/transaction.js';
import type * as transactionTypes from './operations/transaction-types.js';
import * as refund from './operations/refund.js';
import * as pointChannel from './operations/point-channel.js';
import { createRequest, type PaymenticClientOptions, type Request, type RequestOptions } from './internal/transport.js';

export class PaymenticClient {
  readonly #request: Request;

  constructor(options: PaymenticClientOptions) {
    this.#request = createRequest(options);
  }

  ping(options: RequestOptions = {}): Promise<pingOperation.PingResponse> {
    return pingOperation.ping(this.#request, options);
  }

  createTransaction(
    pointId: string,
    request: transactionTypes.CreateTransactionRequest,
    options: RequestOptions = {},
  ): Promise<transactionTypes.CreateTransactionResponse> {
    return transaction.createTransaction(this.#request, pointId, request, options);
  }

  getTransaction(
    pointId: string,
    transactionId: string,
    options: RequestOptions = {},
  ): Promise<transactionTypes.TransactionDetails> {
    return transaction.getTransaction(this.#request, pointId, transactionId, options);
  }

  listTransactions(
    pointId: string,
    params: transactionTypes.ListTransactionsParams = {},
    options: RequestOptions = {},
  ): Promise<transactionTypes.ListTransactionsResponse> {
    return transaction.listTransactions(this.#request, pointId, params, options);
  }

  captureTransaction(
    pointId: string,
    transactionId: string,
    options: RequestOptions = {},
  ): Promise<Record<string, unknown>> {
    return transaction.captureTransaction(this.#request, pointId, transactionId, options);
  }

  createRefund(
    pointId: string,
    transactionId: string,
    request: refund.CreateRefundRequest,
    options: RequestOptions = {},
  ): Promise<refund.CreateRefundResponse> {
    return refund.createRefund(this.#request, pointId, transactionId, request, options);
  }

  getRefund(
    pointId: string,
    transactionId: string,
    refundId: string,
    options: RequestOptions = {},
  ): Promise<refund.RefundDetails> {
    return refund.getRefund(this.#request, pointId, transactionId, refundId, options);
  }

  processBlikTransaction(
    pointId: string,
    transactionId: string,
    process: transactionTypes.ProcessBlikTransactionRequest,
    options: RequestOptions = {},
  ): Promise<transactionTypes.ProcessBlikTransactionResponse> {
    return transaction.processBlikTransaction(this.#request, pointId, transactionId, process, options);
  }

  getPointChannels(pointId: string, options: RequestOptions = {}): Promise<pointChannel.PointChannel[]> {
    return pointChannel.getPointChannels(this.#request, pointId, options);
  }
}
