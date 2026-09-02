import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class ShareDocumentDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['viewer', 'editor'])
  role?: 'viewer' | 'editor';
}
