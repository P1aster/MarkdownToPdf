# Markdown to PDF

A desktop application built with Tauri that converts Markdown files to PDF. Designed to handle messy project folders with linked markdown files and embedded images.

## Overview

This application provides a simple interface for converting Markdown documents to PDF format. It supports:

- **Single Markdown Files** - Convert individual `.md` or `.markdown` files
- **Directories** - Process entire folders containing multiple markdown files
- **ZIP Archives** - Extract and process markdown files from zip archives
- **Image Embedding** - Automatically resolves and embeds linked images with safe relative path resolution
- **Linked Markdown** - Follows and processes linked markdown references

## Features

- 🎯 Drag-and-drop interface for easy file selection
- 📁 Support for files, directories, and zip archives
- 🖼️ Automatic image resolution and embedding
- 📄 Clean PDF output with consistent formatting
- 🎨 Modern, dark-themed UI built with React and Tailwind CSS

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + Vite
- **Backend**: Rust + Tauri
- **PDF Generation**: `printpdf` crate
- **Markdown Parsing**: `pulldown_cmark` crate
- **Image Processing**: `image` crate

## Development

### Prerequisites

- Node.js (latest stable)
- pnpm (package manager)
- Rust toolchain
- Tauri CLI

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Run development server:
```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Type Checking

```bash
pnpm check-types
```

## Project Structure

```
MarkdownToPdf/
├── src/                    # React frontend
│   ├── App.tsx            # Main application component
│   ├── components/        # React components
│   └── styles.css         # Global styles
├── src-tauri/             # Rust backend
│   ├── src/
│   │   └── main.rs        # Tauri commands and PDF generation
│   └── tauri.conf.json    # Tauri configuration
└── package.json           # Node.js dependencies
```

## How It Works

1. **Input Processing**: The app accepts markdown files, directories, or zip archives
2. **Asset Collection**: Scans the input and collects all markdown files and images
3. **Markdown Parsing**: Parses markdown content using `pulldown_cmark`
4. **PDF Rendering**: Generates PDF with proper formatting for headings, paragraphs, lists, code blocks, and images
5. **Output**: Saves the generated PDF to the same directory as the input

## Notes

This project was created as a test for the Codex CLI tool learn project, exploring the capabilities of building cross-platform desktop applications with Tauri and modern web technologies.

## License

Private project.
