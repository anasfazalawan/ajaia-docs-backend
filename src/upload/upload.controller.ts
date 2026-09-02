import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { UploadService } from './upload.service';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@UseGuards(SupabaseAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }))
  async importDocument(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: RequestUser) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadService.importAsDocument(user.id, file);
  }

  @Post('documents/:documentId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async attach(
    @Param('documentId') documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadService.attachToDocument(user.id, documentId, file, file.filename);
  }
}
