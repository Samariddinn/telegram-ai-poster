import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV, recommended for GCM
const KEY_LENGTH = 32; // AES-256

export interface EncryptedPayload {
  encryptedSecret: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

/**
 * AES-256-GCM at rest for credential secrets. The key never touches the
 * database — it lives only in CREDENTIALS_ENCRYPTION_KEY. Each secret gets
 * its own IV and auth tag, stored alongside the ciphertext (see the
 * Credential model). Shared between the api process (validate/create) and
 * the worker process (decrypt at execution time) — both need the same key.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY');
    if (!raw) {
      throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set');
    }

    const key = Buffer.from(raw, 'base64');
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `CREDENTIALS_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
      );
    }

    this.key = key;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      encryptedSecret: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.encryptedSecret, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
