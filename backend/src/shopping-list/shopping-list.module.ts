import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ShoppingListController } from './shopping-list.controller';
import { ShoppingListGateway } from './shopping-list.gateway';
import { ShoppingListService } from './shopping-list.service';

@Module({
  imports: [AuthModule],
  controllers: [ShoppingListController],
  providers: [ShoppingListService, ShoppingListGateway],
})
export class ShoppingListModule {}
