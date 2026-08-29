import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExecutionTrigger, Workflow } from '@prisma/client';
import { PrismaService } from '@telegram-ai-poster/prisma';
import { SchedulerService, WorkflowRunnerService } from '@telegram-ai-poster/execution';
import { CreateWorkflowDto, ExecutionResponse, UpdateWorkflowDto, WorkflowResponse } from '@telegram-ai-poster/shared-dto';
import { CredentialsService } from '../credentials/credentials.service';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly scheduler: SchedulerService,
    private readonly runner: WorkflowRunnerService,
  ) {}

  async create(userId: string, dto: CreateWorkflowDto): Promise<WorkflowResponse> {
    await this.credentials.getDecryptedLlmKey(userId, dto.llmCredentialId);
    await this.assertOwnedDestination(userId, dto.destinationId);

    // Always created disabled — enabling is a separate, explicit action (docs §5)
    // so a half-configured workflow can't start posting to a real group by accident.
    const workflow = await this.prisma.workflow.create({
      data: { userId, ...dto, enabled: false },
    });
    return this.toResponse(workflow);
  }

  async findAllForUser(userId: string): Promise<WorkflowResponse[]> {
    const workflows = await this.prisma.workflow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return workflows.map((w) => this.toResponse(w));
  }

  async update(userId: string, id: string, dto: UpdateWorkflowDto): Promise<WorkflowResponse> {
    const existing = await this.findOwned(userId, id);
    if (dto.llmCredentialId) {
      await this.credentials.getDecryptedLlmKey(userId, dto.llmCredentialId);
    }
    if (dto.destinationId) {
      await this.assertOwnedDestination(userId, dto.destinationId);
    }

    let scheduleKey = existing.scheduleKey;
    let nextRunAt = existing.nextRunAt;

    // Rule 1 (docs §5): every mutation is remove-then-add. An interval
    // change on an already-enabled workflow always replaces the old
    // schedule with the new one — other field changes don't touch the
    // schedule since the worker reloads the workflow fresh on every fire
    // anyway (docs §6 step 2).
    if (existing.enabled && dto.intervalMinutes !== undefined && dto.intervalMinutes !== existing.intervalMinutes) {
      scheduleKey = await this.scheduler.registerSchedule(id, dto.intervalMinutes);
      nextRunAt = new Date(Date.now() + dto.intervalMinutes * 60_000);
    }

    const workflow = await this.prisma.workflow.update({ where: { id }, data: { ...dto, scheduleKey, nextRunAt } });
    return this.toResponse(workflow);
  }

  /**
   * Registers/deregisters the Redis schedule to match, and stores the
   * returned schedule key so removal is always possible (docs §5 Rule 1).
   */
  async setEnabled(userId: string, id: string, enabled: boolean): Promise<WorkflowResponse> {
    const workflow = await this.findOwned(userId, id);
    if (workflow.enabled === enabled) {
      return this.toResponse(workflow);
    }

    if (enabled) {
      const scheduleKey = await this.scheduler.registerSchedule(id, workflow.intervalMinutes);
      const updated = await this.prisma.workflow.update({
        where: { id },
        data: {
          enabled: true,
          scheduleKey,
          nextRunAt: new Date(Date.now() + workflow.intervalMinutes * 60_000),
        },
      });
      return this.toResponse(updated);
    }

    await this.scheduler.deregisterSchedule(workflow.scheduleKey);
    const updated = await this.prisma.workflow.update({
      where: { id },
      data: { enabled: false, scheduleKey: null, nextRunAt: null },
    });
    return this.toResponse(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const workflow = await this.findOwned(userId, id);
    if (workflow.enabled) {
      await this.scheduler.deregisterSchedule(workflow.scheduleKey);
    }
    await this.prisma.workflow.delete({ where: { id } });
  }

  /** "Run now" (docs §9) — ownership check here, the actual core loop lives in the shared lib. */
  async runManual(userId: string, id: string): Promise<ExecutionResponse> {
    await this.findOwned(userId, id);
    const { execution } = await this.runner.run(id, ExecutionTrigger.MANUAL);
    // findOwned() just confirmed the workflow exists — execution should
    // never be null here. Only a genuinely impossible race (deleted in the
    // instant between the two calls) would trip this.
    if (!execution) {
      throw new NotFoundException('Workflow not found');
    }
    return execution;
  }

  private async assertOwnedDestination(userId: string, destinationId: string): Promise<void> {
    const destination = await this.prisma.destination.findUnique({ where: { id: destinationId } });
    if (!destination || destination.userId !== userId) {
      throw new BadRequestException('Destination not found');
    }
  }

  private async findOwned(userId: string, id: string): Promise<Workflow> {
    const workflow = await this.prisma.workflow.findUnique({ where: { id } });
    if (!workflow || workflow.userId !== userId) {
      throw new NotFoundException('Workflow not found');
    }
    return workflow;
  }

  private toResponse(workflow: Workflow): WorkflowResponse {
    return {
      id: workflow.id,
      name: workflow.name,
      systemPrompt: workflow.systemPrompt,
      userPrompt: workflow.userPrompt,
      llmCredentialId: workflow.llmCredentialId,
      model: workflow.model,
      temperature: workflow.temperature,
      maxTokens: workflow.maxTokens,
      destinationId: workflow.destinationId,
      parseMode: workflow.parseMode,
      intervalMinutes: workflow.intervalMinutes,
      contextWindow: workflow.contextWindow,
      enabled: workflow.enabled,
      lastRunAt: workflow.lastRunAt,
      nextRunAt: workflow.nextRunAt,
      consecutiveFailures: workflow.consecutiveFailures,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}
