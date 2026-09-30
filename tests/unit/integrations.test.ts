import { describe, it, expect } from 'vitest';
import { generateApiKey } from '../../server/services/api/apikeys';
import { signWebhookPayload, verifyWebhookSignature } from '../../server/services/webhooks/webhooks';

describe('Phase 9 — Reach & Integrations Tests', () => {
  it('should generate secure API keys with prefix and SHA-256 hash', () => {
    const { rawKey, prefix, hashedKey } = generateApiKey('Test Key', ['products.read']);
    expect(rawKey).toContain(`sp_live_${prefix}_`);
    expect(hashedKey.length).toBe(64); // SHA-256 hex string length
  });

  it('should accurately generate and verify HMAC-SHA256 webhook signatures', () => {
    const secret = 'whsec_testsecret123456';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ event: 'stock.low', productId: 'p1' });

    const signature = signWebhookPayload(secret, timestamp, payload);
    expect(signature).toContain(`t=${timestamp},v1=`);

    const isValid = verifyWebhookSignature(secret, signature, payload);
    expect(isValid).toBe(true);
  });

  it('should reject expired or tampered webhook signatures', () => {
    const secret = 'whsec_testsecret123456';
    const timestamp = Math.floor(Date.now() / 1000) - 400; // 400s old (exceeds 300s max age)
    const payload = JSON.stringify({ event: 'stock.low' });

    const signature = signWebhookPayload(secret, timestamp, payload);
    const isValid = verifyWebhookSignature(secret, signature, payload);
    expect(isValid).toBe(false);
  });
});
