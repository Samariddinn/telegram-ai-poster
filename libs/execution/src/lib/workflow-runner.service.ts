import { Injectable } from '@nestjs/common';
import { CredentialType, ExecutionErrorStage, ExecutionStatus, ExecutionTrigger, LlmProvider, Workflow } from '@prisma/client';
import { PrismaService } from '@telegram-ai-poster/prisma';
import { ExecutionResponse } from '@telegram-ai-poster/shared-dto';
import { EncryptionService } from './encryption.service';
import { ADAPTERS } from './generation/adapters';
import { assemblePrompt } from './generation/prompt-assembly';
import { getRecentSuccessfulPosts } from './generation/recent-posts';
import { SchedulerService } from './scheduler/scheduler.service';
import { TelegramService } from './telegram/telegram.service';

const AUTO_DISABLE_THRESHOLD = 5;

/** Thrown with the layer that failed attached, so it lands in Execution.errorStage (docs §2). */
class StagedError extends Error {
  constructor(
    readonly stage: ExecutionErrorStage,
    message: string,
  ) {
    super(message);
  }
}

export interface RunResult {
  /** null only if the workflow no longer existed when this run started — nothing to attach an execution record to. */
  execution: ExecutionResponse | null;
  workflow: Workflow | null;
  /** True if this run pushed consecutiveFailures to the auto-disable threshold. */
  autoDisabled: boolean;
}

/**
 * The core execution loop (docs §6) — reload the workflow fresh, decrypt
 * secrets, generate, sanitize/split/send, close the execution record, then
 * update workflow state. Shared by the api process (manual "Run now") and
 * the worker process (scheduled runs); `trigger` controls the two
 * behaviors that differ between them: the enabled-flag guard and the
 * failure-streak/auto-disable bookkeeping only apply to SCHEDULED runs
 * (docs §6 step 3, §6 "Manual runs never touch the failure streak").
 */
@Injectable()
export class WorkflowRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly telegram: TelegramService,
    private readonly scheduler: SchedulerService,
  ) {}

  async run(workflowId: string, trigger: ExecutionTrigger): Promise<RunResult> {
    // Reload the workflow fresh first (docs §6 step 2) — deliberately
    // ahead of opening the execution record (step 1). Execution.workflowId
    // is a hard FK, so if the workflow no longer exists (deleted out-of-band,
    // or a stray already-materialized job that outlived its schedule's
    // removal — BullMQ doesn't retroactively cancel a job that was already
    // enqueued before `removeJobScheduler`) there's nothing valid to attach
    // an execution record to. Clean up the stray schedule and stop instead
    // of crashing on a foreign key violation.
    const workflow = await this.prisma.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow) {
      if (trigger === ExecutionTrigger.SCHEDULED) {
        await this.scheduler.deregisterSchedule(workflowId);
      }
      return { execution: null, workflow: null, autoDisabled: false };
    }

    // 1. Open an execution record before doing anything else.
    const execution = await this.prisma.execution.create({
      data: { workflowId, status: ExecutionStatus.PENDING, trigger },
    });
    const startedAt = Date.now();

    // 3. Check the enabled flag — belt-and-braces guard against a schedule
    // that outlived its deregistration. Manual runs bypass this on purpose.
    if (trigger === ExecutionTrigger.SCHEDULED && !workflow.enabled) {
      const finished = await this.prisma.execution.update({
        where: { id: execution.id },
        data: { status: ExecutionStatus.SKIPPED, finishedAt: new Date(), durationMs: Date.now() - startedAt },
      });
      return { execution: this.toResponse(finished), workflow, autoDisabled: false };
    }

    try {
      const destination = await this.prisma.destination.findUnique({ where: { id: workflow.destinationId } });
      if (!destination) {
        throw new StagedError(ExecutionErrorStage.INTERNAL, 'Destination not found');
      }

      // 4. Decrypt both secrets.
      const [{ apiKey, provider }, botToken] = await Promise.all([
        this.decryptLlmCredential(workflow.llmCredentialId).catch((err) => {
          throw new StagedError(ExecutionErrorStage.INTERNAL, this.describe(err));
        }),
        this.decryptBotToken(destination.botCredentialId).catch((err) => {
          throw new StagedError(ExecutionErrorStage.INTERNAL, this.describe(err));
        }),
      ]);

      // 5. Assemble the prompt including anti-repetition context.
      const recentPosts = await getRecentSuccessfulPosts(this.prisma, workflowId, workflow.contextWindow);
      const prompt = assemblePrompt({
        systemPrompt: workflow.systemPrompt ?? undefined,
        userPrompt: workflow.userPrompt,
        recentPosts,
      });

      // 6. Call the LLM (adapters carry their own ~60s hard timeout).
      const generation = await ADAPTERS[provider]({
        apiKey,
        model: workflow.model,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        temperature: workflow.temperature,
        maxTokens: workflow.maxTokens,
      }).catch((err) => {
        throw new StagedError(ExecutionErrorStage.LLM, this.describe(err));
      });

      if (!generation.text.trim()) {
        // Surface this as an LLM-stage failure now — otherwise it reaches
        // Telegram as an empty message and fails there with a much more
        // confusing "message text is empty" error.
        throw new StagedError(
          ExecutionErrorStage.LLM,
          'The model returned an empty response. Try adjusting the prompt, raising max tokens, or a different model.',
        );
      }

      // 7 & 8. Sanitize, split, and send to Telegram sequentially.
      const sendResult = await this.telegram.send(botToken, destination.chatId, generation.text).catch((err) => {
        throw new StagedError(ExecutionErrorStage.TELEGRAM, this.describe(err));
      });

      // 9. Close the execution record.
      const finished = await this.prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.SUCCESS,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          generatedText: generation.text,
          promptTokens: generation.promptTokens,
          completionTokens: generation.completionTokens,
          telegramMessageId: sendResult.messageIds.join(','),
        },
      });

      // 10. Update workflow state. Manual runs never touch the failure streak
      // (or nextRunAt — that's the schedule's business, not a one-off run's).
      const updatedWorkflow = await this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          lastRunAt: new Date(),
          ...(trigger === ExecutionTrigger.SCHEDULED
            ? { consecutiveFailures: 0, nextRunAt: new Date(Date.now() + workflow.intervalMinutes * 60_000) }
            : {}),
        },
      });

      return { execution: this.toResponse(finished), workflow: updatedWorkflow, autoDisabled: false };
    } catch (err) {
      const staged =
        err instanceof StagedError ? err : new StagedError(ExecutionErrorStage.INTERNAL, this.describe(err));

      const finished = await this.prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.FAILED,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          errorStage: staged.stage,
          errorMessage: staged.message,
        },
      });

      let autoDisabled = false;
      const updateData: {
        lastRunAt: Date;
        consecutiveFailures?: number;
        enabled?: boolean;
        scheduleKey?: null;
        nextRunAt?: Date | null;
      } = {
        lastRunAt: new Date(),
      };

      // Consecutive failures and auto-disable only apply to scheduled runs
      // (docs §6: "Manual runs never touch the failure streak").
      if (trigger === ExecutionTrigger.SCHEDULED) {
        const newCount = workflow.consecutiveFailures + 1;
        updateData.consecutiveFailures = newCount;
        if (newCount >= AUTO_DISABLE_THRESHOLD) {
          updateData.enabled = false;
          updateData.scheduleKey = null;
          updateData.nextRunAt = null;
          autoDisabled = true;
        } else {
          updateData.nextRunAt = new Date(Date.now() + workflow.intervalMinutes * 60_000);
        }
      }

      const updatedWorkflow = await this.prisma.workflow.update({ where: { id: workflowId }, data: updateData });

      if (autoDisabled) {
        await this.scheduler.deregisterSchedule(workflow.scheduleKey);
      }

      return { execution: this.toResponse(finished), workflow: updatedWorkflow, autoDisabled };
    }
  }

  private async decryptLlmCredential(credentialId: string): Promise<{ apiKey: string; provider: LlmProvider }> {
    const credential = await this.prisma.credential.findUniqueOrThrow({ where: { id: credentialId } });
    if (credential.type !== CredentialType.LLM_API_KEY || !credential.provider) {
      throw new Error('Credential is not an LLM API key');
    }
    const apiKey = this.encryption.decrypt({
      encryptedSecret: credential.encryptedSecret,
      iv: credential.iv,
      authTag: credential.authTag,
    });
    return { apiKey, provider: credential.provider };
  }

  private async decryptBotToken(credentialId: string): Promise<string> {
    const credential = await this.prisma.credential.findUniqueOrThrow({ where: { id: credentialId } });
    if (credential.type !== CredentialType.TELEGRAM_BOT_TOKEN) {
      throw new Error('Credential is not a Telegram bot token');
    }
    return this.encryption.decrypt({
      encryptedSecret: credential.encryptedSecret,
      iv: credential.iv,
      authTag: credential.authTag,
    });
  }

  private describe(err: unknown): string {
    return err instanceof Error ? err.message : 'Unknown error';
  }

  private toResponse(execution: {
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
  }): ExecutionResponse {
    return { ...execution };
  }
}
