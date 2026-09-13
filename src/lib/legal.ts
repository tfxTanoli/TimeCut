// ── Operator details shown on the legal pages ────────────────────────────────
// Consumer law in the EU and UK expects a service's terms to say who runs it,
// where they can be reached, and which law applies. The site did not name any
// of these anywhere. They are business facts only the owner can supply, so they
// live here as configuration rather than being guessed in the copy.
//
// Fill each value in with the registered details. While a value is empty the
// Terms and Privacy pages omit the sentence that needs it (and fall back to a
// generic governing-law clause) instead of printing a placeholder.
//
// Current choice (owner's decision): only the operator name is published. No
// address, governing law or courts are named, so the generic clause is used.

export const LEGAL_OPERATOR = {
  /** Registered legal name of the business, e.g. "TimeCut Ltd". */
  entityName: 'TimeCut',
  /** Registered or trading address, on one line. */
  address: '',
  /** Law that governs the Terms, e.g. "England and Wales". */
  governingLaw: '',
  /** Courts that have jurisdiction, e.g. "England and Wales". */
  courts: '',
}

export const hasOperatorIdentity = (): boolean =>
  Boolean(LEGAL_OPERATOR.entityName.trim() && LEGAL_OPERATOR.address.trim())

/** True when at least the operator's name is configured (address optional). */
export const hasOperatorName = (): boolean =>
  Boolean(LEGAL_OPERATOR.entityName.trim())

export const hasGoverningLaw = (): boolean =>
  Boolean(LEGAL_OPERATOR.governingLaw.trim() && LEGAL_OPERATOR.courts.trim())
