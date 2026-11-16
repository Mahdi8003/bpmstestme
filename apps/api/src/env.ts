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

if (env.NODE_ENV === 'production') {
  if (env.COOKIE_SECRET.length < 32 || env.COOKIE_SECRET.includes('change-me')) {
    throw new Error(
      'COOKIE_SECRET must be a strong, unique value (32+ chars) in production.',
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set in production.');
  }
}
