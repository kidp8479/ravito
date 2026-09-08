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
interface InventoryItemBody {
  id: string;
  quantity: number;
  unit: string;
  product: { id: string; name: string };
}

describe('Inventory (e2e)', () => {
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
    await request(server).get('/households/x/inventory').expect(401);
    await request(server)
      .post('/households/x/inventory')
      .send({ productId: 'p1', quantity: 1, unit: 'L' })
      .expect(401);
  });

  it('creates an inventory item and lists it with its product', async () => {
    const { owner, household, product } = await setupWithProduct();

    const createRes = await request(server)
      .post(`/households/${household.id}/inventory`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: 2, unit: 'L' })
      .expect(201);
    expect(createRes.body).toMatchObject({ quantity: 2, unit: 'L' });

    const listRes = await request(server)
      .get(`/households/${household.id}/inventory`)
      .set(...auth(owner.accessToken))
      .expect(200);
    const items = listRes.body as InventoryItemBody[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      quantity: 2,
      unit: 'L',
      product: { id: product.id, name: 'Lait' },
    });
  });

  it("404s creating an item against another household's product", async () => {
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
      .post(`/households/${householdA.id}/inventory`)
      .set(...auth(owner.accessToken))
      .send({ productId: productB.id, quantity: 1, unit: 'pcs' })
      .expect(404);
  });

  it('rejects adding the same product to inventory twice', async () => {
    const { owner, household, product } = await setupWithProduct();

    await request(server)
      .post(`/households/${household.id}/inventory`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: 2, unit: 'L' })
      .expect(201);

    await request(server)
      .post(`/households/${household.id}/inventory`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: 1, unit: 'L' })
      .expect(409);
  });

  it('rejects a negative quantity', async () => {
    const { owner, household, product } = await setupWithProduct();

    await request(server)
      .post(`/households/${household.id}/inventory`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: -1, unit: 'L' })
      .expect(400);
  });

  it('updates the quantity, 404s on an unknown id', async () => {
    const { owner, household, product } = await setupWithProduct();
    const createRes = await request(server)
      .post(`/households/${household.id}/inventory`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: 2, unit: 'L' })
      .expect(201);
    const item = createRes.body as InventoryItemBody;

    const updateRes = await request(server)
      .patch(`/households/${household.id}/inventory/${item.id}`)
      .set(...auth(owner.accessToken))
      .send({ quantity: 5 })
      .expect(200);
    expect((updateRes.body as InventoryItemBody).quantity).toBe(5);

    await request(server)
      .patch(`/households/${household.id}/inventory/unknown-id`)
      .set(...auth(owner.accessToken))
      .send({ quantity: 1 })
      .expect(404);
  });

  it('deletes an inventory item, then 404s on repeat', async () => {
    const { owner, household, product } = await setupWithProduct();
    const createRes = await request(server)
      .post(`/households/${household.id}/inventory`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, quantity: 2, unit: 'L' })
      .expect(201);
    const item = createRes.body as InventoryItemBody;

    await request(server)
      .delete(`/households/${household.id}/inventory/${item.id}`)
      .set(...auth(owner.accessToken))
      .expect(204);

    await request(server)
      .delete(`/households/${household.id}/inventory/${item.id}`)
      .set(...auth(owner.accessToken))
      .expect(404);
  });

  describe('tenant isolation', () => {
    it("blocks a member of household B from household A's inventory", async () => {
      const {
        owner: alice,
        household: householdA,
        product,
      } = await setupWithProduct();
      const bob = await registerUser(server, 'bob2@example.com');
      await createHousehold(server, bob.accessToken, 'Household B');

      const itemRes = await request(server)
        .post(`/households/${householdA.id}/inventory`)
        .set(...auth(alice.accessToken))
        .send({ productId: product.id, quantity: 1, unit: 'L' })
        .expect(201);
      const item = itemRes.body as InventoryItemBody;

      await request(server)
        .get(`/households/${householdA.id}/inventory`)
        .set(...auth(bob.accessToken))
        .expect(403);
      await request(server)
        .patch(`/households/${householdA.id}/inventory/${item.id}`)
        .set(...auth(bob.accessToken))
        .send({ quantity: 99 })
        .expect(403);
    });
  });
});
