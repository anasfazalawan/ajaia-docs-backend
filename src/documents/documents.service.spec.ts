import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';

// In-memory fake of the Prisma models this service touches, so tests
// exercise real authorization/role logic without a database.
const makeInMemoryPrisma = () => {
  const documents: any[] = [
    {
      id: 'doc-1',
      title: 'Owned by user-1',
      content: '',
      ownerId: 'user-1',
      shares: [
        { userId: 'user-2', role: 'editor' },
        { userId: 'user-3', role: 'viewer' },
      ],
      updatedAt: new Date(),
    },
    {
      id: 'doc-2',
      title: 'Owned by someone else',
      content: '',
      ownerId: 'user-99',
      shares: [],
      updatedAt: new Date(),
    },
  ];

  return {
    document: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(documents.find((d) => d.id === where.id) ?? null),
      ),
      findMany: jest.fn(() => Promise.resolve([])),
      update: jest.fn(({ where, data }: any) => {
        const doc = documents.find((d) => d.id === where.id);
        Object.assign(doc, data);
        return Promise.resolve(doc);
      }),
      delete: jest.fn(({ where }: any) => {
        const idx = documents.findIndex((d) => d.id === where.id);
        const [removed] = documents.splice(idx, 1);
        return Promise.resolve(removed);
      }),
    },
  };
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: ReturnType<typeof makeInMemoryPrisma>;

  beforeEach(async () => {
    prisma = makeInMemoryPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<DocumentsService>(DocumentsService);
  });

  it('allows the owner to access their document with role "owner"', async () => {
    const doc = await service.findOneForUser('doc-1', 'user-1');
    expect(doc.access).toBe('owner');
    expect(doc.role).toBe('owner');
  });

  it('resolves an editor share to role "editor"', async () => {
    const doc = await service.findOneForUser('doc-1', 'user-2');
    expect(doc.access).toBe('shared');
    expect(doc.role).toBe('editor');
  });

  it('resolves a viewer share to role "viewer"', async () => {
    const doc = await service.findOneForUser('doc-1', 'user-3');
    expect(doc.role).toBe('viewer');
  });

  it('throws ForbiddenException for a user with no access', async () => {
    await expect(service.findOneForUser('doc-1', 'stranger')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws NotFoundException for a missing document', async () => {
    await expect(service.findOneForUser('does-not-exist', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows an editor share to update content', async () => {
    const result = await service.update('doc-1', 'user-2', { content: 'new content' });
    expect(result.content).toBe('new content');
  });

  it('blocks a viewer share from updating content', async () => {
    await expect(
      service.update('doc-1', 'user-3', { content: 'nope' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks an editor share from renaming (owner-only)', async () => {
    await expect(
      service.update('doc-1', 'user-2', { title: 'Renamed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the owner to rename', async () => {
    const result = await service.update('doc-1', 'user-1', { title: 'Renamed' });
    expect(result.title).toBe('Renamed');
  });

  it('prevents a non-owner from deleting a document', async () => {
    await expect(service.remove('doc-2', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the owner to delete their document', async () => {
    const result = await service.remove('doc-1', 'user-1');
    expect(result.id).toBe('doc-1');
  });
});
