import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  /** Returns the local (Prisma) user record for the authenticated Supabase session. */
  @UseGuards(SupabaseAuthGuard)
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return user;
  }
}
