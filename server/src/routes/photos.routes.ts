import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PhotoKind } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';

/**
 * PHOTOS OF A CAR.
 *
 * The arrival photos matter most: they are your evidence when a shipper or a
 * supplier disputes damage, and that argument happens weeks later when nobody
 * remembers. The rest sell the car.
 *
 * Files are written to disk rather than into the database — a database full of
 * photos becomes slow to back up, and you would stop backing it up.
 */

export const UPLOAD_DIR = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  'uploads',
  'cars',
);

const MAX_BYTES = 8 * 1024 * 1024; // a phone photo, not a raw file

/** What a browser will actually display, checked by content and not by name. */
const SIGNATURES: { ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  { ext: '.jpg', type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: '.png',
    type: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: '.webp',
    type: 'image/webp',
    test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  },
];

/**
 * Trusting the file name would let anything be uploaded and later served back.
 * The first bytes say what a file really is, so that is what decides.
 */
function identify(buffer: Buffer) {
  const match = SIGNATURES.find((signature) => signature.test(buffer));
  if (!match)
    throw new AppError('That file is not a photo. Use a JPG, PNG or WEBP image from your phone.');
  return match;
}

export async function photoRoutes(app: FastifyInstance) {
  app.get('/api/cars/:id/photos', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    return prisma.carPhoto.findMany({ where: { carId: id }, orderBy: { id: 'asc' } });
  });

  app.post('/api/cars/:id/photos', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const car = await prisma.car.findUnique({ where: { id } });
    if (!car) throw notFound('Car not found');

    const file = await request.file({ limits: { fileSize: MAX_BYTES } });
    if (!file) throw new AppError('No photo was attached');

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      throw new AppError('That photo is too large. Keep photos under 8 MB.');
    }
    if (buffer.length === 0) throw new AppError('That photo is empty');
    if (buffer.length > MAX_BYTES)
      throw new AppError('That photo is too large. Keep photos under 8 MB.');

    const { ext } = identify(buffer);
    const kind = z
      .nativeEnum(PhotoKind)
      .catch(PhotoKind.SHOWROOM)
      .parse((file.fields?.kind as { value?: string } | undefined)?.value);
    const caption = (file.fields?.caption as { value?: string } | undefined)?.value?.trim() || null;

    await mkdir(UPLOAD_DIR, { recursive: true });
    // A random name: an uploaded name could collide, or try to escape the folder.
    const fileName = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
    await writeFile(join(UPLOAD_DIR, fileName), buffer);

    const photo = await prisma.carPhoto.create({
      data: { carId: id, fileName, kind, caption, bytes: buffer.length, createdBy: request.user?.id ?? null },
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'ADD_PHOTO',
      entity: 'Car',
      entityId: id,
      after: { photoId: photo.id, kind, bytes: buffer.length },
      ip: request.ip,
    });
    return photo;
  });

  app.delete('/api/photos/:photoId', async (request) => {
    const { photoId } = z.object({ photoId: z.coerce.number() }).parse(request.params);
    const photo = await prisma.carPhoto.findUnique({ where: { id: photoId }, include: { car: true } });
    if (!photo) throw notFound('Photo not found');

    // Arrival photos are evidence. Once the car is sold they stay put.
    if (photo.kind === PhotoKind.ARRIVAL && photo.car.status.startsWith('SOLD'))
      throw new AppError(
        'This is arrival evidence on a car that has been sold. It stays on the record.',
      );

    await prisma.carPhoto.delete({ where: { id: photoId } });
    await unlink(join(UPLOAD_DIR, photo.fileName)).catch(() => undefined);

    await audit(prisma, {
      userId: request.user?.id,
      action: 'DELETE_PHOTO',
      entity: 'Car',
      entityId: photo.carId,
      before: photo,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.patch('/api/photos/:photoId', async (request) => {
    const { photoId } = z.object({ photoId: z.coerce.number() }).parse(request.params);
    const input = z
      .object({ caption: z.string().optional().nullable(), kind: z.nativeEnum(PhotoKind).optional() })
      .parse(request.body);
    return prisma.carPhoto.update({
      where: { id: photoId },
      data: {
        ...(input.caption !== undefined ? { caption: input.caption?.trim() || null } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
      },
    });
  });
}

export const photoExtensions = SIGNATURES.map((s) => s.ext);
