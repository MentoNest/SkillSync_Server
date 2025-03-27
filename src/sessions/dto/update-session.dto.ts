import { ApiProperty, PartialType } from "@nestjs/swagger";
import { CreateSessionDto } from "./create-session.dto";
import { SessionStatus } from "src/common/enums/SessionStatus.enum";

export class UpdateSessionDto extends PartialType(CreateSessionDto) {
    @ApiProperty({ example: 'completed', description: 'Session status' })
    status?: SessionStatus;
}
