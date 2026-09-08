import 'dotenv/config';

// Loads backend/.env if present, then guarantees every var the app's
// ConfigModule validates as required is at least set to *something* -
// e2e specs mock PrismaService and never touch a real database, so a
// syntactically valid placeholder (never a real credential) is enough.
// Without this, `make test` breaks on any checkout that has no
// backend/.env (e.g. one that has only ever used `make up`, whose env
// comes from docker-compose instead).
process.env.DATABASE_URL ??=
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env.JWT_ACCESS_SECRET ??= 'placeholder-jwt-access-secret-32-chars';
