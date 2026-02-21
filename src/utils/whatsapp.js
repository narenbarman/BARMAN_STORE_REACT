import { ONLINE_STORE_URL } from '../pages/info';

const getDefaultCountryCode = () => {
  const raw = String(import.meta?.env?.VITE_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
  return raw || '91';
};

const getStoreUrl = () => String(ONLINE_STORE_URL || '').trim();

const appendVisitUsFooter = (text) => {
  const baseText = String(text || '').trim();
  const storeUrl = getStoreUrl();
  if (!storeUrl) return baseText;

  const normalizedText = baseText.toLowerCase();
  const normalizedUrl = storeUrl.toLowerCase();
  if (normalizedText.includes(normalizedUrl)) return baseText;

  const footer = `Visit us at ${storeUrl}`;
  return baseText ? `${baseText}\n\n${footer}` : footer;
};

export const normalizePhoneForWhatsApp = (phone, defaultCountryCode = getDefaultCountryCode()) => {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }

  return digits;
};

export const buildWhatsAppUrl = ({ phone, text, defaultCountryCode } = {}) => {
  const normalized = normalizePhoneForWhatsApp(phone, defaultCountryCode);
  const encoded = encodeURIComponent(appendVisitUsFooter(text));
  return normalized
    ? `https://wa.me/${normalized}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
};

export const openWhatsApp = (params = {}) => {
  const href = buildWhatsAppUrl(params);
  if (typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
  return href;
};
