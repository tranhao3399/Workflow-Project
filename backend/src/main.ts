import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/http/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.setGlobalPrefix('api');
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
