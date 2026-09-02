/**
 * Standalone WebSocket server for real-time collaborative editing.
 * Runs as its own process (separate from the NestJS HTTP API) because
 * Hocuspocus owns its own connection loop — mixing it into Nest's HTTP
 * server adds complexity this scope doesn't need. Shares the same
 * Postgres database (via Prisma) and the same Supabase project as the
 * REST API, so a document's id is the only thing that has to line up.
 *
 * Deploy as a second Render service — see README §7.
 */
import { Server } from '@hocuspocus/server';
import * as jwt from 'jsonwebtoken';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';

const prisma = new PrismaClient();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey) {
  supabaseClient = createClient(supabaseUrl, supabaseKey);
}

interface SupabaseJwtClaims {
  sub: string;
  email: string;
}

const VERSION_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // one version snapshot per doc per 5 min of activity
const lastSnapshotAt = new Map<string, number>();

async function resolveLocalUserId(supabaseUserId: string, email?: string): Promise<string | null> {
  let user = await prisma.user.findUnique({ where: { supabaseUserId } });
  if (!user && email) {
    user = await prisma.user.upsert({
      where: { email },
      update: { supabaseUserId },
      create: {
        supabaseUserId,
        email,
        name: email.split('@')[0],
      },
    });
  }
  return user?.id ?? null;
}

async function resolveRole(documentId: string, localUserId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true, shares: { select: { userId: true, role: true } } },
  });
  if (!document) return null;
  if (document.ownerId === localUserId) return 'owner';
  const share = document.shares.find((s) => s.userId === localUserId);
  return (share?.role as 'editor' | 'viewer') ?? null;
}

const server = Server.configure({
  port: Number(process.env.COLLAB_PORT ?? 1234),

  async onAuthenticate(data) {
    const { token, documentName } = data;
    if (!token) throw new Error('Missing auth token');

    let claims: SupabaseJwtClaims | null = null;

    // 1. Try local verification via HS256 secret if configured
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (secret) {
      try {
        claims = jwt.verify(token, secret, { algorithms: ['HS256'] }) as unknown as SupabaseJwtClaims;
      } catch {
        // Fall through
      }
    }

    // 2. Validate against Supabase Auth API
    if (!claims && supabaseClient) {
      try {
        const { data: userData, error } = await supabaseClient.auth.getUser(token);
        if (!error && userData.user) {
          claims = {
            sub: userData.user.id,
            email: userData.user.email ?? '',
          };
        }
      } catch {
        // Fall through
      }
    }

    if (!claims) {
      throw new Error('Invalid or expired session token');
    }

    const localUserId = await resolveLocalUserId(claims.sub, claims.email);
    if (!localUserId) throw new Error('User not provisioned');

    const role = await resolveRole(documentName, localUserId);
    if (!role) throw new Error('No access to this document');

    // Viewers can connect (to see live edits) but can't write. Hocuspocus
    // checks `data.connection.readOnly` on every incoming update.
    if (role === 'viewer') {
      data.connection.readOnly = true;
    }

    return { userId: localUserId, role };
  },

  async onLoadDocument(data) {
    lastSnapshotAt.set(data.documentName, Date.now());
    const record = await prisma.document.findUnique({
      where: { id: data.documentName },
      select: { ydoc: true },
    });
    if (record?.ydoc) {
      Y.applyUpdate(data.document, new Uint8Array(record.ydoc));
    }
    return data.document;
  },

  async onStoreDocument(data) {
    const documentId = data.documentName;
    const update = Y.encodeStateAsUpdate(data.document);
    const fragment = data.document.getXmlFragment('default');
    const textContent = fragment.toString();

    await prisma.document.update({
      where: { id: documentId },
      data: {
        ydoc: Buffer.from(update),
        content: textContent,
      },
    });

    // Lightweight version history: snapshot the representation
    // at most once per VERSION_SNAPSHOT_INTERVAL_MS (5 mins) per document.
    const now = Date.now();
    const last = lastSnapshotAt.get(documentId) ?? now;
    if (now - last >= VERSION_SNAPSHOT_INTERVAL_MS) {
      lastSnapshotAt.set(documentId, now);
      await prisma.documentVersion.create({
        data: { documentId, content: textContent },
      });
    }
  },
});

let isListening = false;

export async function startCollaborationServer(port = Number(process.env.COLLAB_PORT ?? 1234)) {
  if (isListening) return server;
  await server.listen(port);
  isListening = true;
  return server;
}

export async function stopCollaborationServer() {
  if (isListening) {
    await server.destroy();
    isListening = false;
  }
}

// Auto-start if executed directly via node / ts-node standalone
if (require.main === module) {
  startCollaborationServer().then(() => {
    console.log(`[Hocuspocus] Standalone collaboration server listening on port ${process.env.COLLAB_PORT ?? 1234}`);
  });
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await stopCollaborationServer();
  process.exit(0);
});
