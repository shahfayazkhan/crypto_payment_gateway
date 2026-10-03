export class InsufficientFundsError extends Error {
  constructor(msg, details) { super(msg); this.code = 'INSUFFICIENT_FUNDS'; this.details = details; }
}
export class NotImplementedError extends Error {
  constructor(msg) { super(msg); this.code = 'NOT_IMPLEMENTED'; }
}
