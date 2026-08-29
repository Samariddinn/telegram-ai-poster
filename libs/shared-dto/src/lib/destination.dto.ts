import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDestinationDto {
  @IsString()
  botCredentialId!: string;

  @IsString()
  @MinLength(1)
  chatId!: string;

  @IsString()
  @MinLength(1)
  title!: string;
}

export class SendTestMessageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;
}

export interface DetectedChat {
  chatId: string;
  title: string;
  type: string; // 'private' | 'group' | 'supergroup' | 'channel'
}

export interface DestinationResponse {
  id: string;
  botCredentialId: string;
  chatId: string;
  title: string;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DestinationValidationResult {
  valid: boolean;
  message: string;
}

export interface CreateDestinationResponse {
  destination: DestinationResponse;
  verification: DestinationValidationResult;
}

export interface DestinationDeleteBlocker {
  type: 'workflow';
  id: string;
  name: string;
}
