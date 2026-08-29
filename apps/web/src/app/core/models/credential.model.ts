export type CredentialType = 'TELEGRAM_BOT_TOKEN' | 'LLM_API_KEY';
export type LlmProvider = 'OPENAI' | 'ANTHROPIC' | 'GEMINI';

export interface Credential {
  id: string;
  type: CredentialType;
  provider: LlmProvider | null;
  label: string;
  displayHint: string;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCredentialPayload {
  type: CredentialType;
  provider?: LlmProvider;
  label: string;
  secret: string;
}

export interface CredentialValidationResult {
  valid: boolean;
  message: string;
}

export interface CreateCredentialResponse {
  credential: Credential;
  validation: CredentialValidationResult;
}

export interface CredentialDeleteBlocker {
  type: 'destination' | 'workflow';
  id: string;
  name: string;
}
