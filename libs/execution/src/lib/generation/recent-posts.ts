import { ExecutionStatus } from '@prisma/client';
import { PrismaService } from '@telegram-ai-poster/prisma';

/**
 * Only successful executions feed back as anti-repetition context (docs §7)
 * — a failed run's error string or refusal would otherwise leak into the
 * context and steer subsequent generations badly.
 */
export async function getRecentSuccessfulPosts(
  prisma: PrismaService,
  workflowId: string,
  limit: number,
): Promise<string[]> {
  const executions = await prisma.execution.findMany({
    where: { workflowId, status: ExecutionStatus.SUCCESS, generatedText: { not: null } },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: { generatedText: true },
  });

  return executions.map((e) => e.generatedText ?? '');
}
