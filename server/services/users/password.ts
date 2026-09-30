import argon2 from 'argon2';

// OWASP Recommended Argon2id options
const ARGON_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,       // 2 iterations
  parallelism: 1,    // 1 lane
};

// Pre-computed dummy hash to mitigate timing attacks when email is unknown
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0MTIzNDU2Nzg$dummyhashvalue1234567890abcdefghijklmnopqrstuvwxyz';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    // Perform dummy verify to consume equal CPU/time
    try {
      await argon2.verify(DUMMY_HASH, password);
    } catch {
      // Ignore failure on dummy verify
    }
    return false;
  }

  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    return false;
  }
}
