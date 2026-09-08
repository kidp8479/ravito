-- CreateIndex
CREATE INDEX "HouseholdInvite_householdId_idx" ON "HouseholdInvite"("householdId");

-- CreateIndex
CREATE INDEX "HouseholdInvite_createdById_idx" ON "HouseholdInvite"("createdById");

-- CreateIndex
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");
