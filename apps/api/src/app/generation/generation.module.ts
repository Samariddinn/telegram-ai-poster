import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module';
import { GenerationService } from './generation.service';

@Module({
  imports: [CredentialsModule],
  providers: [GenerationService],
  exports: [GenerationService],
})
export class GenerationModule {}
