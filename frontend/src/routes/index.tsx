import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-3xl font-semibold">Ravito</h1>
      <p className="text-gray-500 dark:text-gray-400">
        Shared household pantry and shopping list.
      </p>
    </main>
  );
}
