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

function trustProxyHops(): number {
  const raw = process.env.TRUST_PROXY_HOPS ?? "0";
  const hops = Number(raw);
  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 2) {
    throw new Error("TRUST_PROXY_HOPS phai la so nguyen tu 0 den 2.");
  }
  return hops;
}

async function bootstrap() {
  // FE (apps/web) la app rieng, goi qua HTTP thuan tuy (khong SSR-proxy, khong session
  // chia se) - can CORS de trinh duyet cho phep goi tu domain khac. Dung Bearer token
  // (khong cookie) nen khong can credentials: true.
  // exposedHeaders: Content-Disposition khong nam trong danh sach header CORS "an toan"
  // mac dinh trinh duyet cho JS doc qua fetch() - can khai bao ro de FE (F11 tai xuong)
  // doc duoc ten file goi y neu can, du hien tai dung <a href download> (trinh duyet tu
  // ap dung header nay khi dieu huong, khong phu thuoc JS doc duoc hay khong).
  const app = await NestFactory.create(AppModule, {
    cors: { origin: corsOrigins(), exposedHeaders: ["Content-Disposition"] },
  });
  // Docker pilot exposes API only through the bundled proxy. Trust exactly its
  // one hop so req.ip is the client address for abuse controls, while a direct
  // API deployment keeps the safe default 0 and ignores X-Forwarded-For.
  const proxyHops = trustProxyHops();
  if (proxyHops > 0) {
    const expressApp = app.getHttpAdapter().getInstance() as { set(name: string, value: number): void };
    expressApp.set("trust proxy", proxyHops);
  }
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  );
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`MISA Flipbook API dang chay tren port ${port}`);
}

bootstrap();
