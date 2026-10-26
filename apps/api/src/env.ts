import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/ravand_dev'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('127.0.0.1'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(16).default('ravand-local-development-secret-change-me'),
  UPLOAD_DIR: z.string().default('../../uploads'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = envSchema.parse(process.env);
