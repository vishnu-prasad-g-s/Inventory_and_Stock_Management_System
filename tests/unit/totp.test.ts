import { describe, it, expect } from 'vitest';
import { generateTotpSecret, verifyTotpToken, generateBackupCodes, verifyBackupCode } from '../../server/services/users/totp';
import { authenticator } from 'otplib';

describe('TOTP 2FA Service', () => {
  it('should generate TOTP secret and verify token correctly', () => {
    const { secret, otpauthUrl } = generateTotpSecret('test@stockpilot.local');
    expect(secret).toBeDefined();
    expect(otpauthUrl).toContain('test%40stockpilot.local');

    const token = authenticator.generate(secret);
    const isValid = verifyTotpToken(token, secret);
    expect(isValid).toBe(true);
  });

  it('should reject invalid TOTP token', () => {
    const { secret } = generateTotpSecret('test@stockpilot.local');
    const isValid = verifyTotpToken('000000', secret);
    expect(isValid).toBe(false);
  });

  it('should generate and verify single-use backup codes', () => {
    const { rawCodes, hashedCodes } = generateBackupCodes(10);
    expect(rawCodes.length).toBe(10);
    expect(hashedCodes.length).toBe(10);

    const firstCode = rawCodes[0];
    const res1 = verifyBackupCode(firstCode, hashedCodes);
    expect(res1.isValid).toBe(true);
    expect(res1.remainingHashes.length).toBe(9);

    // Re-using the same code must fail
    const res2 = verifyBackupCode(firstCode, res1.remainingHashes);
    expect(res2.isValid).toBe(false);
  });
});
