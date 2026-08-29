import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CredentialsService } from '../../core/services/credentials.service';
import { DestinationsService } from '../../core/services/destinations.service';
import { WorkflowsService } from '../../core/services/workflows.service';
import { LlmProvider } from '../../core/models/credential.model';
import {
  ExecutionResult,
  INTERVAL_PRESETS,
  MODEL_OPTIONS,
  PreviewResponse,
  Workflow,
  WorkflowFormValue,
} from '../../core/models/workflow.model';

const DEFAULT_FORM: WorkflowFormValue = {
  name: '',
  systemPrompt: '',
  userPrompt: '',
  llmCredentialId: '',
  model: '',
  temperature: 0.7,
  maxTokens: 500,
  destinationId: '',
  intervalMinutes: 90,
  contextWindow: 5,
};

@Component({
  selector: 'app-workflow-editor',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './workflow-editor.component.html',
})
export class WorkflowEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly workflows = inject(WorkflowsService);
  readonly credentials = inject(CredentialsService);
  readonly destinations = inject(DestinationsService);

  readonly llmCredentials = computed(() => this.credentials.credentials().filter((c) => c.type === 'LLM_API_KEY'));
  readonly intervalPresets = INTERVAL_PRESETS;

  readonly workflowId = signal<string | null>(null);
  readonly isEditing = computed(() => this.workflowId() !== null);

  readonly customInterval = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly selectedProvider = signal<LlmProvider | null>(null);
  readonly customModel = signal(false);
  readonly modelOptions = computed(() => {
    const provider = this.selectedProvider();
    return provider ? MODEL_OPTIONS[provider] : [];
  });

  readonly previewing = signal(false);
  readonly previewError = signal<string | null>(null);
  readonly previewResult = signal<PreviewResponse | null>(null);

  readonly running = signal(false);
  readonly runError = signal<string | null>(null);
  readonly runResult = signal<ExecutionResult | null>(null);

  form: WorkflowFormValue = { ...DEFAULT_FORM };

  async ngOnInit(): Promise<void> {
    await Promise.all([this.credentials.refresh(), this.destinations.refresh()]);

    const id = this.route.snapshot.paramMap.get('id');
    if (!id || id === 'new') {
      this.form = {
        ...DEFAULT_FORM,
        llmCredentialId: this.llmCredentials()[0]?.id ?? '',
        destinationId: this.destinations.destinations()[0]?.id ?? '',
      };
      this.onCredentialChange();
      return;
    }

    this.workflowId.set(id);
    await this.workflows.refresh();
    const workflow = this.workflows.workflows().find((w) => w.id === id);
    if (workflow) {
      this.applyWorkflow(workflow);
    }
  }

  selectPreset(minutes: number): void {
    this.customInterval.set(false);
    this.form.intervalMinutes = minutes;
  }

  toggleCustomInterval(): void {
    this.customInterval.set(!this.customInterval());
  }

  /** Re-derives the model list from the newly selected credential's provider. */
  onCredentialChange(): void {
    const provider = this.credentials.credentials().find((c) => c.id === this.form.llmCredentialId)?.provider ?? null;
    this.selectedProvider.set(provider);

    const options = provider ? MODEL_OPTIONS[provider] : [];
    if (!this.customModel() && !options.includes(this.form.model)) {
      this.form.model = options[0] ?? '';
    }
  }

  toggleCustomModel(): void {
    this.customModel.set(!this.customModel());
    if (!this.customModel()) {
      const options = this.modelOptions();
      if (!options.includes(this.form.model)) {
        this.form.model = options[0] ?? '';
      }
    }
  }

  async runPreview(): Promise<void> {
    this.previewError.set(null);
    this.previewResult.set(null);
    this.previewing.set(true);
    try {
      const result = await this.workflows.preview({
        llmCredentialId: this.form.llmCredentialId,
        model: this.form.model,
        systemPrompt: this.form.systemPrompt || undefined,
        userPrompt: this.form.userPrompt,
        temperature: this.form.temperature,
        maxTokens: this.form.maxTokens,
        contextWindow: this.form.contextWindow,
        workflowId: this.workflowId() ?? undefined,
      });
      this.previewResult.set(result);
    } catch (err) {
      this.previewError.set(this.extractError(err));
    } finally {
      this.previewing.set(false);
    }
  }

  async runNow(): Promise<void> {
    const id = this.workflowId();
    if (!id) {
      return;
    }
    this.runError.set(null);
    this.runResult.set(null);
    this.running.set(true);
    try {
      const result = await this.workflows.runNow(id);
      this.runResult.set(result);
    } catch (err) {
      this.runError.set(this.extractError(err));
    } finally {
      this.running.set(false);
    }
  }

  async save(): Promise<void> {
    this.saveError.set(null);
    this.saving.set(true);
    try {
      const id = this.workflowId();
      if (id) {
        await this.workflows.update(id, this.form);
      } else {
        await this.workflows.create(this.form);
      }
      this.router.navigate(['/workflows']);
    } catch (err) {
      this.saveError.set(this.extractError(err));
    } finally {
      this.saving.set(false);
    }
  }

  private applyWorkflow(workflow: Workflow): void {
    this.form = {
      name: workflow.name,
      systemPrompt: workflow.systemPrompt ?? '',
      userPrompt: workflow.userPrompt,
      llmCredentialId: workflow.llmCredentialId,
      model: workflow.model,
      temperature: workflow.temperature,
      maxTokens: workflow.maxTokens,
      destinationId: workflow.destinationId,
      intervalMinutes: workflow.intervalMinutes,
      contextWindow: workflow.contextWindow,
    };
    this.customInterval.set(!this.intervalPresets.some((p) => p.minutes === workflow.intervalMinutes));

    const provider = this.credentials.credentials().find((c) => c.id === workflow.llmCredentialId)?.provider ?? null;
    this.selectedProvider.set(provider);
    // If the saved model isn't in the curated list (e.g. set before this list existed,
    // or a newer model release), keep it editable as free text rather than silently swapping it.
    this.customModel.set(provider ? !MODEL_OPTIONS[provider].includes(workflow.model) : true);
  }

  private extractError(err: unknown): string {
    const httpError = err as { error?: { message?: string | string[] } };
    const message = httpError?.error?.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    return message ?? 'Something went wrong. Please try again.';
  }
}
