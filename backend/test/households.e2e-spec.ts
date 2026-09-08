import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createFakePrisma } from './fake-prisma';

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
interface InviteBody {
  code: string;
}
interface MemberBody {
  userId: string;
  role: string;
}

describe('Households (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
  });

  async function registerUser(
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

  function auth(token: string): [string, string] {
    return ['Authorization', `Bearer ${token}`];
  }

  it('rejects every household route with no access token', async () => {
    await request(server).post('/households').send({ name: 'x' }).expect(401);
    await request(server).get('/households/x/members').expect(401);
  });

  it('lets a member create a household, invite, and join', async () => {
    const alice = await registerUser('alice@example.com');
    const bob = await registerUser('bob@example.com');

    const createRes = await request(server)
      .post('/households')
      .set(...auth(alice.accessToken))
      .send({ name: 'Casa Alice' })
      .expect(201);
    const household = createRes.body as HouseholdBody;

    const inviteRes = await request(server)
      .post(`/households/${household.id}/invites`)
      .set(...auth(alice.accessToken))
      .expect(201);
    const { code } = inviteRes.body as InviteBody;

    await request(server)
      .post('/households/join')
      .set(...auth(bob.accessToken))
      .send({ code })
      .expect(200);

    const membersRes = await request(server)
      .get(`/households/${household.id}/members`)
      .set(...auth(alice.accessToken))
      .expect(200);
    const members = membersRes.body as MemberBody[];
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.userId).sort()).toEqual(
      [alice.userId, bob.userId].sort(),
    );
    expect(members.find((m) => m.userId === alice.userId)?.role).toBe('OWNER');
    expect(members.find((m) => m.userId === bob.userId)?.role).toBe('MEMBER');
  });

  it('rejects an invalid or already-used invite code', async () => {
    const alice = await registerUser('alice2@example.com');
    const bob = await registerUser('bob2@example.com');

    await request(server)
      .post('/households/join')
      .set(...auth(bob.accessToken))
      .send({ code: 'not-a-real-code' })
      .expect(400);

    const createRes = await request(server)
      .post('/households')
      .set(...auth(alice.accessToken))
      .send({ name: 'Casa' })
      .expect(201);
    const household = createRes.body as HouseholdBody;
    const inviteRes = await request(server)
      .post(`/households/${household.id}/invites`)
      .set(...auth(alice.accessToken))
      .expect(201);
    const { code } = inviteRes.body as InviteBody;

    await request(server)
      .post('/households/join')
      .set(...auth(bob.accessToken))
      .send({ code })
      .expect(200);

    // A third user trying the same, now-consumed code.
    const carol = await registerUser('carol2@example.com');
    await request(server)
      .post('/households/join')
      .set(...auth(carol.accessToken))
      .send({ code })
      .expect(400);
  });

  describe('tenant isolation', () => {
    // The explicit proof RAV-7 asks for: a member of household A gets
    // nothing from household B's endpoints, not even a 404 that would
    // confirm the household exists.
    it('blocks a member of household B from every route scoped to household A', async () => {
      const alice = await registerUser('alice3@example.com');
      const bob = await registerUser('bob3@example.com');

      const householdARes = await request(server)
        .post('/households')
        .set(...auth(alice.accessToken))
        .send({ name: 'Household A' })
        .expect(201);
      const householdA = householdARes.body as HouseholdBody;

      await request(server)
        .post('/households')
        .set(...auth(bob.accessToken))
        .send({ name: 'Household B' })
        .expect(201);

      // Bob (member of B only) against every route scoped to A.
      await request(server)
        .get(`/households/${householdA.id}/members`)
        .set(...auth(bob.accessToken))
        .expect(403);
      await request(server)
        .post(`/households/${householdA.id}/invites`)
        .set(...auth(bob.accessToken))
        .expect(403);
      await request(server)
        .delete(`/households/${householdA.id}/members/${alice.userId}`)
        .set(...auth(bob.accessToken))
        .expect(403);
    });
  });

  describe('removing members', () => {
    async function setupHouseholdWithTwoMembers() {
      const owner = await registerUser('owner4@example.com');
      const member = await registerUser('member4@example.com');

      const createRes = await request(server)
        .post('/households')
        .set(...auth(owner.accessToken))
        .send({ name: 'Casa' })
        .expect(201);
      const household = createRes.body as HouseholdBody;

      const inviteRes = await request(server)
        .post(`/households/${household.id}/invites`)
        .set(...auth(owner.accessToken))
        .expect(201);
      const { code } = inviteRes.body as InviteBody;

      await request(server)
        .post('/households/join')
        .set(...auth(member.accessToken))
        .send({ code })
        .expect(200);

      return { owner, member, household };
    }

    it('lets a member remove themself', async () => {
      const { member, household } = await setupHouseholdWithTwoMembers();

      await request(server)
        .delete(`/households/${household.id}/members/${member.userId}`)
        .set(...auth(member.accessToken))
        .expect(204);
    });

    it('rejects a non-OWNER member trying to remove someone else', async () => {
      const { owner, member, household } = await setupHouseholdWithTwoMembers();

      await request(server)
        .delete(`/households/${household.id}/members/${owner.userId}`)
        .set(...auth(member.accessToken))
        .expect(403);
    });

    it('lets the OWNER remove another member', async () => {
      const { owner, member, household } = await setupHouseholdWithTwoMembers();

      await request(server)
        .delete(`/households/${household.id}/members/${member.userId}`)
        .set(...auth(owner.accessToken))
        .expect(204);
    });

    it('rejects the last OWNER leaving while another member remains', async () => {
      const { owner, household } = await setupHouseholdWithTwoMembers();

      await request(server)
        .delete(`/households/${household.id}/members/${owner.userId}`)
        .set(...auth(owner.accessToken))
        .expect(403);
    });

    it('lets a sole OWNER leave when nobody else is in the household', async () => {
      const owner = await registerUser('sole-owner4@example.com');
      const createRes = await request(server)
        .post('/households')
        .set(...auth(owner.accessToken))
        .send({ name: 'Casa Sola' })
        .expect(201);
      const household = createRes.body as HouseholdBody;

      await request(server)
        .delete(`/households/${household.id}/members/${owner.userId}`)
        .set(...auth(owner.accessToken))
        .expect(204);
    });
  });
});
