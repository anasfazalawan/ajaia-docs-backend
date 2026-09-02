import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { startCollaborationServer } from './collaboration/collaboration-server';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.use(helmet());

  // FRONTEND_URL supports a comma-separated list so one backend can serve
  // local dev, a Vercel preview URL, and production at once.
  // `credentials: true` is required — we send the Supabase session token
  // as an Authorization header on cross-origin requests.
  const allowedOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) return callback(null, true); // non-browser clients (curl, health checks)
      if (allowedOrigins.includes(requestOrigin)) return callback(null, true);
      logger.warn(`Blocked CORS request from origin: ${requestOrigin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  logger.log(`Backend listening on http://localhost:${port}/api`);
  logger.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);

  // Start real-time collaboration WebSocket server
  const collabPort = Number(process.env.COLLAB_PORT ?? 1234);
  try {
    await startCollaborationServer(collabPort);
    logger.log(`Real-time collaboration WebSocket server listening on ws://localhost:${collabPort}`);
  } catch (err: unknown) {
    logger.error(`Failed to start collaboration WebSocket server on port ${collabPort}:`, err);
  }
}
bootstrap();
