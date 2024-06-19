import { Errback, Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Errback, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err)
    }
    res.status(500)
    res.render('error', { error: err })
  }