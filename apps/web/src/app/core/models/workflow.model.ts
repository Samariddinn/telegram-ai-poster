import { LlmProvider } from './credential.model';

export type ParseMode = 'HTML' | 'MARKDOWN_V2';

// Curated, known-valid model ids per provider — avoids the free-text typo
// that produces opaque provider errors (e.g. Gemini's "unexpected model
// name format"). "Custom" stays available in the UI as an escape hatch.
export const MODEL_OPTIONS: Record<LlmProvider, string[]> = {
  OPENAI: ['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
  ANTHROPIC: ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-haiku-4-5-20251001'],
  GEMINI: ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'],
};

export interface Workflow {
  id: string;
  name: string;
  systemPrompt: string | null;
  userPrompt: string;
  llmCredentialId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  destinationId: string;
  parseMode: ParseMode;
  intervalMinutes: number;
  contextWindow: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowFormValue {
  name: string;
  systemPrompt: string;
  userPrompt: string;
  llmCredentialId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  destinationId: string;
  intervalMinutes: number;
  contextWindow: number;
}

export interface PreviewPayload {
  llmCredentialId: string;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  workflowId?: string;
}

export interface PreviewResponse {
  text: string;
  sanitizedText: string;
  promptTokens: number;
  completionTokens: number;
}

export type ExecutionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type ExecutionErrorStage = 'LLM' | 'TELEGRAM' | 'INTERNAL';

export interface ExecutionResult {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  trigger: 'SCHEDULED' | 'MANUAL';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  generatedText: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  telegramMessageId: string | null;
  errorStage: ExecutionErrorStage | null;
  errorMessage: string | null;
}

export const INTERVAL_PRESETS: { label: string; minutes: number }[] = [
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '90 min', minutes: 90 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '24 hours', minutes: 1440 },
];
