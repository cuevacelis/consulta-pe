import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { DniService } from "./dni.service";
import { ConsultaDniDto } from "./dto/consulta-dni.dto";

@Controller("api/dni")
export class DniController {
  constructor(private readonly dniService: DniService) {}

  @Get(":dni")
  getByParam(@Param("dni") dni: string) {
    return this.dniService.consultar(dni);
  }

  @Post()
  postByBody(@Body() body: ConsultaDniDto) {
    return this.dniService.consultar(body.dni);
  }
}
