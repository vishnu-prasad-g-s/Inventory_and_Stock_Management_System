import { describe, it, expect } from 'vitest';
import { validateGSTIN, validateEAN13, validateHSN } from '../../server/lib/validators';

describe('Validation Helpers', () => {
  describe('validateGSTIN', () => {
    it('should accept valid GSTIN', () => {
      const res = validateGSTIN('27AAAAA0000A1Z5');
      expect(res.isValid).toBe(true);
      expect(res.stateCode).toBe('27');
      expect(res.stateName).toBe('Maharashtra');
    });

    it('should reject malformed GSTIN', () => {
      const res = validateGSTIN('INVALIDGSTIN123');
      expect(res.isValid).toBe(false);
    });

    it('should reject unknown state code prefix', () => {
      const res = validateGSTIN('99AAAAA0000A1Z5');
      expect(res.isValid).toBe(false);
    });
  });

  describe('validateEAN13', () => {
    it('should validate correct EAN-13 barcode', () => {
      // 8901030000010 is a valid EAN-13 barcode checksum
      expect(validateEAN13('8901030000018')).toBe(true);
    });

    it('should reject EAN-13 with incorrect check digit', () => {
      expect(validateEAN13('8901030000019')).toBe(false);
    });
  });

  describe('validateHSN', () => {
    it('should validate 4, 6, and 8 digit HSN codes', () => {
      expect(validateHSN('8471')).toBe(true);
      expect(validateHSN('847130')).toBe(true);
      expect(validateHSN('84713010')).toBe(true);
      expect(validateHSN('12')).toBe(false); // invalid length
    });
  });
});
