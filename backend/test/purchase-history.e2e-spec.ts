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
}
interface PurchaseHistoryBody {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: string | null;
  purchasedOn: string;
  source: 'MANUAL' | 'RECEIPT';
}

describe('Purchase history (e2e)', () => {
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

  async function setupWithProduct() {
    const owner = await registerUser(server, 'owner@example.com');
    const household = await createHousehold(server, owner.accessToken);
    const productRes = await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait' })
      .expect(201);
    const product = productRes.body as ProductBody;
    return { owner, household, product };
  }

  it('rejects every route with no access token', async () => {
    await request(server).get('/households/x/purchase-history').expect(401);
    await request(server)
      .post('/households/x/purchase-history')
      .send({ productId: 'p1', quantity: 1, unit: 'L' })
      .expect(401);
  });

  it('logs a manual purchase and lists it, most recent first', async () => {
    const { owner, household, product } = await setupWithProduct();

    const createRes = await request(server)
      .post(`/households/${household.id}/purchase-history`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: 2, unit: 'L', unitPrice: 1.5 })
      .expect(201);
    const created = createRes.body as PurchaseHistoryBody;
    expect(created).toMatchObject({
      productId: product.id,
      productName: 'Lait',
      quantity: 2,
      unit: 'L',
      source: 'MANUAL',
    });

    const listRes = await request(server)
      .get(`/households/${household.id}/purchase-history`)
      .set(...auth(owner.accessToken))
      .expect(200);
    const entries = listRes.body as PurchaseHistoryBody[];
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(created.id);
  });

  it('accepts an explicit purchasedOn date', async () => {
    const { owner, household, product } = await setupWithProduct();

    const res = await request(server)
      .post(`/households/${household.id}/purchase-history`)
      .set(...auth(owner.accessToken))
      .send({
        productId: product.id,
        quantity: 1,
        unit: 'L',
        purchasedOn: '2026-01-15T10:00:00.000Z',
      })
      .expect(201);
    expect((res.body as PurchaseHistoryBody).purchasedOn).toBe(
      '2026-01-15T10:00:00.000Z',
    );
  });

  it("404s logging a purchase against another household's product", async () => {
    const { owner, household: householdA } = await setupWithProduct();
    const bob = await registerUser(server, 'bob@example.com');
    const householdB = await createHousehold(server, bob.accessToken, 'B');
    const productBRes = await request(server)
      .post(`/households/${householdB.id}/products`)
      .set(...auth(bob.accessToken))
      .send({ name: 'Pain' })
      .expect(201);
    const productB = productBRes.body as ProductBody;

    await request(server)
      .post(`/households/${householdA.id}/purchase-history`)
      .set(...auth(owner.accessToken))
      .send({ productId: productB.id, quantity: 1, unit: 'pcs' })
      .expect(404);
  });

  it('rejects a non-positive quantity', async () => {
    const { owner, household, product } = await setupWithProduct();

    await request(server)
      .post(`/households/${household.id}/purchase-history`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: 0, unit: 'L' })
      .expect(400);
  });

  it('keeps the log entry after its product is deleted, with productId nulled', async () => {
    const { owner, household, product } = await setupWithProduct();
    await request(server)
      .post(`/households/${household.id}/purchase-history`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: 2, unit: 'L' })
      .expect(201);

    await request(server)
      .delete(`/households/${household.id}/products/${product.id}`)
      .set(...auth(owner.accessToken))
      .expect(204);

    const listRes = await request(server)
      .get(`/households/${household.id}/purchase-history`)
      .set(...auth(owner.accessToken))
      .expect(200);
    const entries = listRes.body as PurchaseHistoryBody[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ productId: null, productName: 'Lait' });
  });

  describe('tenant isolation', () => {
    it("blocks a member of household B from household A's purchase history", async () => {
      const { household: householdA } = await setupWithProduct();
      const bob = await registerUser(server, 'bob2@example.com');
      await createHousehold(server, bob.accessToken, 'Household B');

      await request(server)
        .get(`/households/${householdA.id}/purchase-history`)
        .set(...auth(bob.accessToken))
        .expect(403);
      await request(server)
        .post(`/households/${householdA.id}/purchase-history`)
        .set(...auth(bob.accessToken))
        .send({ productId: 'whatever', quantity: 1, unit: 'L' })
        .expect(403);
    });
  });
});
