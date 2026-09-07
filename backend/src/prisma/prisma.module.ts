import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global: every domain module needs the same PrismaService instance rather
// than re-importing PrismaModule everywhere.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
