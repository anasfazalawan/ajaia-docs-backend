import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';

/**
 * E2E smoke test. Authenticated flows need a real SUPABASE_JWT_SECRET and
 * a provisioned test user (set TEST_SUPABASE_USER_ID / TEST_USER_EMAIL /
 * TEST_USER_NAME env vars, pointing at a user who has already signed in
 * once via the app). Without them, only the unauthenticated-access test
 * runs — that one needs no external config and always exercises the
 * guard's rejection path.
 */
describe('Documents flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated document access', () => {
    return request(app.getHttpServer()).get('/api/documents').expect(401);
  });

  it('rejects a token signed with the wrong secret', () => {
    const badToken = jwt.sign({ sub: 'fake-user', email: 'fake@example.com' }, 'wrong-secret');
    return request(app.getHttpServer())
      .get('/api/documents')
      .set('Authorization', `Bearer ${badToken}`)
      .expect(401);
  });

  const hasTestCreds =
    !!process.env.SUPABASE_JWT_SECRET &&
    !!process.env.TEST_SUPABASE_USER_ID &&
    !!process.env.TEST_USER_EMAIL;

  (hasTestCreds ? it : it.skip)(
    'creates and retrieves a document for an authenticated user',
    async () => {
      const token = jwt.sign(
        { sub: process.env.TEST_SUPABASE_USER_ID, email: process.env.TEST_USER_EMAIL },
        process.env.SUPABASE_JWT_SECRET as string,
      );

      const createRes = await request(app.getHttpServer())
        .post('/api/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'E2E Test Doc' })
        .expect(201);

      expect(createRes.body.title).toBe('E2E Test Doc');

      const getRes = await request(app.getHttpServer())
        .get(`/api/documents/${createRes.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.access).toBe('owner');
    },
  );
});
