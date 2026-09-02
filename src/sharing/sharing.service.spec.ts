import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SharingService } from './sharing.service';
import { PrismaService } from '../prisma/prisma.service';

const makeInMemoryPrisma = () => {
  const documents = [{ id: 'doc-1', ownerId: 'user-1' }];
  const users = [
    { id: 'user-1', email: 'owner@example.com' },
    { id: 'user-2', email: 'friend@example.com' },
  ];
  const shares: any[] = [];

  return {
    document: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(documents.find((d) => d.id === where.id) ?? null),
      ),
    },
    user: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(users.find((u) => u.email === where.email) ?? null),
      ),
    },
    documentShare: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(shares.filter((s) => s.documentId === where.documentId)),
      ),
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(shares.find((s) => s.id === where.id) ?? null),
      ),
      upsert: jest.fn(({ where, create }: any) => {
        const existing = shares.find(
          (s) => s.documentId === where.documentId_userId.documentId && s.userId === where.documentId_userId.userId,
        );
        if (existing) return Promise.resolve(existing);
        const created = { id: `share-${shares.length + 1}`, ...create };
        shares.push(created);
        return Promise.resolve(created);
      }),
      delete: jest.fn(({ where }: any) => {
        const idx = shares.findIndex((s) => s.id === where.id);
        const [removed] = shares.splice(idx, 1);
        return Promise.resolve(removed);
      }),
    },
  };
};

describe('SharingService', () => {
  let service: SharingService;
  let prisma: ReturnType<typeof makeInMemoryPrisma>;

  beforeEach(async () => {
    prisma = makeInMemoryPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SharingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<SharingService>(SharingService);
  });

  it('lets the owner share a document with a known user', async () => {
    const share = await service.share('doc-1', 'user-1', 'friend@example.com', 'editor');
    expect(share.userId).toBe('user-2');
    expect(share.role).toBe('editor');
  });

  it('rejects sharing from a non-owner', async () => {
    await expect(
      service.share('doc-1', 'user-2', 'friend@example.com'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects sharing with an email that has no account', async () => {
    await expect(
      service.share('doc-1', 'user-1', 'nobody@example.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects sharing a document that does not exist', async () => {
    await expect(
      service.share('missing-doc', 'user-1', 'friend@example.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a non-owner listing shares', async () => {
    await expect(service.listShares('doc-1', 'user-2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the owner revoke a share', async () => {
    const share = await service.share('doc-1', 'user-1', 'friend@example.com');
    const result = await service.revoke('doc-1', 'user-1', share.id);
    expect(result.id).toBe(share.id);
  });
});
