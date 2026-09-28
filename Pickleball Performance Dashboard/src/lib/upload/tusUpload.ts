import * as tus from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VIDEO_BUCKET } from "../api/sessions";

// Supabase's resumable endpoint requires exactly 6 MiB chunks.
const CHUNK_SIZE = 6 * 1024 * 1024;

export type UploadHandle = { abort: () => void; done: Promise<void> };

/**
 * Upload straight from the browser to private Storage over TUS. Progress is
 * fingerprinted in localStorage, so selecting the same file after a reload or
 * network drop resumes instead of restarting.
 */
export function startResumableUpload(
  sb: SupabaseClient,
  supabaseUrl: string,
  args: { file: File; objectName: string; contentType: string; onProgress: (fraction: number) => void },
): UploadHandle {
  let upload: tus.Upload | null = null;
  const done = new Promise<void>((resolve, reject) => {
    upload = new tus.Upload(args.file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: { "x-upsert": "false" },
      metadata: {
        bucketName: VIDEO_BUCKET,
        objectName: args.objectName,
        contentType: args.contentType,
        cacheControl: "3600",
      },
      // Long uploads can outlive an access token; attach a fresh one per request.
      onBeforeRequest: async (req) => {
        const { data } = await sb.auth.getSession();
        if (!data.session) throw new Error("Signed out during upload.");
        req.setHeader("Authorization", `Bearer ${data.session.access_token}`);
      },
      onProgress: (sent, total) => args.onProgress(total ? sent / total : 0),
      onError: (err) => reject(err),
      onSuccess: () => resolve(),
    });
    const u = upload;
    u.findPreviousUploads()
      .then((previous) => {
        if (previous.length) u.resumeFromPreviousUpload(previous[0]);
        u.start();
      })
      .catch(reject);
  });
  return { abort: () => void upload?.abort(), done };
}
