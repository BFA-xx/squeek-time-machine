import { Module } from "@nestjs/common";
import { DigService } from "../dig/dig.service";
import { ArchiveWriter } from "./archive-writer.service";
import { ChainBackfillService } from "./chain-backfill.service";
import { IngestionService } from "./ingestion.service";
import { SqueekApiClient } from "./squeek-api.client";

@Module({
  providers: [SqueekApiClient, ChainBackfillService, ArchiveWriter, IngestionService, DigService],
  exports: [SqueekApiClient, ChainBackfillService, ArchiveWriter, IngestionService, DigService],
})
export class IngestionModule {}
