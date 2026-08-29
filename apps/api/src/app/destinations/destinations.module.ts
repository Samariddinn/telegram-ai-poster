import { Module } from '@nestjs/common';
import { ExecutionModule } from '@telegram-ai-poster/execution';
import { CredentialsModule } from '../credentials/credentials.module';
import { DestinationsController } from './destinations.controller';
import { DestinationsService } from './destinations.service';

@Module({
  imports: [CredentialsModule, ExecutionModule],
  controllers: [DestinationsController],
  providers: [DestinationsService],
})
export class DestinationsModule {}
