export const INDIAN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

export function validateGSTIN(gstin: string): { isValid: boolean; stateCode?: string; stateName?: string; error?: string } {
  if (!gstin) return { isValid: true }; // GSTIN is optional for unregistered parties

  const trimmed = gstin.trim().toUpperCase();
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  if (!regex.test(trimmed)) {
    return { isValid: false, error: 'Invalid GSTIN format. Expected format e.g. 27AAAAA0000A1Z5' };
  }

  const stateCode = trimmed.substring(0, 2);
  const stateName = INDIAN_STATE_CODES[stateCode];

  if (!stateName) {
    return { isValid: false, error: `Invalid state code prefix: ${stateCode}` };
  }

  return { isValid: true, stateCode, stateName };
}

export function validateEAN13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;

  const digits = barcode.split('').map(Number);
  const checkDigit = digits[12];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }

  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return checkDigit === calculatedCheckDigit;
}

export function validateHSN(hsn: string): boolean {
  if (!hsn) return true;
  return /^\d{4}(\d{2})?(\d{2})?$/.test(hsn.trim());
}
