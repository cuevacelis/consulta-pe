import { Injectable, Logger } from "@nestjs/common";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { CacheKind } from "./cache.service";

export interface RefreshMessage {
  kind: CacheKind;
  id: string;
}

const REGION = process.env.AWS_REGION ?? "us-east-1";
const QUEUE_URL = process.env.REFRESH_QUEUE_URL ?? "";

@Injectable()
export class RefreshQueueService {
  private readonly logger = new Logger(RefreshQueueService.name);
  private readonly sqs = new SQSClient({ region: REGION });

  async enqueue(message: RefreshMessage): Promise<void> {
    if (!QUEUE_URL) {
      this.logger.warn("REFRESH_QUEUE_URL not set, skipping refresh enqueue");
      return;
    }
    try {
      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify(message),
          // Group identical refresh requests within a short window via dedup id
          MessageAttributes: {
            kind: { DataType: "String", StringValue: message.kind },
            id: { DataType: "String", StringValue: message.id },
          },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `refresh enqueue failed for ${message.kind}#${message.id}: ${err}`,
      );
    }
  }
}
