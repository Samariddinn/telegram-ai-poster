import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateDestinationPayload,
  CreateDestinationResponse,
  Destination,
  DestinationValidationResult,
  DetectedChat,
} from '../models/destination.model';

@Injectable({ providedIn: 'root' })
export class DestinationsService {
  private readonly http = inject(HttpClient);

  private readonly destinationsSignal = signal<Destination[]>([]);
  private readonly loadingSignal = signal(false);

  readonly destinations = this.destinationsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  async refresh(): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const destinations = await firstValueFrom(
        this.http.get<Destination[]>(`${environment.apiUrl}/destinations`),
      );
      this.destinationsSignal.set(destinations);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  detect(botCredentialId: string): Promise<DetectedChat[]> {
    return firstValueFrom(
      this.http.get<DetectedChat[]>(`${environment.apiUrl}/destinations/detect`, {
        params: { botCredentialId },
      }),
    );
  }

  async create(payload: CreateDestinationPayload): Promise<CreateDestinationResponse> {
    const response = await firstValueFrom(
      this.http.post<CreateDestinationResponse>(`${environment.apiUrl}/destinations`, payload),
    );
    this.destinationsSignal.update((current) => [response.destination, ...current]);
    return response;
  }

  async sendTest(id: string, text?: string): Promise<DestinationValidationResult> {
    const result = await firstValueFrom(
      this.http.post<DestinationValidationResult>(`${environment.apiUrl}/destinations/${id}/test`, { text }),
    );
    if (result.valid) {
      this.destinationsSignal.update((current) =>
        current.map((d) => (d.id === id ? { ...d, verifiedAt: new Date().toISOString() } : d)),
      );
    }
    return result;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/destinations/${id}`));
    this.destinationsSignal.update((current) => current.filter((d) => d.id !== id));
  }
}
