import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {
  attachCollaborationServer,
  startCollaborationServer,
} from './collaboration/collaboration-server';

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
      const cleanOrigin = requestOrigin.replace(/\/+$/, '');
      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(cleanOrigin) ||
        cleanOrigin.endsWith('.vercel.app') ||
        cleanOrigin.includes('localhost')
      ) {
        return callback(null, true);
      }
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

  // Attach WebSocket collaboration server directly to the underlying HTTP server
  const httpServer = app.getHttpServer();
  attachCollaborationServer(httpServer);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  const baseUrl = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/api`
    : `http://localhost:${port}/api`;

  logger.log(`Backend listening on ${baseUrl}`);
  logger.log(`Allowed CORS origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : 'All Vercel apps & localhost'}`);
  logger.log(`WebSocket collaboration server mounted on HTTP upgrade on same port`);

  // Secondary standalone port for local testing if explicitly configured
  const collabPort = Number(process.env.COLLAB_PORT ?? 1234);
  if (collabPort && collabPort !== Number(port) && process.env.NODE_ENV !== 'production') {
    try {
      await startCollaborationServer(collabPort);
      logger.log(`Standalone local collaboration WebSocket server listening on ws://localhost:${collabPort}`);
    } catch {
      // ignore
    }
  }
}
bootstrap();
