import { useState, useEffect } from 'react';
import {
  MantineProvider,
  Container,
  Title,
  Paper,
  Select,
  Button,
  Text,
  Group,
  Stack,
  Progress,
  createTheme,
  LoadingOverlay,
} from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { Dropzone } from '@mantine/dropzone';
import { IconUpload, IconPhoto, IconVideo, IconMusic } from '@tabler/icons-react';
import { convertMedia, setFFmpegInstance, cancelConversion } from './utils/mediaConverter';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { initializeImageMagick } from '@imagemagick/magick-wasm';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dropzone/styles.css';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
});

const videoFormats = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv'];
const imageFormats = ['jpg', 'png', 'webp', 'gif', 'bmp', 'tiff'];
const audioFormats = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [converting, setConverting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializingLibs, setInitializingLibs] = useState(true);

  // Pre-initialize FFmpeg and ImageMagick
  useEffect(() => {
    async function initializeLibraries() {
      try {
        // Initialize FFmpeg
        const ffmpeg = new FFmpeg();
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setFFmpegInstance(ffmpeg);

        // Initialize ImageMagick
        await initializeImageMagick(
          new URL('https://unpkg.com/@imagemagick/magick-wasm@0.0.32/dist/magick.wasm')
        );

        setInitializingLibs(false);
      } catch (error) {
        console.error('Failed to initialize libraries:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to initialize conversion libraries. Please refresh the page.',
          color: 'red',
          autoClose: false,
        });
      }
    }

    initializeLibraries();
  }, []);

  const isValidMediaType = (type: string) => {
    return type.startsWith('audio/') || type.startsWith('video/') || type.startsWith('image/');
  };

  const isValidMediaUrl = (url: string) => {
    try {
      const parsedUrl = new URL(url);
      const extension = parsedUrl.pathname.split('.').pop()?.toLowerCase() || '';
      return [...videoFormats, ...imageFormats, ...audioFormats].includes(extension);
    } catch {
      return false;
    }
  };

  const downloadFile = async (url: string) => {
    try {
      setLoading(true);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch file');
      
      const contentType = response.headers.get('content-type') || '';
      if (!isValidMediaType(contentType)) {
        throw new Error('Invalid media type');
      }

      const blob = await response.blob();
      const fileName = url.split('/').pop() || 'downloaded-file';
      const file = new File([blob], fileName, { type: contentType });
      handleDrop([file]);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to download file',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async (e: ClipboardEvent) => {
    e.preventDefault();
    
    // Handle files directly pasted
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length > 0) {
      const validFiles = files.filter(file => isValidMediaType(file.type));
      if (validFiles.length > 0) {
        handleDrop([validFiles[0]]);
        return;
      }
    }

    // Handle pasted URL
    const text = e.clipboardData?.getData('text');
    if (text && isValidMediaUrl(text)) {
      await downloadFile(text);
    }
  };

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const handleDrop = (files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      // Reset states
      setProgress(0);
      setConverting(false);
      setTargetFormat(null);
    }
  };

  const getAvailableFormats = () => {
    if (!file) return [];
    
    // Determine available formats based on input file type
    const isAudio = file.type.startsWith('audio/');
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    let availableFormats: string[] = [];
    if (isAudio) {
      availableFormats = audioFormats;
    } else if (isVideo) {
      availableFormats = [...videoFormats, ...audioFormats]; // Allow extracting audio from video
    } else if (isImage) {
      availableFormats = [...imageFormats, ...videoFormats];
    }

    return availableFormats
      .filter(format => !file.name.endsWith(format))
      .map(format => ({ value: format, label: format.toUpperCase() }));
  };

  const handleLog = (message: string) => {
    console.log(message);
  };

  const handleConvert = async () => {
    if (!file || !targetFormat) return;
    
    setConverting(true);
    setProgress(0);

    try {
      console.log(`Starting conversion of ${file.name} to ${targetFormat}`);
      const blob = await convertMedia(file, targetFormat, setProgress, handleLog);

      // Create and trigger download of converted file
      const fileName = file.name.split('.')[0] + '.' + targetFormat;
      console.log(`Creating download for ${fileName}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      notifications.show({
        title: 'Success',
        message: 'File converted successfully!',
        color: 'green',
        autoClose: 5000,
      });
    } catch (error) {
      console.error('Conversion failed:', error);
      notifications.show({
        title: 'Error',
        message: error instanceof Error 
          ? `Conversion failed: ${error.message}`
          : 'Failed to convert file. Check console for details.',
        color: 'red',
        autoClose: false,
      });
    } finally {
      setConverting(false);
      setProgress(0);
    }
  };

  const handleCancel = () => {
    cancelConversion();
    notifications.show({
      title: 'Cancelled',
      message: 'Conversion cancelled. Please wait for cleanup to complete...',
      color: 'yellow',
    });
  };

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <LoadingOverlay
        visible={initializingLibs}
        transitionProps={{ duration: 100 }}
        overlayProps={{ radius: "sm", blur: 2 }}
      />
      <Notifications />
      <Container size="sm" py="xl">
        <Stack>
          <Title ta="center">Media Converter</Title>
          <Paper p="xl" radius="md" withBorder>
            <Stack>
              <Dropzone
                onDrop={handleDrop}
                accept={['image/*', 'video/*', 'audio/*']}
                maxSize={100 * 1024 * 1024}
                loading={loading}
              >
                <Group style={{ minHeight: 120, pointerEvents: 'none' }}>
                  <Dropzone.Accept>
                    <IconUpload size={50} stroke={1.5} />
                  </Dropzone.Accept>
                  <Dropzone.Reject>
                    <IconUpload size={50} stroke={1.5} />
                  </Dropzone.Reject>
                  <Dropzone.Idle>
                    <Group>
                      <IconPhoto size={50} stroke={1.5} />
                      <IconVideo size={50} stroke={1.5} />
                      <IconMusic size={50} stroke={1.5} />
                    </Group>
                  </Dropzone.Idle>

                  <div>
                    <Text size="xl" inline>
                      Drag, paste, or click to select media files
                    </Text>
                    <Text size="sm" c="dimmed" inline mt={7}>
                      Supports images, videos, and audio files
                    </Text>
                  </div>
                </Group>
              </Dropzone>

              {file && (
                <>
                  <Stack gap="xs">
                    <Text fw={500} size="sm">Selected file</Text>
                    <Paper withBorder p="xs" bg="var(--mantine-color-gray-0)">
                      <Group>
                        {file.type.startsWith('image/') && <IconPhoto size={20} />}
                        {file.type.startsWith('video/') && <IconVideo size={20} />}
                        {file.type.startsWith('audio/') && <IconMusic size={20} />}
                        <Text fz="sm" style={{ wordBreak: 'break-all' }}>{file.name}</Text>
                      </Group>
                    </Paper>
                  </Stack>
                  <Select
                    label="Convert to"
                    placeholder="Select target format"
                    allowDeselect={false}
                    data={getAvailableFormats()}
                    value={targetFormat}
                    onChange={setTargetFormat}
                    disabled={initializingLibs || converting}
                  />
                  {progress > 0 && <Progress value={progress} animated />}
                  <Group gap="xs">
                    <Button
                      onClick={handleConvert}
                      loading={converting}
                      disabled={!targetFormat || initializingLibs}
                      style={{ flex: 1 }}
                    >
                      {initializingLibs ? 'Initializing...' : 'Convert'}
                    </Button>
                    {converting && (
                      <Button
                        onClick={handleCancel}
                        color="red"
                        style={{ width: 100 }}
                      >
                        Cancel
                      </Button>
                    )}
                  </Group>
                </>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </MantineProvider>
  );
}
