import { authenticator } from 'otplib';
import { randomBytes, createHash } from 'crypto';

authenticator.options = { window: 1 }; // ±30 sec window

export function generateTotpSecret(email: string, appName = 'StockPilot'): { secret: string; otpauthUrl: string } {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, appName, secret);
  return { secret, otpauthUrl };
}

export function verifyTotpToken(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}

export function generateBackupCodes(count = 10): { rawCodes: string[]; hashedCodes: string[] } {
  const rawCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString('hex').toUpperCase(); // 8 char hex
    const hash = createHash('sha256').update(raw).digest('hex');
    rawCodes.push(raw);
    hashedCodes.push(hash);
  }

  return { rawCodes, hashedCodes };
}

export function verifyBackupCode(inputCode: string, hashedCodes: string[]): { isValid: boolean; remainingHashes: string[] } {
  const inputHash = createHash('sha256').update(inputCode.trim().toUpperCase()).digest('hex');
  const index = hashedCodes.indexOf(inputHash);

  if (index === -1) {
    return { isValid: false, remainingHashes: hashedCodes };
  }

  const remainingHashes = [...hashedCodes];
  remainingHashes.splice(index, 1);
  return { isValid: true, remainingHashes };
}
