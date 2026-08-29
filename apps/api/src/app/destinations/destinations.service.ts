import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@telegram-ai-poster/prisma';
import {
  CreateDestinationDto,
  CreateDestinationResponse,
  DestinationDeleteBlocker,
  DestinationResponse,
  DestinationValidationResult,
  DetectedChat,
} from '@telegram-ai-poster/shared-dto';
import { TelegramService } from '@telegram-ai-poster/execution';
import { CredentialsService } from '../credentials/credentials.service';

const DEFAULT_TEST_MESSAGE =
  'This is a test message from <b>Telegram AI Poster</b>. If you can see this, the bot is configured correctly ✅';

@Injectable()
export class DestinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly telegram: TelegramService,
  ) {}

  async detect(userId: string, botCredentialId: string): Promise<DetectedChat[]> {
    if (!botCredentialId) {
      throw new BadRequestException('botCredentialId is required');
    }
    const token = await this.credentials.getDecryptedBotToken(userId, botCredentialId);
    return this.telegram.detectChats(token);
  }

  async create(userId: string, dto: CreateDestinationDto): Promise<CreateDestinationResponse> {
    // Confirms the credential is owned by this user and is a bot token — throws otherwise.
    await this.credentials.getDecryptedBotToken(userId, dto.botCredentialId);

    const existing = await this.prisma.destination.findUnique({
      where: { botCredentialId_chatId: { botCredentialId: dto.botCredentialId, chatId: dto.chatId } },
    });
    if (existing) {
      throw new ConflictException('This bot is already registered for this chat');
    }

    const destination = await this.prisma.destination.create({
      data: {
        userId,
        botCredentialId: dto.botCredentialId,
        chatId: dto.chatId,
        title: dto.title,
      },
    });

    // Immediately proves posting actually works, not just that the chat id looks plausible.
    const verification = await this.sendTest(userId, destination.id, DEFAULT_TEST_MESSAGE);
    const stored = await this.findOwned(userId, destination.id);
    return { destination: this.toResponse(stored), verification };
  }

  async findAllForUser(userId: string): Promise<DestinationResponse[]> {
    const destinations = await this.prisma.destination.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return destinations.map((d) => this.toResponse(d));
  }

  async sendTest(userId: string, id: string, text?: string): Promise<DestinationValidationResult> {
    const destination = await this.findOwned(userId, id);
    const token = await this.credentials.getDecryptedBotToken(userId, destination.botCredentialId);

    try {
      const { usedChatId } = await this.telegram.send(token, destination.chatId, text?.trim() || DEFAULT_TEST_MESSAGE);

      await this.prisma.destination.update({
        where: { id },
        data: { verifiedAt: new Date(), ...(usedChatId !== destination.chatId ? { chatId: usedChatId } : {}) },
      });

      return {
        valid: true,
        message:
          usedChatId !== destination.chatId
            ? `Sent successfully. Chat id was normalized to ${usedChatId} (supergroup ids must be negative).`
            : 'Sent successfully',
      };
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : 'Failed to send message' };
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);

    const workflows = await this.prisma.workflow.findMany({
      where: { destinationId: id },
      select: { id: true, name: true },
    });
    if (workflows.length > 0) {
      throw new ConflictException({
        message: 'Destination is still in use and cannot be deleted',
        blockers: workflows.map((w): DestinationDeleteBlocker => ({ type: 'workflow', id: w.id, name: w.name })),
      });
    }

    await this.prisma.destination.delete({ where: { id } });
  }

  private async findOwned(userId: string, id: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id } });
    if (!destination || destination.userId !== userId) {
      throw new NotFoundException('Destination not found');
    }
    return destination;
  }

  private toResponse(destination: {
    id: string;
    botCredentialId: string;
    chatId: string;
    title: string;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): DestinationResponse {
    return {
      id: destination.id,
      botCredentialId: destination.botCredentialId,
      chatId: destination.chatId,
      title: destination.title,
      verifiedAt: destination.verifiedAt,
      createdAt: destination.createdAt,
      updatedAt: destination.updatedAt,
    };
  }
}
