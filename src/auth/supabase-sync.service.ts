import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SupabaseJwtClaims {
  sub: string; // Supabase auth.users.id (uuid)
  email: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
}

@Injectable()
export class SupabaseSyncService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolves a verified Supabase JWT to our local `User` row, provisioning
   * it on first sight. Unlike a Clerk-style integration, the JWT itself
   * already carries email + profile metadata (populated by whichever OAuth
   * provider the person used — Google, GitHub, etc.), so this never needs
   * a second network call to an identity provider.
   */
  async findOrProvisionUser(claims: SupabaseJwtClaims) {
    const existing = await this.prisma.user.findUnique({
      where: { supabaseUserId: claims.sub },
    });
    if (existing) return existing;

    const name =
      claims.user_metadata?.full_name ||
      claims.user_metadata?.name ||
      claims.email.split('@')[0];

    const avatarUrl = claims.user_metadata?.avatar_url || claims.user_metadata?.picture;

    return this.prisma.user.upsert({
      where: { email: claims.email },
      update: { supabaseUserId: claims.sub, name, avatarUrl },
      create: {
        supabaseUserId: claims.sub,
        email: claims.email,
        name,
        avatarUrl,
      },
    });
  }
}
