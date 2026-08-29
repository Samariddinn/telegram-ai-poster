import { ParseMode } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsString()
  @MinLength(1)
  userPrompt!: string;

  @IsString()
  llmCredentialId!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTokens?: number;

  @IsString()
  destinationId!: string;

  @IsOptional()
  @IsEnum(ParseMode)
  parseMode?: ParseMode;

  @IsInt()
  @Min(1)
  intervalMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  contextWindow?: number;
}

export class UpdateWorkflowDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() systemPrompt?: string;
  @IsOptional() @IsString() @MinLength(1) userPrompt?: string;
  @IsOptional() @IsString() llmCredentialId?: string;
  @IsOptional() @IsString() @MinLength(1) model?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @IsOptional() @IsInt() @Min(1) maxTokens?: number;
  @IsOptional() @IsString() destinationId?: string;
  @IsOptional() @IsEnum(ParseMode) parseMode?: ParseMode;
  @IsOptional() @IsInt() @Min(1) intervalMinutes?: number;
  @IsOptional() @IsInt() @Min(0) contextWindow?: number;
}

export class PreviewGenerationDto {
  @IsString()
  llmCredentialId!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsString()
  @MinLength(1)
  userPrompt!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  contextWindow?: number;

  // If set, pulls that workflow's real recent-successful-post history for
  // anti-repetition context. Omitted for a brand-new, not-yet-saved workflow.
  @IsOptional()
  @IsString()
  workflowId?: string;
}

export interface WorkflowResponse {
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
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreviewResponse {
  text: string;
  sanitizedText: string;
  promptTokens: number;
  completionTokens: number;
}
