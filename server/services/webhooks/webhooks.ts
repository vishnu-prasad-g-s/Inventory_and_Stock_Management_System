import { createHmac } from 'crypto';

export function signWebhookPayload(secret: string, timestampSec: number, payloadBody: string): string {
  const signaturePayload = `${timestampSec}.${payloadBody}`;
  const hmac = createHmac('sha256', secret).update(signaturePayload).digest('hex');
  return `t=${timestampSec},v1=${hmac}`;
}

export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string,
  payloadBody: string,
  maxAgeSec = 300
): boolean {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',');
  const tPart = parts.find((p) => p.startsWith('t='));
  const v1Part = parts.find((p) => p.startsWith('v1='));

  if (!tPart || !v1Part) return false;

  const timestampSec = parseInt(tPart.split('=')[1], 10);
  const providedHmac = v1Part.split('=')[1];

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > maxAgeSec) {
    return false; // Signature expired
  }

  const expectedSignature = signWebhookPayload(secret, timestampSec, payloadBody);
  const expectedHmac = expectedSignature.split('v1=')[1];

  return providedHmac === expectedHmac;
}
