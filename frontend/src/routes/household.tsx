import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLogout, useMe } from '@/lib/auth';
import { getAuthState } from '@/lib/auth-store';
import { ensureAuthLoaded, getErrorMessage } from '@/lib/api';
import {
  useCreateHousehold,
  useCreateInvite,
  useHouseholdMembers,
  useJoinHousehold,
  useMyHouseholds,
  useRemoveMember,
  type HouseholdInvite,
  type HouseholdMember,
  type HouseholdSummary,
} from '@/lib/households';

export const Route = createFileRoute('/household')({
  beforeLoad: async () => {
    await ensureAuthLoaded();
    if (getAuthState().status !== 'authenticated') {
      throw redirect({ to: '/login' });
    }
  },
  component: HouseholdPage,
});

function HouseholdPage() {
  const navigate = useNavigate();
  const me = useMe();
  const logout = useLogout();
  const households = useMyHouseholds();

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ravito</h1>
          {me.data && (
            <p className="text-muted-foreground text-sm">
              Signed in as {me.data.displayName}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => void navigate({ to: '/login' }),
            })
          }
          disabled={logout.isPending}
        >
          Log out
        </Button>
      </header>

      {households.isLoading && (
        <p className="text-muted-foreground text-sm">
          Loading your household...
        </p>
      )}
      {households.isSuccess && households.data.length === 0 && (
        <div className="flex flex-col gap-6">
          <CreateHouseholdCard />
          <JoinHouseholdCard />
        </div>
      )}
      {households.isSuccess && households.data.length > 0 && (
        <HouseholdDetails household={households.data[0]} />
      )}
    </main>
  );
}

function CreateHouseholdCard() {
  const create = useCreateHousehold();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    create.mutate(name, {
      onSuccess: () => setName(''),
      onError: (err) => setError(getErrorMessage(err)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a household</CardTitle>
        <CardDescription>
          Start a new shared pantry for your home.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField label="Household name" htmlFor="household-name">
            <Input
              id="household-name"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormError message={error} />
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create household'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function JoinHouseholdCard() {
  const join = useJoinHousehold();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    join.mutate(code, {
      onSuccess: () => setCode(''),
      onError: (err) => setError(getErrorMessage(err)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join a household</CardTitle>
        <CardDescription>
          Enter the invite code someone shared with you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FormField label="Invite code" htmlFor="invite-code">
            <Input
              id="invite-code"
              required
              maxLength={64}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </FormField>
          <FormError message={error} />
          <Button type="submit" disabled={join.isPending}>
            {join.isPending ? 'Joining...' : 'Join household'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberRow({
  member,
  currentUserId,
  onRemove,
  removing,
}: {
  member: Pick<HouseholdMember, 'userId' | 'displayName' | 'role'>;
  currentUserId: string | undefined;
  onRemove: (userId: string) => void;
  removing: boolean;
}) {
  return (
    <li className="flex items-center justify-between text-sm">
      <span>
        {member.displayName}{' '}
        <span className="text-muted-foreground">({member.role})</span>
      </span>
      {currentUserId !== member.userId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(member.userId)}
          disabled={removing}
        >
          Remove
        </Button>
      )}
    </li>
  );
}

function HouseholdDetails({ household }: { household: HouseholdSummary }) {
  const me = useMe();
  const members = useHouseholdMembers(household.id);
  const createInvite = useCreateInvite(household.id);
  const removeMember = useRemoveMember(household.id);
  const [invite, setInvite] = useState<HouseholdInvite | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const currentUserId = me.data?.id;

  function handleRemove(userId: string) {
    setMemberError(null);
    removeMember.mutate(userId, {
      onError: (err) => setMemberError(getErrorMessage(err)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{household.name}</CardTitle>
        <CardDescription>
          You are {household.role === 'OWNER' ? 'the owner' : 'a member'} of
          this household.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {members.data?.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              currentUserId={currentUserId}
              onRemove={handleRemove}
              removing={removeMember.isPending}
            />
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() =>
              createInvite.mutate(undefined, {
                onSuccess: (data) => setInvite(data),
              })
            }
            disabled={createInvite.isPending}
          >
            {createInvite.isPending ? 'Generating...' : 'Generate invite code'}
          </Button>
          {invite && (
            <p className="text-sm">
              Code: <span className="font-mono">{invite.code}</span>{' '}
              <span className="text-muted-foreground">
                (expires {new Date(invite.expiresAt).toLocaleString()})
              </span>
            </p>
          )}
        </div>

        <FormError message={memberError} />
      </CardContent>
      <CardFooter>
        {currentUserId && (
          <Button
            variant="destructive"
            onClick={() => handleRemove(currentUserId)}
            disabled={removeMember.isPending}
          >
            Leave household
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
