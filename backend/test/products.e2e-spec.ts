import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { auth, createHousehold, registerUser } from './e2e-helpers';
import { createFakePrisma } from './fake-prisma';

interface ProductBody {
  id: string;
  name: string;
  category: string | null;
  defaultUnit: string | null;
}

describe('Products (e2e)', () => {
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

  async function setup() {
    const owner = await registerUser(server, 'owner@example.com');
    const household = await createHousehold(server, owner.accessToken);
    return { owner, household };
  }

  it('rejects every route with no access token', async () => {
    await request(server).get('/households/x/products').expect(401);
    await request(server)
      .post('/households/x/products')
      .send({ name: 'Lait' })
      .expect(401);
  });

  it('creates a product and lists it', async () => {
    const { owner, household } = await setup();

    const createRes = await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait', category: 'DAIRY', defaultUnit: 'L' })
      .expect(201);
    const product = createRes.body as ProductBody;
    expect(product).toMatchObject({
      name: 'Lait',
      category: 'DAIRY',
      defaultUnit: 'L',
    });

    const listRes = await request(server)
      .get(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .expect(200);
    expect(listRes.body).toEqual([product]);
  });

  it('rejects a duplicate product name in the same household', async () => {
    const { owner, household } = await setup();

    await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait' })
      .expect(201);

    await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait' })
      .expect(409);
  });

  it('rejects an invalid category value', async () => {
    const { owner, household } = await setup();

    await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait', category: 'NOT_A_CATEGORY' })
      .expect(400);
  });

  it('searches products by a case-insensitive substring', async () => {
    const { owner, household } = await setup();
    await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait demi-ecreme' })
      .expect(201);
    await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Pain' })
      .expect(201);

    const res = await request(server)
      .get(`/households/${household.id}/products/search`)
      .query({ q: 'LAIT' })
      .set(...auth(owner.accessToken))
      .expect(200);
    const results = res.body as ProductBody[];
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Lait demi-ecreme');
  });

  it('updates a product, 404s on an unknown id, 409s on a name clash', async () => {
    const { owner, household } = await setup();
    const createRes = await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait' })
      .expect(201);
    const product = createRes.body as ProductBody;
    await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Pain' })
      .expect(201);

    const updateRes = await request(server)
      .patch(`/households/${household.id}/products/${product.id}`)
      .set(...auth(owner.accessToken))
      .send({ defaultUnit: 'L' })
      .expect(200);
    expect((updateRes.body as ProductBody).defaultUnit).toBe('L');

    await request(server)
      .patch(`/households/${household.id}/products/unknown-id`)
      .set(...auth(owner.accessToken))
      .send({ defaultUnit: 'L' })
      .expect(404);

    await request(server)
      .patch(`/households/${household.id}/products/${product.id}`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Pain' })
      .expect(409);
  });

  it('deletes a product, then 404s on repeat', async () => {
    const { owner, household } = await setup();
    const createRes = await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait' })
      .expect(201);
    const product = createRes.body as ProductBody;

    await request(server)
      .delete(`/households/${household.id}/products/${product.id}`)
      .set(...auth(owner.accessToken))
      .expect(204);

    await request(server)
      .delete(`/households/${household.id}/products/${product.id}`)
      .set(...auth(owner.accessToken))
      .expect(404);
  });

  describe('tenant isolation', () => {
    it("blocks a member of household B from household A's products", async () => {
      const { owner: alice, household: householdA } = await setup();
      const bob = await registerUser(server, 'bob@example.com');
      await createHousehold(server, bob.accessToken, 'Household B');

      const productRes = await request(server)
        .post(`/households/${householdA.id}/products`)
        .set(...auth(alice.accessToken))
        .send({ name: 'Lait' })
        .expect(201);
      const product = productRes.body as ProductBody;

      await request(server)
        .get(`/households/${householdA.id}/products`)
        .set(...auth(bob.accessToken))
        .expect(403);
      await request(server)
        .patch(`/households/${householdA.id}/products/${product.id}`)
        .set(...auth(bob.accessToken))
        .send({ name: 'Renamed' })
        .expect(403);
    });
  });
});
