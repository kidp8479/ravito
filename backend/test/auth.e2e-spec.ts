import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'superagent';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createFakePrisma } from './fake-prisma';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const credentials = {
    email: 'Alice@Example.com',
    password: 'a-strong-password',
    displayName: 'Alice',
  };

  interface AccessTokenBody {
    accessToken: string;
  }

  interface PublicUserBody {
    email: string;
    displayName: string;
    passwordHash?: string;
  }

  it('runs the full register -> me -> refresh -> me -> logout -> refresh flow', async () => {
    const server = app.getHttpServer();

    const registerRes = await request(server)
      .post('/auth/register')
      .send(credentials)
      .expect(201);
    const { accessToken } = registerRes.body as AccessTokenBody;
    expect(accessToken).toBeDefined();
    // Superagent's cookie jar honours the `Secure` attribute and won't
    // resend it over the plain-HTTP test server, unlike a real HTTPS
    // deployment - so this flow carries the cookie by hand instead of via
    // request.agent(), the same workaround a real browser wouldn't need.
    const setCookieHeader = getSetCookieHeaders(registerRes).find((cookie) =>
      cookie.startsWith('refresh_token='),
    );
    expect(setCookieHeader).toMatch(/HttpOnly/);
    // Cookie path matching is prefix-based: a browser only sends this
    // cookie to /auth/logout because the Path is `/auth`, not
    // `/auth/refresh` - the latter would silently break logout's
    // server-side revocation for every real browser (RAV-6 code review).
    expect(setCookieHeader).toMatch(/Path=\/auth;/);
    let refreshCookie = extractSetCookie(registerRes, 'refresh_token');

    const meRes = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const meBody = meRes.body as PublicUserBody;
    // Registered with mixed case; the service normalizes it.
    expect(meBody.email).toBe('alice@example.com');
    expect(meBody.displayName).toBe(credentials.displayName);
    expect(meBody.passwordHash).toBeUndefined();

    const refreshRes = await request(server)
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    const { accessToken: rotatedAccessToken } =
      refreshRes.body as AccessTokenBody;
    expect(rotatedAccessToken).toBeDefined();
    const rotatedRefreshCookie = extractSetCookie(refreshRes, 'refresh_token');
    // The refresh token rotates on every use (ADR 0002) - the access token
    // string itself may coincide with the previous one (JWT signing is
    // deterministic per-second for an identical payload), so the refresh
    // token is the one that actually has to differ.
    expect(rotatedRefreshCookie).not.toBe(refreshCookie);
    refreshCookie = rotatedRefreshCookie;

    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${rotatedAccessToken}`)
      .expect(200);

    await request(server)
      .post('/auth/logout')
      .set('Cookie', refreshCookie)
      .expect(204);

    // Logout revoked that token; a real browser would also have dropped
    // the now-cleared cookie, but resending it here doubles as the
    // reuse-detection check (ADR 0002).
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
  });

  it('rejects a second register on the same email with 409, not a silent success', async () => {
    const server = app.getHttpServer();

    await request(server).post('/auth/register').send(credentials).expect(201);
    await request(server).post('/auth/register').send(credentials).expect(409);
  });

  it('rejects login with the wrong password, generically', async () => {
    const server = app.getHttpServer();
    await request(server).post('/auth/register').send(credentials).expect(201);

    await request(server)
      .post('/auth/login')
      .send({ email: credentials.email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects login for an email that was never registered, with the same generic error', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' })
      .expect(401);
  });

  it('rejects /me with no access token', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});

// superagent's own types declare every header as a single `string`, but
// Node's http layer always returns `set-cookie` as an array (one entry per
// Set-Cookie sent) - hence the `unknown` round-trip the compiler asks for.
function getSetCookieHeaders(res: Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

function extractSetCookie(res: Response, name: string): string {
  const header = getSetCookieHeaders(res).find((cookie) =>
    cookie.startsWith(`${name}=`),
  );
  if (!header) {
    throw new Error(`no Set-Cookie for "${name}" in the response`);
  }
  // Only the name=value pair belongs in a request's Cookie header, not the
  // attributes (Path, Expires, HttpOnly...) that follow the first `;`.
  return header.split(';')[0];
}
