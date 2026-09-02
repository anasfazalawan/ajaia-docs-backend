import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseSyncService, SupabaseJwtClaims } from './supabase-sync.service';

/**
 * Verifies the Supabase access token sent by the frontend
 * (`Authorization: Bearer <session.access_token>`).
 *
 * Supports multi-tier validation:
 * 1. Fast local verification using SUPABASE_JWT_SECRET
 * 2. Real-time validation against Supabase Auth API (supabase.auth.getUser)
 *    to handle OAuth tokens, rotated secrets, and asymmetric JWTs.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private supabase: SupabaseClient | null = null;

  constructor(private supabaseSync: SupabaseSyncService) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let claims: SupabaseJwtClaims | null = null;

    // 1. Try local verification via HS256 secret if configured
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (secret) {
      try {
        claims = jwt.verify(token, secret, { algorithms: ['HS256'] }) as unknown as SupabaseJwtClaims;
      } catch {
        // Fall through to Supabase API validation
      }
    }

    // 2. Validate against Supabase Auth API (handles OAuth, rotated keys, and asymmetric signing)
    if (!claims && this.supabase) {
      try {
        const { data, error } = await this.supabase.auth.getUser(token);
        if (!error && data.user) {
          claims = {
            sub: data.user.id,
            email: data.user.email ?? '',
            user_metadata: data.user.user_metadata,
          };
        }
      } catch {
        // Fall through
      }
    }

    if (!claims) {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    const user = await this.supabaseSync.findOrProvisionUser(claims);
    request.user = { id: user.id, email: user.email, name: user.name };
    return true;
  }
}
