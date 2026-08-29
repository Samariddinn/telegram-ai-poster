export interface Destination {
  id: string;
  botCredentialId: string;
  chatId: string;
  title: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDestinationPayload {
  botCredentialId: string;
  chatId: string;
  title: string;
}

export interface DestinationValidationResult {
  valid: boolean;
  message: string;
}

export interface CreateDestinationResponse {
  destination: Destination;
  verification: DestinationValidationResult;
}

export interface DetectedChat {
  chatId: string;
  title: string;
  type: string;
}

export interface DestinationDeleteBlocker {
  type: 'workflow';
  id: string;
  name: string;
}
