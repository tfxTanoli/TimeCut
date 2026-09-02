/**
 * Read the `code` off a thrown value.
 *
 * Firebase Auth rejects with an object carrying a string `code`
 * ("auth/wrong-password" and friends), but a `catch` binding is `unknown` —
 * anything can be thrown. This narrows it safely and returns '' when the thrown
 * value has no code, so callers can switch on the result without either
 * typing the binding as `any` or risking a read on null.
 */
export function firebaseErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}
