import { Module } from '@nestjs/common';
import { ExecutionModule } from '@telegram-ai-poster/execution';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';

@Module({
  imports: [ExecutionModule],
  controllers: [CredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
