import { describe, it, expect } from 'vitest';
import { checkAccountLockout } from '../../server/services/users/lockout';
import { AppError } from '../../server/lib/errors';

describe('Account Lockout Service', () => {
  it('should allow active user with no lock', () => {
    expect(() =>
      checkAccountLockout({ status: 'ACTIVE', lockedUntil: null })
    ).not.toThrow();
  });

  it('should reject inactive user', () => {
    expect(() =>
      checkAccountLockout({ status: 'INACTIVE', lockedUntil: null })
    ).toThrow(AppError);
  });

  it('should reject user currently locked out', () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
    expect(() =>
      checkAccountLockout({ status: 'ACTIVE', lockedUntil })
    ).toThrow(AppError);
  });

  it('should allow user whose lock expired in the past', () => {
    const lockedUntil = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    expect(() =>
      checkAccountLockout({ status: 'ACTIVE', lockedUntil })
    ).not.toThrow();
  });
});
