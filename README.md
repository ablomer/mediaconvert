# MediaConvert

A modern web application for converting media files between different formats. Built with React, Vite, and powered by FFmpeg and ImageMagick WebAssembly.

## Features

- 🎥 Convert various media formats (video, audio, images)
- 📱 Modern, responsive UI built with Mantine
- 🌐 Client-side processing using WebAssembly
- 📎 Drag & drop file upload
- 📋 Clipboard paste support
- ⚡ Real-time conversion progress
- 🎨 Clean and intuitive interface

## Technologies Used

- React 18
- TypeScript
- Vite
- FFmpeg WebAssembly
- ImageMagick WebAssembly
- Mantine UI Components
- Firebase (hosting & deployment)

## Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ablomer/mediaconvert.git
cd mediaconvert
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

1. Drop a media file into the upload zone or paste a URL
2. Select your desired output format
3. Click "Convert" and wait for the process to complete
4. Your converted file will be downloaded automatically

## Development

- `npm run dev` - Start development server
- `npm run build` - Create production build
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build locally

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License (see the LICENSE file for details).