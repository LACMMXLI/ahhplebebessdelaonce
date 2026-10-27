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
// La miniatura vive junto a la imagen: platillos/<id>.webp -> platillos/<id>-sm.webp
export const thumbKey = (key) => (key ? key.replace(/\.webp$/, '-sm.webp') : null);
export const thumbUrl = (key) => imageUrl(thumbKey(key));

/** Crea el bucket si falta y lo deja de solo lectura pública. No bloquea el arranque si falla. */
export async function initStorage() {
  if (!storageEnabled) {
    console.warn('[storage] S3 no configurado: la subida de imágenes está desactivada');
    return;
  }
  if (!c.publicUrl) console.warn('[storage] S3_PUBLIC_URL está vacío: las fotos se guardarán pero el navegador no podrá mostrarlas');
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

/** Reencoda a WebP (también elimina metadatos y neutraliza contenido no imagen) y crea una miniatura. */
export async function saveImage(buffer) {
  if (!storageEnabled) throw Object.assign(new Error('Almacenamiento no configurado'), { status: 503 });
  let full; let small;
  try {
    const img = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
    [full, small] = await Promise.all([
      img.clone().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
      img.clone().resize({ width: 480, height: 480, fit: 'cover', position: 'attention' }).webp({ quality: 74 }).toBuffer(),
    ]);
  } catch {
    throw Object.assign(new Error('El archivo no es una imagen válida'), { status: 400 });
  }
  const key = `platillos/${crypto.randomUUID()}.webp`;
  const put = (Key, Body) => client.send(new PutObjectCommand({
    Bucket: c.bucket, Key, Body, ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  await put(key, full);
  try {
    await put(thumbKey(key), small);
  } catch (e) {
    await deleteImage(key); // no dejar una imagen a medias
    throw e;
  }
  return key;
}

export async function deleteImage(key) {
  if (!storageEnabled || !key) return;
  for (const Key of [key, thumbKey(key)]) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: c.bucket, Key }));
    } catch (e) {
      console.error(`[storage] no se pudo borrar ${Key}: ${e.message}`);
    }
  }
}
