import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SharingService {
  constructor(private prisma: PrismaService) {}

  private async assertIsOwner(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');
    if (document.ownerId !== userId) {
      throw new ForbiddenException('Only the document owner can manage sharing');
    }
    return document;
  }

  async listShares(documentId: string, userId: string) {
    await this.assertIsOwner(documentId, userId);
    return this.prisma.documentShare.findMany({
      where: { documentId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async share(documentId: string, ownerId: string, email: string, role = 'editor') {
    const document = await this.assertIsOwner(documentId, ownerId);

    const targetUser = await this.prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      throw new BadRequestException(
        `No user found with email ${email}. They must sign in to Ajaia Docs at least once first.`,
      );
    }
    if (targetUser.id === document.ownerId) {
      throw new BadRequestException('Document owner already has access');
    }

    return this.prisma.documentShare.upsert({
      where: { documentId_userId: { documentId, userId: targetUser.id } },
      update: { role },
      create: { documentId, userId: targetUser.id, role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async revoke(documentId: string, ownerId: string, shareId: string) {
    await this.assertIsOwner(documentId, ownerId);
    const share = await this.prisma.documentShare.findUnique({ where: { id: shareId } });
    if (!share || share.documentId !== documentId) {
      throw new NotFoundException('Share not found');
    }
    return this.prisma.documentShare.delete({ where: { id: shareId } });
  }
}
