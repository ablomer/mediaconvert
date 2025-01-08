import { useState } from 'react';
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

const videoFormats = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'gif'];
const imageFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'];
const audioFormats = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [converting, setConverting] = useState(false);

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
                maxSize={100 * 1024 * 1024} // 100MB
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
                      Drag images, videos, or audio files here or click to select files
                    </Text>
                    <Text size="sm" c="dimmed" inline mt={7}>
                      Files will be converted locally in your browser
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
