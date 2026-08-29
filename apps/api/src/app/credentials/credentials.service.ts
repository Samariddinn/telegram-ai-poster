import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@telegram-ai-poster/prisma';
import { CredentialType, LlmProvider } from '@prisma/client';
import {
  CreateCredentialDto,
  CreateCredentialResponse,
  CredentialDeleteBlocker,
  CredentialResponse,
  CredentialValidationResult,
} from '@telegram-ai-poster/shared-dto';
import { EncryptionService } from '@telegram-ai-poster/execution';
import { validateAnthropicKey, validateGeminiKey, validateOpenAiKey } from './validators/llm.validator';
import { validateTelegramBotToken } from './validators/telegram.validator';

const DISPLAY_HINT_LENGTH = 4;

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async create(userId: string, dto: CreateCredentialDto): Promise<CreateCredentialResponse> {
    if (dto.type === CredentialType.LLM_API_KEY && !dto.provider) {
      throw new BadRequestException('provider is required for LLM_API_KEY credentials');
    }
    if (dto.type === CredentialType.TELEGRAM_BOT_TOKEN && dto.provider) {
      throw new BadRequestException('provider must not be set for TELEGRAM_BOT_TOKEN credentials');
    }

    const { encryptedSecret, iv, authTag } = this.encryption.encrypt(dto.secret);

    const credential = await this.prisma.credential.create({
      data: {
        userId,
        type: dto.type,
        provider: dto.provider ?? null,
        label: dto.label,
        displayHint: dto.secret.slice(-DISPLAY_HINT_LENGTH),
        encryptedSecret,
        iv,
        authTag,
      },
    });

    // Validate immediately so a bad key is a two-second fix, not a silent
    // failure discovered days later at execution time.
    const validation = await this.runValidation(dto.type, dto.provider ?? null, dto.secret);
    if (validation.valid) {
      await this.prisma.credential.update({
        where: { id: credential.id },
        data: { lastValidatedAt: new Date() },
      });
    }

    const stored = await this.prisma.credential.findUniqueOrThrow({ where: { id: credential.id } });
    return { credential: this.toResponse(stored), validation };
  }

  async findAllForUser(userId: string): Promise<CredentialResponse[]> {
    const credentials = await this.prisma.credential.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return credentials.map((c) => this.toResponse(c));
  }

  /** Used by DestinationsService — decrypts a Telegram bot token the caller owns. */
  async getDecryptedBotToken(userId: string, credentialId: string): Promise<string> {
    const credential = await this.findOwned(userId, credentialId);
    if (credential.type !== CredentialType.TELEGRAM_BOT_TOKEN) {
      throw new BadRequestException('Credential is not a Telegram bot token');
    }

    return this.encryption.decrypt({
      encryptedSecret: credential.encryptedSecret,
      iv: credential.iv,
      authTag: credential.authTag,
    });
  }

  /** Used by GenerationService — decrypts an LLM API key the caller owns. */
  async getDecryptedLlmKey(userId: string, credentialId: string): Promise<{ apiKey: string; provider: LlmProvider }> {
    const credential = await this.findOwned(userId, credentialId);
    if (credential.type !== CredentialType.LLM_API_KEY || !credential.provider) {
      throw new BadRequestException('Credential is not an LLM API key');
    }

    const apiKey = this.encryption.decrypt({
      encryptedSecret: credential.encryptedSecret,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    return { apiKey, provider: credential.provider };
  }

  async validate(userId: string, id: string): Promise<CredentialValidationResult> {
    const credential = await this.findOwned(userId, id);
    const secret = this.encryption.decrypt({
      encryptedSecret: credential.encryptedSecret,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    const result = await this.runValidation(credential.type, credential.provider, secret);

    await this.prisma.credential.update({
      where: { id },
      data: result.valid ? { lastValidatedAt: new Date() } : {},
    });

    return result;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);

    const blockers = await this.findBlockers(id);
    if (blockers.length > 0) {
      throw new ConflictException({
        message: 'Credential is still in use and cannot be deleted',
        blockers,
      });
    }

    await this.prisma.credential.delete({ where: { id } });
  }

  private async findBlockers(credentialId: string): Promise<CredentialDeleteBlocker[]> {
    const [destinations, workflows] = await Promise.all([
      this.prisma.destination.findMany({
        where: { botCredentialId: credentialId },
        select: { id: true, title: true },
      }),
      this.prisma.workflow.findMany({
        where: { llmCredentialId: credentialId },
        select: { id: true, name: true },
      }),
    ]);

    return [
      ...destinations.map((d): CredentialDeleteBlocker => ({ type: 'destination', id: d.id, name: d.title })),
      ...workflows.map((w): CredentialDeleteBlocker => ({ type: 'workflow', id: w.id, name: w.name })),
    ];
  }

  private async findOwned(userId: string, id: string) {
    const credential = await this.prisma.credential.findUnique({ where: { id } });
    if (!credential || credential.userId !== userId) {
      throw new NotFoundException('Credential not found');
    }
    return credential;
  }

  private runValidation(
    type: CredentialType,
    provider: LlmProvider | null,
    secret: string,
  ): Promise<CredentialValidationResult> {
    if (type === CredentialType.TELEGRAM_BOT_TOKEN) {
      return validateTelegramBotToken(secret);
    }

    switch (provider) {
      case LlmProvider.OPENAI:
        return validateOpenAiKey(secret);
      case LlmProvider.ANTHROPIC:
        return validateAnthropicKey(secret);
      case LlmProvider.GEMINI:
        return validateGeminiKey(secret);
      default:
        return Promise.resolve({ valid: false, message: 'Unknown LLM provider' });
    }
  }

  private toResponse(credential: {
    id: string;
    type: CredentialType;
    provider: LlmProvider | null;
    label: string;
    displayHint: string;
    lastValidatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): CredentialResponse {
    return {
      id: credential.id,
      type: credential.type,
      provider: credential.provider,
      label: credential.label,
      displayHint: credential.displayHint,
      lastValidatedAt: credential.lastValidatedAt,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }
}
