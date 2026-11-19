export type CheckoutErrorCode =
  | "EVENT_UNAVAILABLE"
  | "INVALID_SELECTION"
  | "SOLD_OUT"
  | "SALES_CLOSED"
  | "LIMIT_EXCEEDED"
  | "PAYMENTS_UNAVAILABLE";

export class CheckoutError extends Error {
  constructor(
    public code: CheckoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}
