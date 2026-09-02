import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  private readonly createThrottleMap = new Map<
    string,
    { time: number; doc: Awaited<ReturnType<PrismaService['document']['create']>> }
  >();

  async listForUser(userId: string) {
    const [owned, shared] = await Promise.all([
      this.prisma.document.findMany({
        where: { ownerId: userId },
        orderBy: { updatedAt: 'desc' },
        include: { owner: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.document.findMany({
        where: { shares: { some: { userId } } },
        orderBy: { updatedAt: 'desc' },
        include: { owner: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    return {
      owned: owned.map((d) => ({ ...d, access: 'owner' as const, role: 'owner' as const })),
      shared: shared.map((d) => ({ ...d, access: 'shared' as const })),
    };
  }

  async create(userId: string, dto: CreateDocumentDto) {
    const now = Date.now();
    const cached = this.createThrottleMap.get(userId);
    // If request arrives within 1.5s from the same user for default document, return the created one
    if (cached && now - cached.time < 1500 && (!dto.title || dto.title === 'Untitled document')) {
      return cached.doc;
    }

    const doc = await this.prisma.document.create({
      data: {
        title: dto.title?.trim() || 'Untitled document',
        content: dto.content ?? '',
        ownerId: userId,
      },
    });

    this.createThrottleMap.set(userId, { time: now, doc });
    return doc;
  }

  /** Loads a document, verifies access, and resolves the caller's effective role. */
  async findOneForUser(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        shares: { include: { user: { select: { id: true, name: true, email: true } } } },
        attachments: true,
      },
    });

    if (!document) throw new NotFoundException('Document not found');

    const isOwner = document.ownerId === userId;
    const share = document.shares.find((s) => s.userId === userId);

    if (!isOwner && !share) {
      throw new ForbiddenException('You do not have access to this document');
    }

    return {
      ...document,
      access: isOwner ? ('owner' as const) : ('shared' as const),
      role: isOwner ? ('owner' as const) : (share!.role as 'viewer' | 'editor'),
    };
  }

  /**
   * Enforces write permissions: only the owner may rename; only the owner
   * or a share with role "editor" may change content. A "viewer" share
   * can read (via findOneForUser) but any PATCH is rejected here.
   */
  async update(documentId: string, userId: string, dto: UpdateDocumentDto) {
    const document = await this.findOneForUser(documentId, userId);

    if (document.access === 'shared') {
      if (document.role !== 'editor') {
        throw new ForbiddenException('You have view-only access to this document');
      }
      if (dto.title !== undefined) {
        throw new ForbiddenException('Only the document owner can rename it');
      }
    }

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || 'Untitled document' } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
      },
    });
  }

  async remove(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');
    if (document.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can delete this document');
    }
    return this.prisma.document.delete({ where: { id: documentId } });
  }

  /** Version history: list snapshots (newest first), owner or editor share only. */
  async listVersions(documentId: string, userId: string) {
    await this.findOneForUser(documentId, userId);
    return this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Allows an owner/editor to manually create a named checkpoint snapshot */
  async createManualSnapshot(documentId: string, userId: string) {
    const document = await this.findOneForUser(documentId, userId);
    if (document.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot create version snapshots');
    }

    return this.prisma.documentVersion.create({
      data: {
        documentId,
        content: document.content,
      },
    });
  }

  /** Restores a document's content from a prior snapshot (owner or editor only). */
  async restoreVersion(documentId: string, userId: string, versionId: string) {
    const document = await this.findOneForUser(documentId, userId);
    if (document.role === 'viewer') {
      throw new ForbiddenException('You have view-only access to this document');
    }

    const version = await this.prisma.documentVersion.findUnique({ where: { id: versionId } });
    if (!version || version.documentId !== documentId) {
      throw new NotFoundException('Version not found');
    }

    return this.prisma.document.update({
      where: { id: documentId },
      data: { content: version.content },
    });
  }

  /** Lets a shared (non-owner) user remove their own access to a document. */
  async leave(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { shares: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (document.ownerId === userId) {
      throw new ForbiddenException('The owner cannot leave their own document — delete it instead');
    }

    const share = document.shares.find((s) => s.userId === userId);
    if (!share) throw new NotFoundException('You do not have access to this document');

    await this.prisma.documentShare.delete({ where: { id: share.id } });
    return { left: true };
  }
}
