import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../server/services/users/password';

describe('Password Hashing Service (Argon2id)', () => {
  it('should hash password and verify successfully with correct password', async () => {
    const raw = 'SecureP@ssw0rd2026!';
    const hash = await hashPassword(raw);
    expect(hash).toBeDefined();
    expect(hash).toContain('$argon2id$');

    const isValid = await verifyPassword(raw, hash);
    expect(isValid).toBe(true);
  });

  it('should fail verification with wrong password', async () => {
    const raw = 'CorrectPassword123!';
    const hash = await hashPassword(raw);

    const isValid = await verifyPassword('WrongPassword123!', hash);
    expect(isValid).toBe(false);
  });

  it('should safely execute constant-time dummy verification when hash is missing', async () => {
    const isValid = await verifyPassword('AnyPassword123!', null);
    expect(isValid).toBe(false);
  });
});
