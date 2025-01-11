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
} from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { Dropzone } from '@mantine/dropzone';
import { IconUpload, IconPhoto, IconVideo, IconMusic } from '@tabler/icons-react';
import { convertMedia } from './utils/mediaConverter';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dropzone/styles.css';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
});

const videoFormats = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv'];
const imageFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'];
const audioFormats = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [converting, setConverting] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
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
                  <Text>Selected file: {file.name}</Text>
                  <Select
                    label="Convert to"
                    placeholder="Select target format"
                    allowDeselect={false}
                    data={getAvailableFormats()}
                    value={targetFormat}
                    onChange={setTargetFormat}
                  />
                  {progress > 0 && <Progress value={progress} animated />}
                  <Button
                    onClick={handleConvert}
                    loading={converting}
                    disabled={!targetFormat}
                    fullWidth
                  >
                    Convert
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </MantineProvider>
  );
}
