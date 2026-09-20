/**
 * Manual configuration for subscription payments (owner-maintained).
 *
 * These are the accounts the center's owner receives subscription fees on.
 * Replace them with the real accounts before going live — they cannot be
 * read from anywhere else in the codebase. Payment is manual (CASH /
 * VODAFONE_CASH / INSTAPAY); there is no online gateway.
 */
export const billingConfig = {
  currency: 'EGP' as const,
  paymentAccounts: {
    VODAFONE_CASH: { accountNumber: '01012345678', displayName: 'فودافون كاش' },
    INSTAPAY: { accountNumber: 'madar@instapay', displayName: 'إنستاباي' },
    CASH: { accountNumber: null, displayName: 'كاش (يدوي)' },
  },
};