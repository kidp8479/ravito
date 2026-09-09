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
}
interface ShoppingListItemBody {
  id: string;
  rawLabel: string;
  quantity: number;
  unit: string;
  checked: boolean;
  checkedById: string | null;
  addedById: string | null;
  position: number;
}

describe('Shopping list (e2e)', () => {
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
    await request(server).get('/households/x/shopping-list').expect(401);
    await request(server)
      .post('/households/x/shopping-list')
      .send({ rawLabel: 'Lait', quantity: 1, unit: 'L' })
      .expect(401);
  });

  it('creates a free-text item and lists it, addedById set to the caller', async () => {
    const { owner, household } = await setup();

    const createRes = await request(server)
      .post(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .send({ rawLabel: 'Baguette', quantity: 2, unit: 'pcs' })
      .expect(201);
    const item = createRes.body as ShoppingListItemBody;
    expect(item).toMatchObject({
      rawLabel: 'Baguette',
      checked: false,
      checkedById: null,
      addedById: owner.userId,
      position: 0,
    });

    const listRes = await request(server)
      .get(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .expect(200);
    expect(listRes.body).toEqual([item]);
  });

  it('creates a catalogue-linked item, 404s for a productId from another household', async () => {
    const { owner, household } = await setup();
    const productRes = await request(server)
      .post(`/households/${household.id}/products`)
      .set(...auth(owner.accessToken))
      .send({ name: 'Lait' })
      .expect(201);
    const product = productRes.body as ProductBody;

    await request(server)
      .post(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .send({ productId: product.id, rawLabel: 'Lait', quantity: 1, unit: 'L' })
      .expect(201);

    const bob = await registerUser(server, 'bob@example.com');
    const householdB = await createHousehold(server, bob.accessToken, 'B');
    await request(server)
      .post(`/households/${householdB.id}/shopping-list`)
      .set(...auth(bob.accessToken))
      .send({ productId: product.id, rawLabel: 'Lait', quantity: 1, unit: 'L' })
      .expect(404);
  });

  it('appends new items at increasing positions', async () => {
    const { owner, household } = await setup();

    const first = await request(server)
      .post(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .send({ rawLabel: 'Lait', quantity: 1, unit: 'L' })
      .expect(201);
    const second = await request(server)
      .post(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .send({ rawLabel: 'Pain', quantity: 1, unit: 'pcs' })
      .expect(201);

    expect((first.body as ShoppingListItemBody).position).toBe(0);
    expect((second.body as ShoppingListItemBody).position).toBe(1);
  });

  it('checks and unchecks an item, setting/clearing checkedById to the caller', async () => {
    const { owner, household } = await setup();
    const createRes = await request(server)
      .post(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .send({ rawLabel: 'Lait', quantity: 1, unit: 'L' })
      .expect(201);
    const item = createRes.body as ShoppingListItemBody;

    const checkedRes = await request(server)
      .patch(`/households/${household.id}/shopping-list/${item.id}/check`)
      .set(...auth(owner.accessToken))
      .send({ checked: true })
      .expect(200);
    expect(checkedRes.body).toMatchObject({
      checked: true,
      checkedById: owner.userId,
    });

    const uncheckedRes = await request(server)
      .patch(`/households/${household.id}/shopping-list/${item.id}/check`)
      .set(...auth(owner.accessToken))
      .send({ checked: false })
      .expect(200);
    expect(uncheckedRes.body).toMatchObject({
      checked: false,
      checkedById: null,
    });
  });

  it('updates rawLabel/quantity/unit/position, 404s on an unknown id', async () => {
    const { owner, household } = await setup();
    const createRes = await request(server)
      .post(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .send({ rawLabel: 'Lait', quantity: 1, unit: 'L' })
      .expect(201);
    const item = createRes.body as ShoppingListItemBody;

    const updateRes = await request(server)
      .patch(`/households/${household.id}/shopping-list/${item.id}`)
      .set(...auth(owner.accessToken))
      .send({ quantity: 3, position: 5 })
      .expect(200);
    expect(updateRes.body).toMatchObject({ quantity: 3, position: 5 });

    await request(server)
      .patch(`/households/${household.id}/shopping-list/unknown-id`)
      .set(...auth(owner.accessToken))
      .send({ quantity: 1 })
      .expect(404);
  });

  it('deletes an item, then 404s on repeat', async () => {
    const { owner, household } = await setup();
    const createRes = await request(server)
      .post(`/households/${household.id}/shopping-list`)
      .set(...auth(owner.accessToken))
      .send({ rawLabel: 'Lait', quantity: 1, unit: 'L' })
      .expect(201);
    const item = createRes.body as ShoppingListItemBody;

    await request(server)
      .delete(`/households/${household.id}/shopping-list/${item.id}`)
      .set(...auth(owner.accessToken))
      .expect(204);

    await request(server)
      .delete(`/households/${household.id}/shopping-list/${item.id}`)
      .set(...auth(owner.accessToken))
      .expect(404);
  });

  describe('tenant isolation', () => {
    it("blocks a member of household B from household A's shopping list", async () => {
      const { owner: alice, household: householdA } = await setup();
      const bob = await registerUser(server, 'bob2@example.com');
      await createHousehold(server, bob.accessToken, 'Household B');

      const itemRes = await request(server)
        .post(`/households/${householdA.id}/shopping-list`)
        .set(...auth(alice.accessToken))
        .send({ rawLabel: 'Lait', quantity: 1, unit: 'L' })
        .expect(201);
      const item = itemRes.body as ShoppingListItemBody;

      await request(server)
        .get(`/households/${householdA.id}/shopping-list`)
        .set(...auth(bob.accessToken))
        .expect(403);
      await request(server)
        .patch(`/households/${householdA.id}/shopping-list/${item.id}/check`)
        .set(...auth(bob.accessToken))
        .send({ checked: true })
        .expect(403);
    });
  });
});
