import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Scope decision: only .txt/.md are converted into a document. Kept
// explicit and out of scope for .docx parsing — see ARCHITECTURE.md.
const SUPPORTED_MIME_PREFIXES = ['text/plain', 'text/markdown'];
const SUPPORTED_EXTENSIONS = ['.txt', '.md'];

function markdownToTiptapJson(raw: string, fallbackTitle: string) {
  const lines = raw.split(/\r?\n/);
  const content: any[] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;

    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      content.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: [{ type: 'text', text: headingMatch[2] }],
      });
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      content.push({
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: bulletMatch[1] }] }] },
        ],
      });
      continue;
    }

    content.push({ type: 'paragraph', content: [{ type: 'text', text: line }] });
  }

  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [{ type: 'text', text: fallbackTitle }] });
  }

  return { type: 'doc', content };
}

@Injectable()
export class UploadService {
  constructor(private prisma: PrismaService) {}

  validate(file: Express.Multer.File) {
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    const mimeOk = SUPPORTED_MIME_PREFIXES.some((p) => file.mimetype.startsWith(p));
    const extOk = SUPPORTED_EXTENSIONS.includes(ext);
    if (!mimeOk && !extOk) {
      throw new BadRequestException(
        `Unsupported file type "${ext}". Only .txt and .md files can be imported as documents.`,
      );
    }
  }

  async importAsDocument(userId: string, file: Express.Multer.File) {
    this.validate(file);
    const text = file.buffer.toString('utf-8');
    const title = file.originalname.replace(/\.(txt|md)$/i, '') || 'Imported document';
    const content = JSON.stringify(markdownToTiptapJson(text, title));

    return this.prisma.document.create({ data: { title, content, ownerId: userId } });
  }

  async attachToDocument(userId: string, documentId: string, file: Express.Multer.File, savedPath: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.ownerId !== userId) {
      throw new BadRequestException('Document not found or not owned by you');
    }
    return this.prisma.attachment.create({
      data: { documentId, filename: file.originalname, mimetype: file.mimetype, path: savedPath },
    });
  }
}
