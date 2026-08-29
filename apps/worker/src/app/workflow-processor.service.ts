import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionTrigger } from '@prisma/client';
import { SchedulerService, WorkflowRunnerService, WORKFLOW_QUEUE_NAME } from '@telegram-ai-poster/execution';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Consumes the workflow-executions queue. This is the only place scheduled
 * runs happen (docs §1: "the only place that decrypts secrets, calls LLM
 * providers, and calls Telegram"). Each job carries only a workflowId —
 * WorkflowRunnerService reloads everything fresh (docs §6 step 2).
 */
@Injectable()
export class WorkflowProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowProcessorService.name);
  private worker!: Worker<{ workflowId: string }>;
  private connection!: IORedis;

  constructor(
    private readonly config: ConfigService,
    private readonly runner: WorkflowRunnerService,
    // Unused directly — SchedulerService is where WorkflowRunnerService's
    // own auto-disable deregistration lives; injecting it here just keeps
    // this service's dependency graph explicit about what it relies on.
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL is not set');
    }
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });

    this.worker = new Worker<{ workflowId: string }>(
      WORKFLOW_QUEUE_NAME,
      async (job: Job<{ workflowId: string }>) => {
        this.logger.log(`Executing workflow ${job.data.workflowId} (scheduled)`);
        const { execution, workflow, autoDisabled } = await this.runner.run(job.data.workflowId, ExecutionTrigger.SCHEDULED);

        if (!workflow) {
          this.logger.warn(`Workflow ${job.data.workflowId} no longer exists — schedule cleaned up, nothing run`);
          return null;
        }

        if (autoDisabled) {
          this.logger.warn(
            `Workflow ${workflow.id} auto-disabled after ${workflow.consecutiveFailures} consecutive failures`,
          );
        }

        return execution;
      },
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} threw unexpectedly: ${err.message}`);
    });

    this.logger.log('Worker listening for workflow executions');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
