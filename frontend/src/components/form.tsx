import type * as React from 'react';
import { Label } from '@/components/ui/label';

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-destructive text-sm">{message}</p>;
}

export { FormField, FormError };
