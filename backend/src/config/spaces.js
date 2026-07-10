// src/config/spaces.js
// Durable file storage on DigitalOcean Spaces (S3-compatible object storage).
//
// WHY THIS EXISTS: the app runs on DO App Platform, whose container filesystem is
// EPHEMERAL — it is wiped on every deploy, restart and scale event. Anything a user
// uploads to keep (inventory/PO photos, PR documents) therefore MUST NOT live on the
// local disk. It goes here instead, where it survives redeploys and is backed up.
//
// The five values below come from the DO dashboard (a Spaces bucket + a Spaces access
// key). They are set as App Platform environment variables and are never committed:
//   SPACES_ENDPOINT  e.g. https://blr1.digitaloceanspaces.com
//   SPACES_REGION    e.g. blr1
//   SPACES_BUCKET    e.g. bondbuild-uploads
//   SPACES_KEY       the access key
//   SPACES_SECRET    the secret key
//
// The client is created LAZILY so the app still boots when the vars are absent — the
// upload routes return a clear 503 until they are set, rather than crashing at startup.
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const path = require("path");

// Read the five settings. Primary names are SPACES_*, but we also accept the
// AWS-CLI-style names (aws_access_key_id / aws_secret_access_key / endpoint_url)
// so either naming convention in the App Platform env vars works.
const env = process.env;
const SPACES_ENDPOINT = env.SPACES_ENDPOINT || env.endpoint_url || env.ENDPOINT_URL;
const SPACES_REGION   = env.SPACES_REGION   || env.aws_region || env.AWS_REGION;
const SPACES_BUCKET   = env.SPACES_BUCKET   || env.aws_bucket || env.BUCKET;
const SPACES_KEY      = env.SPACES_KEY      || env.aws_access_key_id || env.AWS_ACCESS_KEY_ID;
const SPACES_SECRET   = env.SPACES_SECRET   || env.aws_secret_access_key || env.AWS_SECRET_ACCESS_KEY;

const isConfigured = () =>
  Boolean(SPACES_ENDPOINT && SPACES_REGION && SPACES_BUCKET && SPACES_KEY && SPACES_SECRET);

let _client = null;
const client = () => {
  if (!isConfigured()) {
    throw new Error("File storage (Spaces) is not configured on the server");
  }
  if (!_client) {
    _client = new S3Client({
      endpoint: SPACES_ENDPOINT,
      region: SPACES_REGION,
      credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
      forcePathStyle: false,
    });
  }
  return _client;
};

// A collision-proof object key inside a folder, preserving the original extension.
// Mirrors the old on-disk naming (timestamp + random) so keys stay readable.
const buildKey = (prefix, originalName) => {
  const ext = path.extname(originalName || "").toLowerCase();
  return `${prefix}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
};

// Store a buffer under `prefix/`. Returns the object key to persist in the DB
// (we keep this key in the existing file_path column — no schema change).
async function putBuffer({ prefix, buffer, contentType, originalName }) {
  const key = buildKey(prefix, originalName);
  await client().send(
    new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
      // No public-read ACL: the bucket stays private and files are served only
      // through the authenticated backend routes below.
    })
  );
  return key;
}

// Fetch an object. The returned .Body is a Node Readable stream. Throws with
// name "NoSuchKey" (or a 404 in $metadata) when the key does not exist.
async function getObject(key) {
  return client().send(new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: key }));
}

// Best-effort delete — a missing object is already the desired end state.
async function deleteObject(key) {
  if (!key) return;
  try {
    await client().send(new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: key }));
  } catch (_e) {
    /* ignore */
  }
}

// True when the SDK error means "object not found".
const isMissing = (e) =>
  e && (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404);

module.exports = { isConfigured, putBuffer, getObject, deleteObject, buildKey, isMissing };
