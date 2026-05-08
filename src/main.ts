import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import serverlessExpress from "@codegenie/serverless-express";
import { Context } from "aws-lambda";
import { AppModule } from "./app.module";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let server: any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn"],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  const expressApp = app.getHttpAdapter().getInstance();
  return serverlessExpress({ app: expressApp });
}

export const handler = async (event: any, context: Context) => {
  server = server ?? (await bootstrap());
  return server(event, context);
};
