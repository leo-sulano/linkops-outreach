export class NoAvailableSenderError extends Error {
  constructor() {
    super('No sender available — all senders are at their daily limit or inactive')
    this.name = 'NoAvailableSenderError'
  }
}

export class SenderAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SenderAuthError'
  }
}
