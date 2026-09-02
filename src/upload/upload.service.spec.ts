import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { PrismaService } from '../prisma/prisma.service';

function makeFile(originalname: string, mimetype: string, content: string): Express.Multer.File {
  return {
    originalname,
    mimetype,
    buffer: Buffer.from(content, 'utf-8'),
  } as Express.Multer.File;
}

describe('UploadService', () => {
  let service: UploadService;
  let prisma: { document: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = { document: { create: jest.fn((args) => Promise.resolve({ id: 'doc-1', ...args.data })) } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<UploadService>(UploadService);
  });

  it('rejects an unsupported file type', () => {
    const file = makeFile('resume.pdf', 'application/pdf', '%PDF-1.4');
    expect(() => service.validate(file)).toThrow(BadRequestException);
  });

  it('accepts a .txt file', () => {
    const file = makeFile('notes.txt', 'text/plain', 'hello world');
    expect(() => service.validate(file)).not.toThrow();
  });

  it('accepts a .md file even with a generic mimetype', () => {
    const file = makeFile('notes.md', 'application/octet-stream', '# Heading');
    expect(() => service.validate(file)).not.toThrow();
  });

  it('converts markdown headings and bullets into Tiptap JSON nodes', async () => {
    const file = makeFile(
      'plan.md',
      'text/markdown',
      '# Project Plan\n\n- First step\n- Second step\n\nSome closing notes.',
    );

    const doc = await service.importAsDocument('user-1', file);
    const content = JSON.parse(doc.content);

    expect(content.type).toBe('doc');
    expect(content.content[0].type).toBe('heading');
    expect(content.content[0].attrs.level).toBe(1);
    expect(content.content.some((node: any) => node.type === 'bulletList')).toBe(true);
    expect(doc.title).toBe('plan');
  });

  it('falls back to a placeholder paragraph for an empty file', async () => {
    const file = makeFile('empty.txt', 'text/plain', '   \n\n  ');
    const doc = await service.importAsDocument('user-1', file);
    const content = JSON.parse(doc.content);
    expect(content.content).toHaveLength(1);
    expect(content.content[0].type).toBe('paragraph');
  });
});
