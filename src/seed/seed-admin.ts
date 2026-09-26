import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UserRole } from '../common/enums/user-role.enum';
import { UsersService } from '../users/users.service';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  try {
    const name = process.env.ADMIN_NAME?.trim();
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD;

    if (!name || !email || !password) {
      throw new Error(
        'ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the first admin.',
      );
    }

    if (password.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
    }

    const existing = await usersService.findByEmailForAuthentication(email);

    if (existing) {
      console.log(`Admin seed skipped: ${email} already exists.`);
      return;
    }

    const admin = await usersService.create({
      name,
      email,
      password,
      role: UserRole.ADMIN,
    });

    console.log(`Admin created: ${admin.email} (${admin.id})`);
  } finally {
    await app.close();
  }
}

void seedAdmin();
