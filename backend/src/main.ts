import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Security Headers
  app.use(helmet());

  // CORS setup for local dev and frontend
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, Idempotency-Key',
    exposedHeaders: 'X-Cache-Lookup, X-Request-Id, X-Response-Time',
  });

  // API Global Prefix
  const globalPrefix = process.env.API_PREFIX || 'v1';
  app.setGlobalPrefix(globalPrefix);

  // Strict Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // OpenAPI / Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Cauri — Payment Sandbox API')
    .setDescription(
      'Deterministic payment intent simulation engine and cryptographic webhook dispatcher.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'Provide your test merchant key (e.g., sk_test_demo123)',
      },
      'api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Enable Graceful Shutdown (SIGTERM, SIGINT)
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Cauri API is running on http://localhost:${port}/${globalPrefix}`);
  logger.log(`📖 Swagger documentation is live at http://localhost:${port}/docs`);
}

bootstrap();
