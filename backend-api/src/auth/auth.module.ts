import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminUsersController } from './admin-users.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [StorageModule],
  controllers: [AuthController, AdminUsersController],
  providers: [AuthService, AdminAuthGuard],
  exports: [AuthService, AdminAuthGuard],
})
export class AuthModule {}
