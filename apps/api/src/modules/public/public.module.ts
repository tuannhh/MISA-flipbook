import { Module } from "@nestjs/common";
import { PublicBooksController } from "./public-books.controller";

@Module({
  controllers: [PublicBooksController],
})
export class PublicModule {}
