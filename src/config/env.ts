import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'cambia-este-secreto-en-produccion',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};
