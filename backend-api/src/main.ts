import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT || 3000);

  await app.listen(port, '0.0.0.0');
  console.log(`He thong san sang tai http://localhost:${port}/admin`);
}

bootstrap();
