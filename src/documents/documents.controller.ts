import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';

@UseGuards(SupabaseAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.documentsService.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDocumentDto) {
    return this.documentsService.create(user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.findOneForUser(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.remove(id, user.id);
  }

  @Get(':id/versions')
  listVersions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.listVersions(id, user.id);
  }

  @Post(':id/versions')
  createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.createManualSnapshot(id, user.id);
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.restoreVersion(id, user.id, versionId);
  }

  /** Lets a non-owner remove themselves from a document shared with them. */
  @Post(':id/leave')
  leave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.leave(id, user.id);
  }
}
