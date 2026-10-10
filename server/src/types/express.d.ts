import type { AuthenticatedUser } from './index';

// Augment Express's Request so controllers can read `req.user`
// after the `authenticate` middleware has run.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
