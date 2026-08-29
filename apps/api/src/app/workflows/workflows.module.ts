import { Module } from '@nestjs/common';
import { ExecutionModule } from '@telegram-ai-poster/execution';
import { CredentialsModule } from '../credentials/credentials.module';
import { GenerationModule } from '../generation/generation.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [CredentialsModule, GenerationModule, ExecutionModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
})
export class WorkflowsModule {}
