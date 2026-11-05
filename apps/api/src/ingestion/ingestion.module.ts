import { Module } from "@nestjs/common";
import { ArchiveWriter } from "./archive-writer.service";
import { ChainBackfillService } from "./chain-backfill.service";
import { IngestionService } from "./ingestion.service";
import { SqueekApiClient } from "./squeek-api.client";

@Module({
  providers: [SqueekApiClient, ChainBackfillService, ArchiveWriter, IngestionService],
  exports: [SqueekApiClient, ChainBackfillService, ArchiveWriter, IngestionService],
})
export class IngestionModule {}
