import { Module } from '@nestjs/common';
import { SharingService } from './sharing.service';
import { SharingController } from './sharing.controller';

@Module({
  providers: [SharingService],
  controllers: [SharingController],
})
export class SharingModule {}
