import { handle } from '../../core.js';

export default (req) => handle(req);
export const config = { path: ['/api/*', '/callback'] };
