import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateWorkflowDto, PreviewGenerationDto, UpdateWorkflowDto } from '@telegram-ai-poster/shared-dto';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerationService } from '../generation/generation.service';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly generation: GenerationService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.workflows.findAllForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateWorkflowDto) {
    return this.workflows.create(user.id, dto);
  }

  @Post('preview')
  preview(@CurrentUser() user: CurrentUserPayload, @Body() dto: PreviewGenerationDto) {
    return this.generation.preview(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(user.id, id, dto);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  enable(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.workflows.setEnabled(user.id, id, true);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  disable(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.workflows.setEnabled(user.id, id, false);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  run(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.workflows.runManual(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.workflows.remove(user.id, id);
  }
}
