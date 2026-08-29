import { ExecutionErrorStage, ExecutionStatus, ExecutionTrigger } from '@prisma/client';

export interface ExecutionResponse {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  trigger: ExecutionTrigger;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  generatedText: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  telegramMessageId: string | null;
  errorStage: ExecutionErrorStage | null;
  errorMessage: string | null;
}
