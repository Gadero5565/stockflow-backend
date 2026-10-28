import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

export async function createE2eApp(): Promise<{
  app: INestApplication;
  dataSource: DataSource;
}> {
  const moduleRef =
    await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

  const app =
    moduleRef.createNestApplication();

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  const dataSource =
    app.get(DataSource);

  assertSafeTestDatabase(dataSource);

  return {
    app,
    dataSource,
  };
}

export function assertSafeTestDatabase(
  dataSource: DataSource,
): void {
  const database = String(
    dataSource.options.database ?? '',
  ).toLowerCase();

  if (!database.includes('test')) {
    throw new Error(
      `Refusing to run destructive e2e setup against database "${database}". ` +
        'Use a dedicated database whose name contains "test".',
    );
  }
}

export async function resetE2eDatabase(
  dataSource: DataSource,
): Promise<void> {
  assertSafeTestDatabase(dataSource);

  // dropBeforeSync=true rebuilds the schema from the actual TypeORM entities.
  // This gives every e2e test a clean PostgreSQL database.
  await dataSource.synchronize(true);
}
