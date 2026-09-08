import request from 'supertest';
import { App } from 'supertest/types';

// Shared by every e2e spec that needs an authenticated user and/or a
// household to act within - copying this per file risked it drifting
// (same reasoning as test/prisma-errors.ts and test/integration-prisma.ts).

interface AccessTokenBody {
  accessToken: string;
}
interface MeBody {
  id: string;
}
interface HouseholdBody {
  id: string;
  name: string;
}

export async function registerUser(
  server: App,
  email: string,
): Promise<{ userId: string; accessToken: string }> {
  const registerRes = await request(server)
    .post('/auth/register')
    .send({ email, password: 'a-strong-password', displayName: email })
    .expect(201);
  const { accessToken } = registerRes.body as AccessTokenBody;

  const meRes = await request(server)
    .get('/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const { id: userId } = meRes.body as MeBody;

  return { userId, accessToken };
}

export function auth(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

export async function createHousehold(
  server: App,
  accessToken: string,
  name = 'Casa',
): Promise<HouseholdBody> {
  const res = await request(server)
    .post('/households')
    .set(...auth(accessToken))
    .send({ name })
    .expect(201);
  return res.body as HouseholdBody;
}
