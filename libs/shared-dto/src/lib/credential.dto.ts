import { CredentialType, LlmProvider } from '@prisma/client';
import { IsEnum, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateCredentialDto {
  @IsEnum(CredentialType)
  type!: CredentialType;

  // Required for LLM_API_KEY, forbidden for TELEGRAM_BOT_TOKEN.
  @ValidateIf((dto: CreateCredentialDto) => dto.type === CredentialType.LLM_API_KEY)
  @IsEnum(LlmProvider)
  provider?: LlmProvider;

  @IsString()
  @MinLength(1)
  label!: string;

  // Plaintext secret — encrypted immediately on receipt, never stored or echoed back as-is.
  @IsString()
  @MinLength(1)
  secret!: string;
}

export interface CredentialResponse {
  id: string;
  type: CredentialType;
  provider: LlmProvider | null;
  label: string;
  displayHint: string;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CredentialValidationResult {
  valid: boolean;
  message: string;
}

export interface CreateCredentialResponse {
  credential: CredentialResponse;
  validation: CredentialValidationResult;
}

export interface CredentialDeleteBlocker {
  type: 'destination' | 'workflow';
  id: string;
  name: string;
}
