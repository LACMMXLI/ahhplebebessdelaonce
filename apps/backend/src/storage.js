import crypto from 'node:crypto';
import sharp from 'sharp';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand,
  CreateBucketCommand, PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { config } from './config.js';

const { s3: c } = config;
export const storageEnabled = Boolean(c.endpoint && c.accessKey && c.secretKey);

const client = storageEnabled
  ? new S3Client({
      endpoint: c.endpoint,
      region: c.region,
      forcePathStyle: true, // MinIO y similares usan /bucket/clave
      credentials: { accessKeyId: c.accessKey, secretAccessKey: c.secretKey },
    })
  : null;

export const imageUrl = (key) => (key && c.publicUrl ? `${c.publicUrl}/${c.bucket}/${key}` : null);

/** Crea el bucket si falta y lo deja de solo lectura pública. No bloquea el arranque si falla. */
export async function initStorage() {
  if (!storageEnabled) {
    console.warn('[storage] S3 no configurado: la subida de imágenes está desactivada');
    return;
  }
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: c.bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: c.bucket }));
    }
    await client.send(new PutBucketPolicyCommand({
      Bucket: c.bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${c.bucket}/*`],
        }],
      }),
    }));
    console.log(`[storage] bucket "${c.bucket}" listo`);
  } catch (e) {
    console.error(`[storage] no se pudo preparar el bucket: ${e.message}`);
  }
}

/** Reencoda a WebP (también elimina metadatos y neutraliza contenido no imagen). */
export async function saveImage(buffer) {
  if (!storageEnabled) throw Object.assign(new Error('Almacenamiento no configurado'), { status: 503 });
  let webp;
  try {
    webp = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw Object.assign(new Error('El archivo no es una imagen válida'), { status: 400 });
  }
  const key = `platillos/${crypto.randomUUID()}.webp`;
  await client.send(new PutObjectCommand({
    Bucket: c.bucket, Key: key, Body: webp, ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return key;
}

export async function deleteImage(key) {
  if (!storageEnabled || !key) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
  } catch (e) {
    console.error(`[storage] no se pudo borrar ${key}: ${e.message}`);
  }
}
