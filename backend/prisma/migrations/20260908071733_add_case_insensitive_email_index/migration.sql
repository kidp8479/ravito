-- Hand-written: enforce case-insensitive email uniqueness at the database
-- level (Alice@x.com and alice@x.com must not both be able to sign up).
-- Prisma's schema DSL has no expression-index syntax, so this index has no
-- `schema.prisma` counterpart - see the comment on User.email. Never let a
-- future `prisma migrate diff` / `migrate dev` generate a migration that
-- drops "User_email_lower_key": it would silently remove this guarantee.
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower("email"));
