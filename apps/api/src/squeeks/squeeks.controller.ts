import { Controller, Get, Param } from "@nestjs/common";
import { SqueeksService } from "./squeeks.service";

@Controller("squeeks")
export class SqueeksController {
  constructor(private readonly squeeks: SqueeksService) {}
  @Get("owner/:address") owner(@Param("address") address: string) { return this.squeeks.forWallet(address); }
  @Get(":id") one(@Param("id") id: string) { return this.squeeks.one(id); }
}
