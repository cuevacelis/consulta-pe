import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RucService } from "./ruc.service";
import { ConsultaRucDto } from "./dto/consulta-ruc.dto";

@Controller("api/ruc")
export class RucController {
  constructor(private readonly rucService: RucService) {}

  @Get(":ruc")
  getByParam(@Param("ruc") ruc: string) {
    return this.rucService.consultar(ruc);
  }

  @Post()
  postByBody(@Body() body: ConsultaRucDto) {
    return this.rucService.consultar(body.ruc);
  }
}
