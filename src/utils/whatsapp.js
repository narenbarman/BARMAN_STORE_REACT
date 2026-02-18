const getDefaultCountryCode = () => {
  const raw = String(import.meta?.env?.VITE_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
  return raw || '91';
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
  const encoded = encodeURIComponent(String(text || ''));
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

