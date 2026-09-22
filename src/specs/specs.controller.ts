import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { SpecsService } from './specs.service';
import { RegisterSpecDto } from './dto/register-spec.dto';
import { DEMO_SPEC_NAME } from './spec-seeder.service';

/** Registration and read-only listing of named specs. */
@Controller({ path: 'specs', version: '1' })
export class SpecsController {
  constructor(private readonly specs: SpecsService) {}

  @Post()
  @HttpCode(201)
  register(@Body() dto: RegisterSpecDto) {
    return this.specs.register(dto.name, {
      radius: dto.radius,
      length: dto.length,
      viscosity: dto.viscosity,
      density: dto.density,
    });
  }

  /** Echo every registered spec. */
  @Get()
  list() {
    const specs = this.specs.list();
    return {
      count: specs.length,
      specs,
      demoSpec: DEMO_SPEC_NAME,
    };
  }
}
