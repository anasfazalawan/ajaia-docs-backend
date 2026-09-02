import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { SharingService } from './sharing.service';
import { ShareDocumentDto } from './dto/share.dto';

@UseGuards(SupabaseAuthGuard)
@Controller('documents/:documentId/shares')
export class SharingController {
  constructor(private sharingService: SharingService) {}

  @Get()
  list(@Param('documentId', ParseUUIDPipe) documentId: string, @CurrentUser() user: RequestUser) {
    return this.sharingService.listShares(documentId, user.id);
  }

  @Post()
  share(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ShareDocumentDto,
  ) {
    return this.sharingService.share(documentId, user.id, dto.email, dto.role);
  }

  @Delete(':shareId')
  revoke(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sharingService.revoke(documentId, user.id, shareId);
  }
}
