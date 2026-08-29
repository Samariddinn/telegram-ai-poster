import { LlmProvider } from '@prisma/client';
import { GenerateFn } from './provider.interface';
import { generateWithAnthropic } from './providers/anthropic.provider';
import { generateWithGemini } from './providers/gemini.provider';
import { generateWithOpenAi } from './providers/openai.provider';

export const ADAPTERS: Record<LlmProvider, GenerateFn> = {
  [LlmProvider.OPENAI]: generateWithOpenAi,
  [LlmProvider.ANTHROPIC]: generateWithAnthropic,
  [LlmProvider.GEMINI]: generateWithGemini,
};
