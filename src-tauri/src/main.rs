#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, File};
use std::io::{BufWriter, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use image::GenericImageView;
use printpdf::{
    BuiltinFont, ColorBits, ColorSpace, Image, ImageTransform, ImageXObject, Mm, PdfDocument,
    PdfDocumentReference, PdfLayerReference, Px,
};
use pulldown_cmark::{Event, HeadingLevel, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};
use tempfile::TempDir;
use walkdir::WalkDir;

#[derive(Default)]
pub struct AppState {
    temp_dirs: Mutex<Vec<TempDir>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessedInput {
    pub markdown_files: Vec<String>,
    pub image_files: Vec<String>,
    pub root: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConvertResult {
    pub output_path: String,
}

#[tauri::command]
fn process_input(
    input_paths: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<ProcessedInput, String> {
    if input_paths.is_empty() {
        return Err("No input paths provided".to_string());
    }

    let mut temp_dir_guard = state
        .temp_dirs
        .lock()
        .map_err(|_| "Failed to lock temporary directory state".to_string())?;
    temp_dir_guard.clear();

    let mut scan_roots: Vec<PathBuf> = Vec::new();
    let mut output_roots: Vec<PathBuf> = Vec::new();

    for input_path in input_paths {
        let path = PathBuf::from(&input_path);
        if !path.exists() {
            return Err(format!(
                "Input path does not exist: {}",
                path.to_string_lossy()
            ));
        }

        if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("zip") {
            let extracted = extract_zip(&path)?;
            scan_roots.push(extracted.path().to_path_buf());
            output_roots.push(path.parent().unwrap_or(Path::new(".")).to_path_buf());
            temp_dir_guard.push(extracted);
        } else if path.is_file() {
            scan_roots.push(path.clone());
            output_roots.push(path.parent().unwrap_or(Path::new(".")).to_path_buf());
        } else {
            scan_roots.push(path.clone());
            output_roots.push(path.clone());
        }
    }

    let (markdown_files, image_files) = collect_assets(&scan_roots)?;
    let output_root = common_root(&output_roots)
        .filter(|path| path.parent().is_some())
        .unwrap_or_else(|| output_roots[0].clone());

    Ok(ProcessedInput {
        markdown_files,
        image_files,
        root: output_root.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn convert_to_pdf(
    input: ProcessedInput,
    state: tauri::State<'_, AppState>,
) -> Result<ConvertResult, String> {
    if input.markdown_files.is_empty() {
        return Err("No markdown files found".to_string());
    }

    let output_path = PathBuf::from(&input.root).join("markdown_export.pdf");
    render_markdown_pdf(&input.markdown_files, &output_path)?;

    if let Ok(mut temp_dir_guard) = state.temp_dirs.lock() {
        temp_dir_guard.clear();
    }

    Ok(ConvertResult {
        output_path: output_path.to_string_lossy().to_string(),
    })
}

fn extract_zip(path: &Path) -> Result<TempDir, String> {
    let file = File::open(path).map_err(|err| err.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|err| err.to_string())?;
    let temp_dir = tempfile::tempdir().map_err(|err| err.to_string())?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|err| err.to_string())?;
        let out_path = temp_dir.path().join(entry.name());

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|err| err.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            let mut out_file = File::create(&out_path).map_err(|err| err.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|err| err.to_string())?;
        }
    }

    Ok(temp_dir)
}

fn collect_assets(roots: &[PathBuf]) -> Result<(Vec<String>, Vec<String>), String> {
    let mut markdown_files = Vec::new();
    let mut image_files = Vec::new();

    for root in roots {
        if root.is_file() {
            if is_markdown(root) {
                markdown_files.push(root.to_string_lossy().to_string());
            }
            continue;
        }
        for entry in WalkDir::new(root).into_iter().filter_map(|entry| entry.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            if is_markdown(path) {
                markdown_files.push(path.to_string_lossy().to_string());
            } else if is_image(path) {
                image_files.push(path.to_string_lossy().to_string());
            }
        }
    }

    Ok((markdown_files, image_files))
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("md") | Some("markdown")
    )
}

fn is_image(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("png")
            | Some("jpg")
            | Some("jpeg")
            | Some("gif")
            | Some("webp")
            | Some("bmp")
    )
}

fn common_root(paths: &[PathBuf]) -> Option<PathBuf> {
    let mut iter = paths.iter();
    let first = iter.next()?.components().collect::<Vec<_>>();
    let mut common_len = first.len();

    for path in iter {
        let components = path.components().collect::<Vec<_>>();
        common_len = common_len.min(components.len());
        for i in 0..common_len {
            if components[i] != first[i] {
                common_len = i;
                break;
            }
        }
    }

    if common_len == 0 {
        None
    } else {
        let mut common = PathBuf::new();
        for component in &first[..common_len] {
            common.push(component.as_os_str());
        }
        Some(common)
    }
}

const PAGE_WIDTH_MM: f32 = 210.0;
const PAGE_HEIGHT_MM: f32 = 297.0;
const MARGIN_MM: f32 = 15.0;
const MAX_IMAGE_HEIGHT_MM: f32 = 120.0;

struct Fonts {
    regular: printpdf::IndirectFontRef,
    bold: printpdf::IndirectFontRef,
    mono: printpdf::IndirectFontRef,
}

struct Renderer {
    doc: PdfDocumentReference,
    current_page: printpdf::PdfPageIndex,
    current_layer: printpdf::PdfLayerIndex,
    cursor_y: f32,
    fonts: Fonts,
}

impl Renderer {
    fn new() -> Result<Self, String> {
        let (doc, page, layer) =
            PdfDocument::new("Markdown Export", Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Layer 1");
        let regular = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|err| err.to_string())?;
        let bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|err| err.to_string())?;
        let mono = doc
            .add_builtin_font(BuiltinFont::Courier)
            .map_err(|err| err.to_string())?;

        Ok(Self {
            doc,
            current_page: page,
            current_layer: layer,
            cursor_y: PAGE_HEIGHT_MM - MARGIN_MM,
            fonts: Fonts {
                regular,
                bold,
                mono,
            },
        })
    }

    fn layer(&self) -> PdfLayerReference {
        self.doc
            .get_page(self.current_page)
            .get_layer(self.current_layer)
    }

    fn add_page(&mut self) {
        let (page, layer) = self
            .doc
            .add_page(Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Layer 1");
        self.current_page = page;
        self.current_layer = layer;
        self.cursor_y = PAGE_HEIGHT_MM - MARGIN_MM;
    }

    fn ensure_space(&mut self, height_mm: f32) {
        if self.cursor_y - height_mm < MARGIN_MM {
            self.add_page();
        }
    }

    fn mm_to_pt(mm: f32) -> f32 {
        mm / 0.3527777778
    }

    fn pt_to_mm(pt: f32) -> f32 {
        pt * 0.3527777778
    }

    fn line_height_mm(font_size: f32) -> f32 {
        Self::pt_to_mm(font_size * 1.25)
    }

    fn max_text_width_mm(&self, indent_mm: f32) -> f32 {
        PAGE_WIDTH_MM - 2.0 * MARGIN_MM - indent_mm
    }

    fn wrap_text(&self, text: &str, font_size: f32, max_width_mm: f32) -> Vec<String> {
        let max_width_pt = Self::mm_to_pt(max_width_mm);
        let avg_char_width_pt = font_size * 0.52;
        let mut lines: Vec<String> = Vec::new();
        let mut current = String::new();
        let mut current_width = 0.0f32;

        for word in text.split_whitespace() {
            let word_width = word.chars().count() as f32 * avg_char_width_pt;
            let space_width = avg_char_width_pt;
            let next_width = if current.is_empty() {
                word_width
            } else {
                current_width + space_width + word_width
            };

            if next_width > max_width_pt && !current.is_empty() {
                lines.push(current.trim_end().to_string());
                current = String::new();
                current_width = 0.0;
            }

            if !current.is_empty() {
                current.push(' ');
                current_width += space_width;
            }
            current.push_str(word);
            current_width += word_width;
        }

        if !current.is_empty() {
            lines.push(current.trim_end().to_string());
        }

        if lines.is_empty() {
            lines.push(String::new());
        }

        lines
    }

    fn write_lines(
        &mut self,
        lines: &[String],
        font: printpdf::IndirectFontRef,
        font_size: f32,
        indent_mm: f32,
    ) {
        let line_height = Self::line_height_mm(font_size);
        for line in lines {
            self.ensure_space(line_height);
            self.layer()
                .use_text(line, font_size, Mm(MARGIN_MM + indent_mm), Mm(self.cursor_y), &font);
            self.cursor_y -= line_height;
        }
    }

    fn paragraph(&mut self, text: &str) {
        let font_size = 11.0f32;
        let lines = self.wrap_text(text, font_size, self.max_text_width_mm(0.0));
        self.write_lines(&lines, self.fonts.regular.clone(), font_size, 0.0);
        self.cursor_y -= Self::pt_to_mm(6.0);
    }

    fn heading(&mut self, level: u32, text: &str) {
        let font_size: f32 = match level {
            1 => 24.0,
            2 => 18.0,
            3 => 14.0,
            _ => 12.0,
        };
        let lines = self.wrap_text(text, font_size, self.max_text_width_mm(0.0));
        self.write_lines(&lines, self.fonts.bold.clone(), font_size, 0.0);
        self.cursor_y -= Self::pt_to_mm(8.0);
    }

    fn list(&mut self, items: &[String]) {
        let font_size = 11.0f32;
        let indent_mm = 6.0f32;
        for item in items {
            let lines = self.wrap_text(item, font_size, self.max_text_width_mm(indent_mm));
            if let Some(first) = lines.first() {
                self.ensure_space(Self::line_height_mm(font_size));
                self.layer().use_text(
                    "•",
                    font_size,
                    Mm(MARGIN_MM),
                    Mm(self.cursor_y),
                    &self.fonts.regular,
                );
                self.layer().use_text(
                    first,
                    font_size,
                    Mm(MARGIN_MM + indent_mm),
                    Mm(self.cursor_y),
                    &self.fonts.regular,
                );
                self.cursor_y -= Self::line_height_mm(font_size);
            }
            if lines.len() > 1 {
                self.write_lines(&lines[1..], self.fonts.regular.clone(), font_size, indent_mm);
            }
            self.cursor_y -= Self::pt_to_mm(2.0);
        }
        self.cursor_y -= Self::pt_to_mm(4.0);
    }

    fn code_block(&mut self, text: &str) {
        let font_size = 9.5f32;
        let indent_mm = 4.0f32;
        let max_width_mm = self.max_text_width_mm(indent_mm);
        let max_chars = (Self::mm_to_pt(max_width_mm) / (font_size * 0.6)) as usize;

        for line in text.lines() {
            let mut start = 0;
            let chars: Vec<char> = line.chars().collect();
            while start < chars.len() {
                let end = (start + max_chars).min(chars.len());
                let slice: String = chars[start..end].iter().collect();
                self.ensure_space(Self::line_height_mm(font_size));
                self.layer().use_text(
                    &slice,
                    font_size,
                    Mm(MARGIN_MM + indent_mm),
                    Mm(self.cursor_y),
                    &self.fonts.mono,
                );
                self.cursor_y -= Self::line_height_mm(font_size);
                start = end;
            }
        }
        self.cursor_y -= Self::pt_to_mm(6.0);
    }

    fn image(&mut self, markdown_path: &Path, dest: &str) -> Result<(), String> {
        if dest.starts_with("http://") || dest.starts_with("https://") {
            return Ok(());
        }

        let image_path = if Path::new(dest).is_absolute() {
            PathBuf::from(dest)
        } else {
            let base = markdown_path.parent().unwrap_or(Path::new("."));
            base.join(dest)
        };

        if !image_path.exists() {
            return Err(format!(
                "Image not found: {}",
                image_path.to_string_lossy()
            ));
        }

        let image = image::open(&image_path)
            .map_err(|err| format!("Failed to open image {}: {}", image_path.display(), err))?;
        let (width_px, height_px) = image.dimensions();
        let dpi = 96.0f32;
        let mut width_mm = width_px as f32 * 25.4 / dpi;
        let mut height_mm = height_px as f32 * 25.4 / dpi;

        let max_width_mm = self.max_text_width_mm(0.0);
        let mut scale = 1.0f32;
        if width_mm > max_width_mm {
            scale = max_width_mm / width_mm;
            width_mm = max_width_mm;
            height_mm = height_mm * scale;
        }
        if height_mm > MAX_IMAGE_HEIGHT_MM {
            let height_scale = MAX_IMAGE_HEIGHT_MM / height_mm;
            scale *= height_scale;
            height_mm = MAX_IMAGE_HEIGHT_MM;
        }

        self.ensure_space(height_mm + Self::pt_to_mm(6.0));
        let rgb_image = image.to_rgb8();
        let image_xobject = ImageXObject {
            width: Px(width_px as usize),
            height: Px(height_px as usize),
            color_space: ColorSpace::Rgb,
            bits_per_component: ColorBits::Bit8,
            interpolate: true,
            image_data: rgb_image.into_raw(),
            image_filter: None,
            clipping_bbox: None,
            smask: None,
        };
        let image = Image::from(image_xobject);
        let y = self.cursor_y - height_mm;
        image.add_to_layer(
            self.layer(),
            ImageTransform {
                translate_x: Some(Mm(MARGIN_MM)),
                translate_y: Some(Mm(y)),
                scale_x: Some(scale),
                scale_y: Some(scale),
                dpi: Some(dpi),
                ..Default::default()
            },
        );
        self.cursor_y = y - Self::pt_to_mm(6.0);
        Ok(())
    }
}

fn render_markdown_pdf(files: &[String], output_path: &Path) -> Result<(), String> {
    let mut renderer = Renderer::new()?;

    for file in files {
        let path = PathBuf::from(file);
        let mut bytes = Vec::new();
        File::open(&path)
            .map_err(|err| err.to_string())?
            .read_to_end(&mut bytes)
            .map_err(|err| err.to_string())?;
        let contents = String::from_utf8_lossy(&bytes);

        let title = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Markdown File");
        renderer.heading(2, &format!("File: {}", title));

        render_markdown_content(&contents, &path, &mut renderer)?;
    }

    let file = File::create(output_path).map_err(|err| err.to_string())?;
    renderer
        .doc
        .save(&mut BufWriter::new(file))
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn render_markdown_content(
    contents: &str,
    markdown_path: &Path,
    renderer: &mut Renderer,
) -> Result<(), String> {
    let mut current_text = String::new();
    let mut current_heading: Option<u32> = None;
    let mut list_items: Vec<String> = Vec::new();
    let mut current_list_item: Option<String> = None;
    let mut in_paragraph = false;
    let mut in_code_block = false;
    let mut code_block = String::new();
    let mut current_image: Option<String> = None;

    let parser = Parser::new(contents);
    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => {
                    in_paragraph = true;
                    current_text.clear();
                }
                Tag::Heading { level, .. } => {
                    let mapped = match level {
                        HeadingLevel::H1 => 1,
                        HeadingLevel::H2 => 2,
                        HeadingLevel::H3 => 3,
                        HeadingLevel::H4 => 4,
                        HeadingLevel::H5 => 5,
                        HeadingLevel::H6 => 6,
                    };
                    current_heading = Some(mapped);
                    current_text.clear();
                }
                Tag::List(_) => {
                    list_items.clear();
                }
                Tag::Item => {
                    current_list_item = Some(String::new());
                }
                Tag::CodeBlock(_) => {
                    in_code_block = true;
                    code_block.clear();
                }
                Tag::Image { dest_url, .. } => {
                    current_image = Some(dest_url.to_string());
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph => {
                    if in_paragraph {
                        renderer.paragraph(current_text.trim());
                    }
                    in_paragraph = false;
                    current_text.clear();
                }
                TagEnd::Heading(_) => {
                    if let Some(level) = current_heading.take() {
                        renderer.heading(level, current_text.trim());
                    }
                    current_text.clear();
                }
                TagEnd::List(_) => {
                    if !list_items.is_empty() {
                        renderer.list(&list_items);
                    }
                    list_items.clear();
                }
                TagEnd::Item => {
                    if let Some(item) = current_list_item.take() {
                        if !item.trim().is_empty() {
                            list_items.push(item.trim().to_string());
                        }
                    }
                }
                TagEnd::CodeBlock => {
                    if in_code_block {
                        renderer.code_block(&code_block);
                    }
                    in_code_block = false;
                    code_block.clear();
                }
                TagEnd::Image => {
                    if let Some(dest) = current_image.take() {
                        renderer.image(markdown_path, &dest)?;
                    }
                }
                _ => {}
            },
            Event::Text(text) => {
                if in_code_block {
                    code_block.push_str(&text);
                } else if let Some(item) = current_list_item.as_mut() {
                    item.push_str(&text);
                } else {
                    current_text.push_str(&text);
                }
            }
            Event::Code(text) => {
                if let Some(item) = current_list_item.as_mut() {
                    item.push_str(&text);
                } else {
                    current_text.push_str(&text);
                }
            }
            Event::SoftBreak => {
                if in_code_block {
                    code_block.push('\n');
                } else {
                    current_text.push(' ');
                }
            }
            Event::HardBreak => {
                if in_code_block {
                    code_block.push('\n');
                } else {
                    current_text.push('\n');
                }
            }
            Event::Rule => {
                renderer.cursor_y -= Renderer::pt_to_mm(8.0);
            }
            _ => {}
        }
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![process_input, convert_to_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
