import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CredentialsService } from '../../core/services/credentials.service';
import { DestinationsService } from '../../core/services/destinations.service';
import { WorkflowsService } from '../../core/services/workflows.service';
import { ExecutionResult } from '../../core/models/workflow.model';
import { formatInterval } from '../../shared/format-interval';

interface RunState {
  running: boolean;
  result: ExecutionResult | null;
  error: string | null;
}

const EMPTY_RUN_STATE: RunState = { running: false, result: null, error: null };

@Component({
  selector: 'app-workflows-list',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './workflows-list.component.html',
})
export class WorkflowsListComponent implements OnInit {
  readonly workflows = inject(WorkflowsService);
  readonly destinations = inject(DestinationsService);
  readonly credentials = inject(CredentialsService);

  readonly toggling = signal<Record<string, boolean>>({});
  readonly deleteError = signal<Record<string, string>>({});
  readonly runState = signal<Record<string, RunState>>({});

  ngOnInit(): void {
    void this.workflows.refresh();
    void this.destinations.refresh();
    void this.credentials.refresh();
  }

  destinationTitle(destinationId: string): string {
    return this.destinations.destinations().find((d) => d.id === destinationId)?.title ?? 'Unknown destination';
  }

  readonly formatInterval = formatInterval;

  async toggleEnabled(id: string, currentlyEnabled: boolean): Promise<void> {
    this.toggling.update((current) => ({ ...current, [id]: true }));
    try {
      await this.workflows.setEnabled(id, !currentlyEnabled);
    } finally {
      this.toggling.update((current) => ({ ...current, [id]: false }));
    }
  }

  async remove(id: string): Promise<void> {
    this.deleteError.update((current) => ({ ...current, [id]: '' }));
    try {
      await this.workflows.remove(id);
    } catch (err) {
      const httpError = err as { error?: { message?: string } };
      this.deleteError.update((current) => ({
        ...current,
        [id]: httpError?.error?.message ?? 'Failed to delete workflow',
      }));
    }
  }

  runFor(id: string): RunState {
    return this.runState()[id] ?? EMPTY_RUN_STATE;
  }

  async runNow(id: string): Promise<void> {
    this.patchRun(id, { running: true, result: null, error: null });
    try {
      const result = await this.workflows.runNow(id);
      this.patchRun(id, { running: false, result });
    } catch (err) {
      const httpError = err as { error?: { message?: string } };
      this.patchRun(id, { running: false, error: httpError?.error?.message ?? 'Failed to run workflow' });
    }
  }

  private patchRun(id: string, patch: Partial<RunState>): void {
    this.runState.update((current) => ({
      ...current,
      [id]: { ...this.runFor(id), ...patch },
    }));
  }
}
