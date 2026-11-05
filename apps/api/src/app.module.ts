import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ArchiveController } from "./archive/archive.controller";
import { ArchiveService } from "./archive/archive.service";
import { ClientIpThrottlerGuard } from "./common/client-ip";
import { PrismaModule } from "./common/prisma.service";
import { AdminGuard, AuthGuard } from "./community/auth.guard";
import { AuthService } from "./community/auth.service";
import { CommunityController } from "./community/community.controller";
import { CommunityService } from "./community/community.service";
import { IngestionModule } from "./ingestion/ingestion.module";
import { StreamModule } from "./stream/stream.service";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: Number(process.env.THROTTLE_PER_MINUTE ?? 240) }]),
    PrismaModule,
    StreamModule,
    IngestionModule,
  ],
  controllers: [ArchiveController, CommunityController],
  providers: [ArchiveService, AuthService, CommunityService, AuthGuard, AdminGuard, { provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
export class AppModule {}
