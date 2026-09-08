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
import { ApiError, ensureAuthLoaded } from '@/lib/api';
import { useLogin } from '@/lib/auth';
import { getAuthState } from '@/lib/auth-store';

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    await ensureAuthLoaded();
    if (getAuthState().status === 'authenticated') {
      throw redirect({ to: '/household' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    login.mutate(
      { email, password },
      {
        onSuccess: () => void navigate({ to: '/household' }),
        onError: (err) =>
          setError(
            err instanceof ApiError ? err.message : 'Something went wrong.',
          ),
      },
    );
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Log in</CardTitle>
          <CardDescription>Welcome back to Ravito.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
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
                autoComplete="current-password"
                required
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            <FormError message={error} />
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? 'Logging in...' : 'Log in'}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-center text-sm">
            No account yet?{' '}
            <Link
              to="/register"
              className="text-foreground underline underline-offset-4"
            >
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
