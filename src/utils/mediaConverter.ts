import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  ImageMagick,
  MagickFormat,
  IMagickImage,
  IMagickImageCollection,
} from '@imagemagick/magick-wasm';

/**
 * A single shared FFmpeg instance to avoid re-initializing for every file.
 */
let ffmpeg: FFmpeg | null = null;

/**
 * Set the FFmpeg instance from App.tsx
 */
export function setFFmpegInstance(instance: FFmpeg) {
  ffmpeg = instance;
}

/**
 * Tracks the current conversion process for cancellation
 */
let isCancelled = false;

/**
 * Cancel the current conversion process by terminating FFmpeg instance
 */
export async function cancelConversion() {
  isCancelled = true;
  if (ffmpeg) {
    // Terminate the current FFmpeg instance
    try {
      await ffmpeg.terminate();
    } catch (error) {
      console.error('Error terminating FFmpeg:', error);
    }
    ffmpeg = null;
  }
}

/**
 * Convert media files (images or videos) to various target formats using FFmpeg or ImageMagick.
 * @param file         The input File (image or video).
 * @param targetFormat The desired output format (e.g., "png", "jpg", "gif", "mp4", "webm", etc.).
 * @param onProgress   Callback function to provide progress updates (0–100).
 * @param onLog        Callback function to log messages (for debugging or progress).
 * @returns            A Blob of the converted media in the requested format.
 * @throws            Error if the conversion is cancelled or fails
 */
export async function convertMedia(
  file: File,
  targetFormat: string,
  onProgress: (progress: number) => void,
  onLog: (message: string) => void
): Promise<Blob> {
  // Reset cancellation state at the start of each conversion
  isCancelled = false;

  try {
    // 1) Enforce file size limit (e.g., 100MB)
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('File too large. Maximum size is 100MB.');
    }

    // Basic type checks
    const isInputVideo = file.type.startsWith('video/');
    const isInputAudio = file.type.startsWith('audio/');
    const isTargetVideo = isVideoFormat(targetFormat);
    const isTargetAudio = isAudioFormat(targetFormat);

    // For standard image-to-image conversions, we can use ImageMagick directly,
    // unless it's a special case like animated WebP → video (handled by FFmpeg).
    const isImageToImage = !isInputVideo && !isInputAudio && !isTargetVideo && !isTargetAudio;

    // If it's a simple static image → static image, use ImageMagick (faster & lighter).
    // For WebP to PNG specifically, or any other static image conversion, use ImageMagick
    if (isImageToImage && (!file.type.includes('webp') || targetFormat.toLowerCase() === 'png')) {
      return await convertWithImageMagick(file, targetFormat, onProgress, onLog);
    }

    // Otherwise, use FFmpeg for everything else (video, audio, or animated WebP to video).
    return await convertWithFFmpeg(
      file,
      targetFormat,
      onProgress,
      onLog,
      isInputVideo,
      isInputAudio,
      isTargetVideo,
      isTargetAudio
    );
  } catch (error) {
    if (isCancelled) {
      throw new Error('Conversion cancelled');
    }
    onLog(`Conversion error: ${error}`);
    console.error('Conversion error:', error);
    throw error;
  }
}

/**
 * Convert simple images with ImageMagick.
 * Ideal for static image-to-image conversions (e.g., PNG → JPG, etc.).
 */
async function convertWithImageMagick(
  file: File,
  targetFormat: string,
  onProgress: (progress: number) => void,
  onLog: (message: string) => void
): Promise<Blob> {
  onLog('Reading image data...');
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  return new Promise<Blob>((resolve, reject) => {
    try {
      if (isCancelled) {
        reject(new Error('Conversion cancelled'));
        return;
      }

      ImageMagick.read(uint8Array, (image: IMagickImage) => {
        if (isCancelled) {
          reject(new Error('Conversion cancelled'));
          return;
        }

        onProgress(50); // halfway: reading complete

        // Map common format names to MagickFormat enum values
        const formatMap: Record<string, keyof typeof MagickFormat> = {
          'png': 'Png',
          'jpg': 'Jpg',
          'jpeg': 'Jpg',
          'webp': 'WebP',
          'gif': 'Gif',
          'bmp': 'Bmp',
          'tiff': 'Tiff'
        };

        const formatKey = formatMap[targetFormat.toLowerCase()];
        if (!formatKey) {
          reject(new Error(`Unsupported target format: ${targetFormat}`));
          return;
        }

        const format = MagickFormat[formatKey];
        onLog(`Converting to format: ${formatKey}`);
        
        // Set the format and convert
        image.format = format;
        image.write(format, (data: Uint8Array) => {
          if (isCancelled) {
            reject(new Error('Conversion cancelled'));
            return;
          }

          onProgress(100); // conversion complete
          const blob = new Blob([data], { type: `image/${targetFormat}` });
          resolve(blob);
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Convert using FFmpeg for videos, audio, or special cases
 * (e.g., animated WebP to video, video→image, etc.).
 */
async function convertWithFFmpeg(
  file: File,
  targetFormat: string,
  onProgress: (progress: number) => void,
  onLog: (message: string) => void,
  isInputVideo: boolean,
  isInputAudio: boolean,
  isTargetVideo: boolean,
  isTargetAudio: boolean
): Promise<Blob> {
  // Get the FFmpeg instance from App.tsx
  if (!ffmpeg) {
    throw new Error('FFmpeg is not initialized. Please wait for initialization to complete.');
  }

  let ffmpegInputName = `input_${file.name}`;
  let tempFiles: string[] = [];

  try {
    /**
     * Special case: animated WebP → video
     * For animated WebP, we'll use ImageMagick to extract frames with coalescing,
     * then pass frames to FFmpeg to convert to a video.
     */
    if (file.type === 'image/webp' && isTargetVideo) {
      onLog('Detected animated WEBP input, extracting frames with ImageMagick...');

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Step 1: Extract frames with coalescing.
      const frameInfo = await new Promise<{
        ffmpegInputName: string;
        tempFiles: string[];
        frameCount: number;
      }>((resolve, reject) => {
        try {
          ImageMagick.readCollection(uint8Array, async (images: IMagickImageCollection) => {
            try {
              if (isCancelled) {
                reject(new Error('Conversion cancelled'));
                return;
              }

              images.coalesce(); // ensure each frame is fully composited
              const frameCount = images.length;
              const frameNames: string[] = [];
              
              // Process frames in batches of 10
              const BATCH_SIZE = 10;
              for (let i = 0; i < frameCount; i += BATCH_SIZE) {
                if (isCancelled) {
                  reject(new Error('Conversion cancelled'));
                  return;
                }

                const batchPromises: Promise<string>[] = [];
                const end = Math.min(i + BATCH_SIZE, frameCount);
                
                for (let j = i; j < end; j++) {
                  const frameName = `frame-${j.toString().padStart(4, '0')}.png`;
                  frameNames.push(frameName);
                  
                  const framePromise = new Promise<string>((resolveFrame) => {
                    // Use setTimeout to give the main thread a chance to breathe
                    setTimeout(() => {
                      if (isCancelled) {
                        resolveFrame(frameName); // Resolve to allow cleanup
                        return;
                      }

                      const frame = images[j];
                      frame.write(MagickFormat.Png, async (data: Uint8Array) => {
                        try {
                          if (isCancelled) {
                            resolveFrame(frameName); // Resolve to allow cleanup
                            return;
                          }

                          const safeData = new Uint8Array(data);
                          await ffmpeg!.writeFile(frameName, safeData);
                          resolveFrame(frameName);
                        } catch (error) {
                          console.error(`Error writing frame ${j}:`, error);
                          resolveFrame(frameName); // Resolve anyway to not block the batch
                        }
                      });
                    }, 0);
                  });
                  
                  batchPromises.push(framePromise);
                }
                
                // Wait for the current batch to complete
                await Promise.all(batchPromises);
                
                // Update progress based on completed frames
                const progress = Math.round((end / frameCount) * 40); // Use 40% of the progress bar for frame extraction
                onProgress(progress);
                onLog(`Processed ${end}/${frameCount} frames`);
              }
              
              onLog('All frames extracted and written to FFmpeg filesystem');
              resolve({
                ffmpegInputName: 'frame-%04d.png',
                tempFiles: frameNames,
                frameCount,
              });
            } catch (error) {
              reject(error);
            }
          });
        } catch (error) {
          reject(error);
        }
      });

      if (isCancelled) {
        // Clean up any frames that were created before cancellation
        await cleanupTempFiles(ffmpeg, frameInfo.tempFiles, onLog);
        throw new Error('Conversion cancelled');
      }

      ffmpegInputName = frameInfo.ffmpegInputName;
      tempFiles = frameInfo.tempFiles;

      // Step 2: Prepare output name
      const outputName = `output.${targetFormat}`;
      onLog(`Converting frames to ${outputName}`);

      // Set up FFmpeg log and progress callbacks for animated WebP conversion
      ffmpeg!.on('log', ({ message }) => onLog(message));
      ffmpeg!.on('progress', ({ progress }) => {
        if (typeof progress === 'number' && !isNaN(progress)) {
          // Progress is already a value between 0 and 1
          onProgress(40 + Math.round(progress * 60));
        }
      });

      // For simplicity, pick a constant frame rate (e.g., 25 fps).
      const ffmpegArgs: string[] = [
        '-framerate',
        '25',
        '-i',
        ffmpegInputName,
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2', // ensures width & height are even
        '-c:v',
        getVideoCodec(targetFormat),
        '-pix_fmt',
        'yuv420p',
        outputName,
      ];

      onLog('Running FFmpeg with args: ' + ffmpegArgs.join(' '));
      await ffmpeg!.exec(ffmpegArgs);

      if (isCancelled) {
        // Clean up all temporary files
        await cleanupTempFiles(ffmpeg, [...tempFiles, outputName], onLog);
        throw new Error('Conversion cancelled');
      }

      onLog('Conversion completed');

      // Read the output file
      onLog('Reading output file...');
      const data = await ffmpeg!.readFile(outputName);
      onLog('Output file read successfully');

      // Create the Blob (video/targetFormat)
      const mimeType = `video/${targetFormat}`;
      const outputBlob = new Blob([data], { type: mimeType });

      // Cleanup temporary frames and output file
      onLog('Cleaning up temporary files...');
      await cleanupTempFiles(ffmpeg, tempFiles.concat([outputName, 'palette.png']), onLog);

      return outputBlob;
    } else {
      // Generic case for any other scenario (video→video, video→image, audio→audio, etc.)

      // Step 3) Prepare input/output names
      const outputName = `output.${targetFormat}`;
      onLog(`Converting ${ffmpegInputName} to ${outputName}`);

      // Step 4) Write the file to FFmpeg file system
      onLog('Writing input file to FFmpeg filesystem...');
      await ffmpeg.writeFile(ffmpegInputName, await fetchFile(file));

      if (isCancelled) {
        await cleanupTempFiles(ffmpeg, [ffmpegInputName], onLog);
        throw new Error('Conversion cancelled');
      }

      // Step 5) Set up log and progress handlers
      ffmpeg.on('log', ({ message }) => onLog(message));
      ffmpeg.on('progress', (event: { progress: number }) => {
        if (typeof event.progress === 'number' && !isNaN(event.progress)) {
          onProgress(Math.round(event.progress * 100));
        }
      });

      // Step 6) Construct FFmpeg argument list based on scenario
      let ffmpegArgs: string[] = [];

      // Scenario B: Image → Video (e.g., static PNG → MP4)
      if (!isInputVideo && !isInputAudio && isTargetVideo) {
        onLog('Detected image → video scenario; defaulting to 5 seconds, 25 fps.');
        ffmpegArgs = [
          '-loop',
          '1',
          '-t',
          '5',
          '-i',
          ffmpegInputName,
          '-c:v',
          getVideoCodec(targetFormat),
          '-pix_fmt',
          'yuv420p',
          '-r',
          '25',
          outputName,
        ];

        // Scenario C: Video → Image (e.g., MP4 → single PNG frame)
      } else if (isInputVideo && !isTargetVideo && !isTargetAudio) {
        ffmpegArgs = [
          '-i',
          ffmpegInputName,
          '-vf',
          'scale=iw:ih',
          '-frames:v',
          '1', // output only one frame
          outputName,
        ];

        // Scenario D: Video → Video
      } else if (isInputVideo && isTargetVideo) {
        ffmpegArgs = [
          '-i',
          ffmpegInputName,
          '-c:v',
          getVideoCodec(targetFormat),
          '-c:a',
          getAudioCodec(targetFormat),
          outputName,
        ];

        // Scenario E: Audio → Audio
      } else if (isInputAudio && isTargetAudio) {
        ffmpegArgs = [
          '-i',
          ffmpegInputName,
          '-c:a',
          getAudioCodec(targetFormat),
          outputName,
        ];

        // Scenario F: Video → Audio (extract audio stream)
      } else if (isInputVideo && isTargetAudio) {
        ffmpegArgs = [
          '-i',
          ffmpegInputName,
          '-vn',
          '-c:a',
          getAudioCodec(targetFormat),
          outputName,
        ];
      }

      // Special Case: Video → GIF (using palette method for better quality)
      if (isInputVideo && targetFormat.toLowerCase() === 'gif') {
        onLog('Detected video → GIF; using palette-based approach for better quality.');
        const paletteName = 'palette.png';

        // Generate palette
        await ffmpeg.exec([
          '-i',
          ffmpegInputName,
          '-filter_complex',
          '[0:v] palettegen',
          paletteName,
        ]);

        // Use palette to create optimized GIF
        ffmpegArgs = [
          '-i',
          ffmpegInputName,
          '-i',
          paletteName,
          '-filter_complex',
          '[0:v][1:v] paletteuse',
          outputName,
        ];
      }

      // Step 7) Run FFmpeg
      onLog('Running FFmpeg with args: ' + ffmpegArgs.join(' '));
      try {
        await ffmpeg.exec(ffmpegArgs);
      } catch (error) {
        if (isCancelled) {
          throw new Error('Conversion cancelled');
        }
        throw error;
      }

      if (isCancelled) {
        throw new Error('Conversion cancelled');
      }

      onLog('Conversion completed');

      // Step 8) Retrieve converted file
      onLog('Reading output file...');
      const data = await ffmpeg.readFile(outputName);
      onLog('Output file read successfully');

      // Step 9) Clean up
      onLog('Cleaning up temporary files...');
      await cleanupTempFiles(ffmpeg, [ffmpegInputName, outputName, 'palette.png'], onLog);

      // Step 10) Create and return a Blob
      const mimeType = isTargetVideo ? `video/${targetFormat}` : `image/${targetFormat}`;
      return new Blob([data], { type: mimeType });
    }
  } catch (error) {
    // Clean up any remaining temporary files
    await cleanupTempFiles(ffmpeg, tempFiles, onLog);
    throw error;
  }
}

/**
 * Utility to clean up temporary files.
 */
async function cleanupTempFiles(
  ffmpegInstance: FFmpeg | null,
  files: string[],
  onLog: (message: string) => void
) {
  if (!ffmpegInstance) return;
  for (const filename of files) {
    try {
      await ffmpegInstance.deleteFile(filename);
    } catch (e) {
      // Only log a warning; don't throw an error to disrupt the flow
      onLog(`Warning: Could not delete file ${filename}: ${e}`);
    }
  }
}

/**
 * Determine which video codec to use for the given format.
 * Adjust as needed for your environment or any licensing constraints.
 */
function getVideoCodec(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp4':
      return 'libx264';
    case 'webm':
      return 'libvpx-vp9';
    case 'gif':
      return 'gif';
    default:
      return 'libx264'; // Default to H.264
  }
}

/**
 * Determine which audio codec to use for the given format.
 */
function getAudioCodec(format: string): string {
  switch (format.toLowerCase()) {
    case 'mp3':
      return 'libmp3lame';
    case 'aac':
      return 'aac';
    case 'ogg':
      return 'libvorbis';
    case 'wav':
      return 'pcm_s16le';
    case 'm4a':
      return 'aac';
    case 'flac':
      return 'flac';
    default:
      return 'aac'; // Default to AAC
  }
}

/**
 * Helper: decide if a format is typically a video format.
 * Extend this list as needed (e.g. "avi", "mkv", "flv", etc.).
 */
function isVideoFormat(format: string): boolean {
  return ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'gif'].includes(format.toLowerCase());
}

/**
 * Helper: decide if a format is typically an audio format.
 * Extend this list as needed.
 */
function isAudioFormat(format: string): boolean {
  return ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(format.toLowerCase());
}
