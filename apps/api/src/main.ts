import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

function corsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return false; // mac dinh khong mo CORS neu khong khai bao ro
  if (raw === "*") return true;
  return raw.split(",").map((s) => s.trim());
}

async function bootstrap() {
  // FE (apps/web) la app rieng, goi qua HTTP thuan tuy (khong SSR-proxy, khong session
  // chia se) - can CORS de trinh duyet cho phep goi tu domain khac. Dung Bearer token
  // (khong cookie) nen khong can credentials: true.
  const app = await NestFactory.create(AppModule, { cors: { origin: corsOrigins() } });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  );
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`MISA Flipbook API dang chay tren port ${port}`);
}

bootstrap();
