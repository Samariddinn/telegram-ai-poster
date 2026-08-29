import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@telegram-ai-poster/prisma';
import { ADAPTERS, assemblePrompt, getRecentSuccessfulPosts, sanitizeOutput } from '@telegram-ai-poster/execution';
import { PreviewGenerationDto, PreviewResponse } from '@telegram-ai-poster/shared-dto';
import { CredentialsService } from '../credentials/credentials.service';

const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 500;

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
  ) {}

  /** Generation only — never sends anywhere, never writes an Execution record. */
  async preview(userId: string, dto: PreviewGenerationDto): Promise<PreviewResponse> {
    const { apiKey, provider } = await this.credentials.getDecryptedLlmKey(userId, dto.llmCredentialId);

    const recentPosts = dto.workflowId
      ? await this.getRecentSuccessfulPosts(userId, dto.workflowId, dto.contextWindow ?? DEFAULT_CONTEXT_WINDOW)
      : [];

    const prompt = assemblePrompt({
      systemPrompt: dto.systemPrompt,
      userPrompt: dto.userPrompt,
      recentPosts,
    });

    const generate = ADAPTERS[provider];
    const result = await generate({
      apiKey,
      model: dto.model,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      temperature: dto.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: dto.maxTokens ?? DEFAULT_MAX_TOKENS,
    });

    return {
      text: result.text,
      sanitizedText: sanitizeOutput(result.text),
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  }

  private async getRecentSuccessfulPosts(userId: string, workflowId: string, limit: number): Promise<string[]> {
    const workflow = await this.prisma.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow || workflow.userId !== userId) {
      throw new BadRequestException('Workflow not found');
    }

    return getRecentSuccessfulPosts(this.prisma, workflowId, limit);
  }
}
