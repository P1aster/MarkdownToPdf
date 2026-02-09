---
name: Tauri Markdown to PDF App
overview: Create a Tauri 2.0 desktop application with React frontend that accepts drag-and-drop of markdown files, directories, or zip files, extracts markdown and linked images, and converts everything to a single PDF file.
todos:
  - id: setup-project
    content: Initialize Tauri 2.0 project with React template and configure project structure
    status: pending
  - id: frontend-ui
    content: Create React frontend with drag-and-drop component and UI layout
    status: pending
  - id: file-processing
    content: Implement Rust backend for processing files, directories, and zip archives
    status: pending
  - id: markdown-parsing
    content: Implement markdown parsing and HTML conversion with image path resolution
    status: pending
  - id: pdf-generation
    content: Implement PDF generation from HTML with embedded images
    status: pending
  - id: integration
    content: Connect frontend and backend, add error handling and user feedback
    status: pending
isProject: false
---

# Tauri 2.0 Markdown to PDF Desktop App

## Project Structure

The app will follow Tauri 2.0 structure:

- **Frontend**: React + Vite at root level (`src/`, `package.json`, `vite.config.js`)
- **Backend**: Rust in `src-tauri/` directory (`Cargo.toml`, `src/main.rs`, `tauri.conf.json`)

## Core Features

1. **Drag-and-drop interface** for:
  - Single `.md` file
  - Directory containing `.md` files and images
  - `.zip` file containing `.md` files and images
2. **File processing**:
  - Extract markdown files from directories/zips
  - Resolve relative image paths
  - Handle nested markdown file references
  - Collect all assets (images, linked markdown files)
3. **PDF generation**:
  - Parse markdown to HTML
  - Embed images in correct locations
  - Convert HTML to PDF
  - Output single PDF file

## Technical Stack

### Frontend (React + Vite)

- React for UI components
- Vite for build tooling
- Drag-and-drop handling with HTML5 API
- File system access via Tauri commands

### Backend (Rust)

- **Markdown parsing**: `pulldown-cmark` - Parse markdown files
- **HTML generation**: `pulldown-cmark` - Convert markdown to HTML
- **PDF generation**: `printpdf` or `headless_chrome` - Convert HTML to PDF with image support
- **File handling**: `zip` crate for zip extraction, `walkdir` for directory traversal
- **Image processing**: `image` crate for image format support

## Implementation Plan

### Phase 1: Project Setup

1. Initialize Tauri 2.0 project with React template
2. Configure `tauri.conf.json` for file system access
3. Set up capabilities for file system operations
4. Configure Vite for React development

### Phase 2: Frontend UI

1. Create drag-and-drop component (`src/components/DropZone.tsx`)
  - Visual drop zone area
  - Handle drag events (dragover, drop)
  - Show file/directory names being processed
  - Progress indicator during conversion
2. Create main app component (`src/App.tsx`)
  - Layout with drop zone
  - Output file path display
  - Error handling UI
3. Style components with modern CSS

### Phase 3: Rust Backend - File Processing

1. Create Tauri command `process_input` in `src-tauri/src/main.rs`:
  - Accept file path (file/directory/zip)
  - Detect input type
  - Extract files:
    - If directory: walk recursively, collect `.md` files and images
    - If zip: extract to temp directory, then process as directory
    - If single file: process directly
  - Return list of markdown files and their associated assets
2. Create helper functions:
  - `extract_zip(path: &Path) -> Result<TempDir>`
  - `collect_markdown_files(path: &Path) -> Vec<MarkdownFile>`
  - `resolve_image_paths(md_content: &str, base_path: &Path) -> Vec<ImagePath>`
  - `find_linked_markdown_files(md_content: &str, base_path: &Path) -> Vec<PathBuf>`

### Phase 4: Rust Backend - PDF Generation

1. Create Tauri command `convert_to_pdf`:
  - Accept processed markdown files and assets
  - Parse each markdown file with `pulldown-cmark`
  - Convert to HTML with proper image paths
  - Combine all markdown content into single HTML document
  - Convert HTML to PDF using `printpdf`:
    - Create PDF document
    - Add pages as needed
    - Embed images at correct positions
    - Handle page breaks appropriately
  - Save PDF to output location
  - Return success/error status
2. Alternative approach (if `printpdf` is too complex):
  - Use `headless_chrome` crate to render HTML to PDF
  - This handles CSS styling and images automatically
  - Requires Chrome/Chromium binary

### Phase 5: Integration

1. Connect frontend to backend:
  - Call `process_input` when files are dropped
  - Show processing progress
  - Call `convert_to_pdf` with processed files
  - Display output PDF path or error message
  - Allow user to open PDF location
2. Error handling:
  - Validate file types
  - Handle missing images gracefully
  - Show user-friendly error messages
  - Log errors for debugging

### Phase 6: Polish

1. Add file picker fallback (if drag-drop fails)
2. Add output file name/path selection
3. Add settings for PDF options (page size, margins, etc.)
4. Add app icon and window configuration
5. Test with various markdown structures and image formats

## Key Files to Create

### Frontend

- `package.json` - React + Vite dependencies
- `vite.config.js` - Vite configuration for Tauri
- `src/main.jsx` - React entry point
- `src/App.tsx` - Main app component
- `src/components/DropZone.tsx` - Drag-and-drop component
- `index.html` - HTML entry point
- `src/styles.css` - App styles

### Backend

- `src-tauri/Cargo.toml` - Rust dependencies
- `src-tauri/tauri.conf.json` - Tauri configuration
- `src-tauri/src/main.rs` - Rust entry point with Tauri commands
- `src-tauri/capabilities/default.json` - Security capabilities
- `src-tauri/src/lib.rs` - Shared Rust code (if needed)

## Dependencies

### Frontend (`package.json`)

- `react`, `react-dom`
- `@tauri-apps/api`
- `vite`, `@vitejs/plugin-react`

### Backend (`Cargo.toml`)

- `tauri` (v2.0)
- `pulldown-cmark` - Markdown parsing
- `printpdf` or `headless_chrome` - PDF generation
- `image` - Image format support
- `zip` - Zip file extraction
- `walkdir` - Directory traversal
- `tempfile` - Temporary directory handling
- `serde`, `serde_json` - JSON serialization

## Security Considerations

- Configure Tauri capabilities to allow:
  - File system read access (for input files)
  - File system write access (for output PDF)
  - Temporary directory access
- Validate file paths to prevent directory traversal
- Limit file size to prevent memory issues
- Sanitize markdown content before processing

