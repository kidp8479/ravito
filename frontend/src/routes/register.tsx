import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ensureAuthLoaded, getErrorMessage } from '@/lib/api';
import { useRegister } from '@/lib/auth';
import { getAuthState } from '@/lib/auth-store';

export const Route = createFileRoute('/register')({
  beforeLoad: async () => {
    await ensureAuthLoaded();
    if (getAuthState().status === 'authenticated') {
      throw redirect({ to: '/household' });
    }
  },
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    register.mutate(
      { email, password, displayName },
      {
        onSuccess: () => void navigate({ to: '/household' }),
        onError: (err) => setError(getErrorMessage(err)),
      },
    );
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create an account</CardTitle>
          <CardDescription>
            Join or start a household on Ravito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FormField label="Name" htmlFor="displayName">
              <Input
                id="displayName"
                autoComplete="name"
                required
                maxLength={100}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </FormField>
            <FormField label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            <FormField label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            <FormError message={error} />
            <Button type="submit" disabled={register.isPending}>
              {register.isPending ? 'Creating account...' : 'Create account'}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-center text-sm">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-foreground underline underline-offset-4"
            >
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
