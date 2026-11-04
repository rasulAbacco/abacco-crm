import { describe, it, expect } from 'vitest';
import { encryptJson, decryptJson } from '../../src/services/encryption/encryptionService.js';

describe('SMTP credential encryption (AES-256-GCM)', () => {
  it('round-trips and never stores plaintext', () => {
    const box = encryptJson({ password: 'app-password-123' }, 'smtp:abc');
    expect(box.ciphertext).not.toContain('app-password');
    expect(box.keyVersion).toBe(1);
    expect(decryptJson(box, 'smtp:abc')).toEqual({ password: 'app-password-123' });
  });

  it('uses a fresh IV every time', () => {
    const a = encryptJson({ password: 'x' });
    const b = encryptJson({ password: 'x' });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('detects tampering and a wrong record binding', () => {
    const box = encryptJson({ password: 'secret' }, 'smtp:abc');
    const tampered = { ...box, ciphertext: Buffer.from('AAAA' + box.ciphertext.slice(4), 'base64').toString('base64') };
    expect(() => decryptJson(tampered, 'smtp:abc')).toThrow();
    expect(() => decryptJson(box, 'smtp:other')).toThrow();
  });
});
