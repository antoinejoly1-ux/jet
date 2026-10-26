import "server-only";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { contentDisposition, DOWNLOAD_TTL_SECONDS, UPLOAD_TTL_SECONDS, type StorageDriver } from "./shared";

/**
 * Private S3 bucket (ca-central-1). Credentials come from the standard AWS
 * environment variables. The upload URL is signed for the exact size, type and
 * SHA-256 checksum, so S3 rejects anything other than the file that was declared.
 */
export function s3StorageDriver(): StorageDriver {
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  const client = new S3Client({ region: env.S3_REGION });
  const Bucket = env.S3_BUCKET;

  return {
    async presignUpload(key, file) {
      const command = new PutObjectCommand({
        Bucket,
        Key: key,
        ContentType: file.contentType,
        ContentLength: file.sizeBytes,
        ChecksumSHA256: file.sha256Base64,
        ServerSideEncryption: "AES256",
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: UPLOAD_TTL_SECONDS,
        signableHeaders: new Set(["content-type", "content-length", "x-amz-checksum-sha256"]),
      });
      return {
        url,
        method: "PUT",
        headers: {
          "Content-Type": file.contentType,
          "x-amz-checksum-sha256": file.sha256Base64,
          "x-amz-server-side-encryption": "AES256",
        },
      };
    },

    async presignDownload(key, { filename, contentType, inline }) {
      const command = new GetObjectCommand({
        Bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: contentDisposition(filename, inline),
      });
      return getSignedUrl(client, command, { expiresIn: DOWNLOAD_TTL_SECONDS });
    },

    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { sizeBytes: Number(out.ContentLength ?? 0) };
      } catch (err) {
        if ((err as { name?: string }).name === "NotFound") return null;
        throw err;
      }
    },
  };
}
