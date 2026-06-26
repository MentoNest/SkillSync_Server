import { HttpException, HttpStatus } from '@nestjs/common';

export class DisputeWindowNotElapsed extends HttpException {
  constructor() {
    super(
      { statusCode: 500, error: 'DisputeWindowNotElapsed', message: 'Cannot auto-refund yet — dispute window has not elapsed' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class DisputeAlreadyOpen extends HttpException {
  constructor() {
    super(
      { statusCode: 501, error: 'DisputeAlreadyOpen', message: 'A dispute is already open for this session' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}

export class DisputeNotOpen extends HttpException {
  constructor() {
    super(
      { statusCode: 502, error: 'DisputeNotOpen', message: 'No open dispute found for this session' },
      HttpStatus.BAD_GATEWAY,
    );
  }
}

export class ResolutionNotAllowed extends HttpException {
  constructor() {
    super(
      { statusCode: 503, error: 'ResolutionNotAllowed', message: 'Session is not eligible for resolution' },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
