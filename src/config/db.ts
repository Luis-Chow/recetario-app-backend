import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from './env';

let memoryServer: MongoMemoryServer | null = null;

export async function connectDB(): Promise<string> {
  let uri = env.mongoUri;

  if (!uri) {
    // Solo en desarrollo: sin MONGODB_URI levanta una DB en RAM.
    // Import dinamico para que produccion (con Atlas) nunca cargue este paquete,
    // que es una devDependency y no se instala en runtime de produccion.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.log('[db] MONGODB_URI vacio: usando mongodb-memory-server (en RAM)');
  }

  await mongoose.connect(uri);
  return uri;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
