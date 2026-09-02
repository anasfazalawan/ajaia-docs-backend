import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';

const SEED_USERS = [
  {
    email: process.env.OWNER_EMAIL || 'alice@demo.com',
    password: DEFAULT_PASSWORD,
    name: 'Alice Smith',
  },
  {
    email: process.env.SHARE_WITH_EMAIL || 'bob@demo.com',
    password: DEFAULT_PASSWORD,
    name: 'Bob Jones',
  },
  {
    email: process.env.EXTRA_USER_EMAIL || 'charlie@demo.com',
    password: DEFAULT_PASSWORD,
    name: 'Charlie Brown',
  },
];

function generateFallbackUuid(email: string): string {
  return crypto.createHash('md5').update(`seed-user-${email}`).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

async function registerOrGetSupabaseUserId(
  supabase: ReturnType<typeof createClient> | null,
  email: string,
  password: string,
  name: string,
): Promise<string> {
  if (!supabase) {
    return generateFallbackUuid(email);
  }

  try {
    // 1. Try to sign up the user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, name },
      },
    });

    if (!signUpError && signUpData.user) {
      return signUpData.user.id;
    }

    // 2. If user already registered, try signing in to retrieve their Supabase user ID
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!signInError && signInData.user) {
      return signInData.user.id;
    }

    console.warn(`[Supabase Auth] Notice for ${email}: ${signUpError?.message || signInError?.message}`);
  } catch (err) {
    console.warn(`[Supabase Auth] Could not communicate with Supabase API for ${email}:`, err);
  }

  return generateFallbackUuid(email);
}

async function main() {
  console.log('🌱 Starting database seed with Email/Password test users...\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let supabaseClient: ReturnType<typeof createClient> | null = null;
  if (supabaseUrl && supabaseKey) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  } else {
    console.log('ℹ️  No SUPABASE_URL / SUPABASE_ANON_KEY found in .env; provisioning local database records.');
  }

  const provisionedUsers: Record<string, { id: string; email: string; name: string; password: string }> = {};

  for (const seedUser of SEED_USERS) {
    const supabaseUserId = await registerOrGetSupabaseUserId(
      supabaseClient,
      seedUser.email,
      seedUser.password,
      seedUser.name,
    );

    const dbUser = await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        name: seedUser.name,
        supabaseUserId,
      },
      create: {
        email: seedUser.email,
        name: seedUser.name,
        supabaseUserId,
      },
    });

    provisionedUsers[seedUser.email] = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      password: seedUser.password,
    };
  }

  const alice = provisionedUsers[SEED_USERS[0].email];
  const bob = provisionedUsers[SEED_USERS[1].email];
  const charlie = provisionedUsers[SEED_USERS[2].email];

  // Clean up existing demo docs if present to keep seed idempotent
  const existingDocs = await prisma.document.findMany({
    where: {
      ownerId: { in: [alice.id, bob.id, charlie.id] },
    },
  });

  for (const d of existingDocs) {
    await prisma.document.delete({ where: { id: d.id } });
  }

  // Document 1: Welcome Guide (Owned by Alice, Shared with Bob & Charlie)
  const doc1 = await prisma.document.create({
    data: {
      title: 'Welcome to Ajaia Docs',
      ownerId: alice.id,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Welcome to Ajaia Docs 🚀' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Ajaia Docs is an AI-native, real-time collaborative document editor built on NestJS, Yjs, and Next.js.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Features' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Real-time multi-user editing with cursor presence' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Email & Password authentication or Google/GitHub OAuth' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Granular permissions (Owner, Editor, Viewer)' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Document version history and point-in-time restore' }] }],
              },
            ],
          },
        ],
      }),
    },
  });

  await prisma.documentShare.create({
    data: { documentId: doc1.id, userId: bob.id, role: 'editor' },
  });

  await prisma.documentShare.create({
    data: { documentId: doc1.id, userId: charlie.id, role: 'viewer' },
  });

  // Document 2: Product Strategy (Owned by Alice)
  await prisma.document.create({
    data: {
      title: 'Product Strategy & Roadmap',
      ownerId: alice.id,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Product Strategy' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Internal product guidelines, AI assistance integration ideas, and roadmap milestones.',
              },
            ],
          },
        ],
      }),
    },
  });

  // Document 3: Sprint Planning Notes (Owned by Bob, Shared with Alice)
  const doc3 = await prisma.document.create({
    data: {
      title: 'Weekly Sprint Planning',
      ownerId: bob.id,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Weekly Sprint Planning' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Notes from sprint retro and upcoming tasks.',
              },
            ],
          },
        ],
      }),
    },
  });

  await prisma.documentShare.create({
    data: { documentId: doc3.id, userId: alice.id, role: 'editor' },
  });

  console.log('✅ Seeding completed successfully!\n');
  console.log('===========================================================');
  console.log('🔑 TEST ACCOUNTS FOR EMAIL/PASSWORD SIGN IN:');
  console.log('===========================================================');
  for (const user of Object.values(provisionedUsers)) {
    console.log(`👤 Name: ${user.name}`);
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: ${user.password}`);
    console.log('-----------------------------------------------------------');
  }
  console.log(`\n📄 Created Sample Documents:`);
  console.log(` - "Welcome to Ajaia Docs" (Owned by ${alice.email}, shared with ${bob.email} [editor], ${charlie.email} [viewer])`);
  console.log(` - "Product Strategy & Roadmap" (Owned by ${alice.email})`);
  console.log(` - "Weekly Sprint Planning" (Owned by ${bob.email}, shared with ${alice.email} [editor])`);
  console.log('===========================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
