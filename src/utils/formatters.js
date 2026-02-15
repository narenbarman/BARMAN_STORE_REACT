/**
 * Currency formatting utilities
 */

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * Format currency with color indication (positive/negative)
 * Returns object with formatted text and isPositive flag
 */
export const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  const isPositive = amount >= 0;
  return { text: formatted, isPositive };
};
