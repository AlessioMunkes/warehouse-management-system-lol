import dotenv from 'dotenv';
import path from 'path';

const cwd = process.cwd();
const serverDir = path.basename(cwd) === 'server' ? cwd : path.join(cwd, 'server');

dotenv.config({ path: path.join(serverDir, '.env'), quiet: true });
