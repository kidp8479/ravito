import { PrismaService } from '../prisma/prisma.service';

// Shared by HouseholdMembershipGuard (HTTP) and ShoppingListGateway (RAV-14,
// websocket connection auth) - both need the exact same "is this user a
// member of this household" check, and a websocket's handleConnection
// lifecycle hook isn't interceptable by a NestJS guard the way a route or
// message handler is, so the gateway can't just reuse the guard directly.
export async function isHouseholdMember(
  prisma: PrismaService,
  householdId: string,
  userId: string,
): Promise<boolean> {
  const membership = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
  });
  return membership !== null;
}
