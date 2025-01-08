import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Reuse the same FFmpeg instance to avoid re-initializing for every file
let ffmpeg: FFmpeg | null = null;

/**
 * Convert media files (images or videos) to various target formats using FFmpeg.
 *
 * @param file         The input File (image or video).
 * @param targetFormat The desired output format (e.g., "png", "jpg", "gif", "mp4", "webm", etc.).
 * @param onProgress   Callback function to provide progress updates (0–100).
 * @returns            A Blob of the converted media in the requested format.
 */
export async function convertMedia(
  file: File,
  targetFormat: string,
  onProgress: (progress: number) => void,
  onLog: (message: string) => void
): Promise<Blob> {
  try {
    // 1) Enforce file size limit (e.g., 100MB)
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('File too large. Maximum size is 100MB.');
    }

    // 2) Lazy-initialize the FFmpeg instance
    if (!ffmpeg) {
      console.log('Initializing FFmpeg...');
      ffmpeg = new FFmpeg();
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm';

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      console.log('FFmpeg initialized successfully');
    }

    // 3) Prepare input/output names
    const inputName = `input_${file.name}`;          // e.g., "input_myvideo.mp4"
    const outputName = `output.${targetFormat}`;     // e.g., "output.gif"
    console.log(`Converting ${inputName} to ${outputName}`);

    // 4) Write the file to the FFmpeg file system
    console.log('Writing input file to FFmpeg filesystem...');
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    // 5) Set up log and progress handlers
    ffmpeg.on('log', ({ message }) => {
      onLog(message);
    });

    ffmpeg.on('progress', ({ progress }) => {
      if (progress && !isNaN(progress)) {
        onProgress(Math.round(progress * 100));
      }
    });

    // 6) Detect input type and guess target type
    //    We'll keep it simple: if input starts with "video/", treat as video
    //    else treat as image. For audio-only conversions, you could do similar checks.
    const isInputVideo = file.type.startsWith('video/');
    const isTargetVideo = isVideoFormat(targetFormat);
    console.log(`Input is ${isInputVideo ? 'video' : 'image'}, target is ${isTargetVideo ? 'video' : 'image'}`);

    // 7) Construct FFmpeg argument list based on scenarios
    let ffmpegArgs: string[] = [];

    // Scenario A: Image → Image
    if (!isInputVideo && !isTargetVideo) {
      // Example arguments for converting one image format to another (PNG, JPG, WEBP, etc.)
      // Using '-frames:v 1' ensures only a single frame is output if the file is multi-frame (e.g. animated GIF).
      ffmpegArgs = [
        '-i', inputName,
        outputName,
      ];

    // Scenario B: Image → Video
    } else if (!isInputVideo && isTargetVideo) {
      // Converting a static image to a video (e.g., 5-second loop)
      // By default, this will produce a 5-second video from the single image.
      ffmpegArgs = [
        '-loop', '1',         // Loop the input image
        '-t', '5',            // Duration = 5 seconds (adjust as needed)
        '-i', inputName,
        '-c:v', getVideoCodec(targetFormat),
        '-pix_fmt', 'yuv420p',
        '-r', '30',           // Framerate
        outputName,
      ];

    // Scenario C: Video → Image
    } else if (isInputVideo && !isTargetVideo) {
      // Extracting a single frame from a video
      // Could also do something like '-frames:v 10' to get multiple frames,
      // or '-vf', 'fps=1' to get 1 frame per second, etc.
      ffmpegArgs = [
        '-i', inputName,
        '-vf', 'scale=iw:ih', // Keep original size (you could add resizing)
        '-q:v', '2',
        '-frames:v', '1',     // Just output the first frame as an image
        outputName,
      ];

    // Scenario D: Video → Video
    } else {
      // Generic video-to-video conversion
      // If you want audio copied as-is, you can do '-c:a', 'copy'.
      // If you want to re-encode, specify a codec like 'aac' for audio.
      ffmpegArgs = [
        '-i', inputName,
        '-c:v', getVideoCodec(targetFormat),
        '-c:a', 'aac',
        '-b:a', '192k', // Example: setting audio bitrate
        '-pix_fmt', 'yuv420p', // Ensures better compatibility for some formats
        outputName,
      ];
    }

    // Special Case: Video → GIF
    // If you specifically want to handle a scenario of video → GIF with palette for better quality,
    // you could handle it like:
    if (isInputVideo && targetFormat.toLowerCase() === 'gif') {
      // For a high-quality GIF, you may want a two-pass approach with a palette.
      // This is an OPTIONAL improvement. One-pass is simpler but yields bigger/lower-quality GIFs.
      // (Comment out or remove if you don't want it.)
      console.log('Detected video → GIF; using palette-based approach for better quality.');

      const paletteName = 'palette.png';

      // 1) Generate palette
      await ffmpeg.exec([
        '-i', inputName,
        '-filter_complex', '[0:v] palettegen',
        paletteName,
      ]);

      // 2) Use palette to create optimized GIF
      ffmpegArgs = [
        '-i', inputName,
        '-i', paletteName,
        '-filter_complex', '[0:v][1:v] paletteuse',
        outputName,
      ];
    }

    // 8) Run FFmpeg
    console.log('Running FFmpeg with args:', ffmpegArgs);
    await ffmpeg.exec(ffmpegArgs);
    console.log('Conversion completed');

    // 9) Retrieve converted file
    console.log('Reading output file...');
    const data = await ffmpeg.readFile(outputName);
    console.log('Output file read successfully');

    // 10) Clean up
    console.log('Cleaning up temporary files...');
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    // If you generated a palette file, you can delete it too
    try {
      await ffmpeg.deleteFile('palette.png');
    } catch {
      // no-op if it doesn't exist
    }

    // 11) Create and return a Blob
    const mimeType = isTargetVideo ? `video/${targetFormat}` : `image/${targetFormat}`;
    return new Blob([data], { type: mimeType });

  } catch (error) {
    console.error('Conversion error:', error);
    throw error;
  }
}

/**
 * Decide which video codec to use for a given format.
 */
function getVideoCodec(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp4':
      return 'libx264';
    case 'webm':
      return 'libvpx-vp9';
    case 'mov':
      return 'libx264';
    case 'mkv':
      return 'libx264'; // or 'libvpx-vp9' if preferred
    case 'gif':
      // Technically not a video codec, but we handle GIF differently above.
      // Fallback to something generic if we get here by accident.
      return 'libx264';
    default:
      // Default to H.264 for unknown formats (may fail if format is truly unknown).
      return 'libx264';
  }
}

/**
 * Quick helper to decide if a format is typically a video format.
 * Extend as needed (e.g. "avi", "flv", "mkv", etc.).
 */
function isVideoFormat(format: string): boolean {
  const videoFormats = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'gif']; 
  return videoFormats.includes(format.toLowerCase());
}
