/**
 * Formats a number as a currency string based on the provided locale and currency code.
 * * @param amount The numeric amount to format.
 * @param currencyCode The 3-letter currency code (e.g., 'USD', 'EUR').
 * @param locale The locale string (e.g., 'en-US', 'es-419'). Defaults to browser locale if not provided.
 */
export function formatCurrency(
    amount: number,
    currencyCode: string = "USD",
    locale?: string
): string {
    // If locale is undefined, Intl uses the system default, which is desired for "system" setting.
    // However, if we want to align strictness with the app's current language:

    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currencyCode,
        }).format(amount);
    } catch (e) {
        // Fallback for invalid codes
        return `${currencyCode} ${amount.toFixed(2)}`;
    }
}
