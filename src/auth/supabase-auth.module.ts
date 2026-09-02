import { Global, Module } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseSyncService } from './supabase-sync.service';

@Global()
@Module({
  providers: [SupabaseAuthGuard, SupabaseSyncService],
  exports: [SupabaseAuthGuard, SupabaseSyncService],
})
export class SupabaseAuthModule {}
