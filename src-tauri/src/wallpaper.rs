//! 自定义壁纸 / 字体导入，以及从图片里提取主题配色。
//! 导入的文件复制到 %APPDATA%\com.iuu.deskboard\ 下，前端通过 asset 协议读取。

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const IMAGE_EXT: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "gif"];
const VIDEO_EXT: &[&str] = &["mp4", "webm", "m4v", "mov"];
const FONT_EXT: &[&str] = &["ttf", "otf", "woff", "woff2"];

#[derive(Serialize)]
pub struct Swatch {
    hex: String,
    weight: f32,
}

#[derive(Serialize)]
pub struct Palette {
    colors: Vec<Swatch>,
    luminance: f32,
}

impl Palette {
    pub fn new(colors: Vec<(String, f32)>, luminance: f32) -> Palette {
        Palette { colors: colors.into_iter().map(|(hex, weight)| Swatch { hex, weight }).collect(), luminance }
    }
}

#[derive(Serialize)]
pub struct Imported {
    /// image / video / transparent
    kind: String,
    file: Option<String>,
    palette: Option<Palette>,
    title: Option<String>,
    note: Option<String>,
    /// 场景壁纸所在的文件夹
    dir: Option<String>,
    /// 壁纸库里显示的缩略图
    thumb: Option<String>,
}

fn ext_of(p: &Path) -> String {
    p.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn sub_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 复制到应用目录；clear 为 true 时先清掉目录里旧的文件（壁纸只保留当前一张）
fn copy_in(app: &AppHandle, dir: &str, src: &Path, clear: bool) -> Result<PathBuf, String> {
    let dir = sub_dir(app, dir)?;
    if clear {
        if let Ok(rd) = fs::read_dir(&dir) {
            for e in rd.flatten() {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let stem = src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let dest = dir.join(format!("{stamp}-{stem}.{}", ext_of(src)));
    fs::copy(src, &dest).map_err(|e| format!("复制文件失败：{e}"))?;
    Ok(dest)
}

// ---------- 配色提取：缩略图 + k-means ----------

fn lum(c: &[f32; 3]) -> f32 {
    (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255.0
}

fn dist2(a: &[f32; 3], b: &[f32; 3]) -> f32 {
    (a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)
}

pub fn palette_of(path: &Path) -> Result<Palette, String> {
    let img = image::open(path).map_err(|e| format!("无法读取图片：{e}"))?;
    palette_of_rgba(&img.thumbnail(96, 96).to_rgba8())
}

/// 透明像素不参与取色（否则带透明区域的图层会被算成偏黑）
pub fn palette_of_rgba(img: &image::RgbaImage) -> Result<Palette, String> {
    let mut px: Vec<[f32; 3]> = img.pixels().filter(|p| p[3] >= 128).map(|p| [p[0] as f32, p[1] as f32, p[2] as f32]).collect();
    if px.is_empty() {
        return Err("图片为空".into());
    }
    let luminance = px.iter().map(lum).sum::<f32>() / px.len() as f32;

    // 按亮度排序后等距取初始中心，结果稳定可复现
    px.sort_by(|a, b| lum(a).partial_cmp(&lum(b)).unwrap());
    let k = 8.min(px.len());
    let mut centers: Vec<[f32; 3]> = (0..k).map(|i| px[(i * 2 + 1) * px.len() / (k * 2)]).collect();
    let mut assign = vec![0usize; px.len()];
    for _ in 0..12 {
        for (i, p) in px.iter().enumerate() {
            assign[i] = (0..k)
                .min_by(|&a, &b| dist2(p, &centers[a]).partial_cmp(&dist2(p, &centers[b])).unwrap())
                .unwrap();
        }
        let mut sum = vec![[0f32; 3]; k];
        let mut cnt = vec![0f32; k];
        for (i, p) in px.iter().enumerate() {
            let c = assign[i];
            for j in 0..3 {
                sum[c][j] += p[j];
            }
            cnt[c] += 1.0;
        }
        for c in 0..k {
            if cnt[c] > 0.0 {
                centers[c] = [sum[c][0] / cnt[c], sum[c][1] / cnt[c], sum[c][2] / cnt[c]];
            }
        }
    }
    let mut cnt = vec![0f32; k];
    for &a in &assign {
        cnt[a] += 1.0;
    }
    // 合并非常接近的颜色
    let mut out: Vec<([f32; 3], f32)> = Vec::new();
    for c in 0..k {
        if cnt[c] == 0.0 {
            continue;
        }
        if let Some(o) = out.iter_mut().find(|o| dist2(&o.0, &centers[c]) < 20.0 * 20.0) {
            o.1 += cnt[c];
        } else {
            out.push((centers[c], cnt[c]));
        }
    }
    out.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    let total = px.len() as f32;
    Ok(Palette {
        colors: out
            .into_iter()
            .map(|(c, w)| Swatch {
                hex: format!("#{:02x}{:02x}{:02x}", c[0] as u8, c[1] as u8, c[2] as u8),
                weight: w / total,
            })
            .collect(),
        luminance,
    })
}

// ---------- Wallpaper Engine ----------

fn import_we(app: &AppHandle, dir: &Path) -> Result<Imported, String> {
    let mut r = import_we_inner(app, dir)?;
    if r.thumb.is_none() {
        r.thumb = we_preview(dir).and_then(|p| make_thumb(app, &p).ok()).map(|p| p.display().to_string());
    }
    Ok(r)
}

fn import_we_inner(app: &AppHandle, dir: &Path) -> Result<Imported, String> {
    let text = fs::read_to_string(dir.join("project.json")).map_err(|_| "这个文件夹里没有 project.json，不是 Wallpaper Engine 壁纸".to_string())?;
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("project.json 解析失败：{e}"))?;
    let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("").to_lowercase();
    let title = v.get("title").and_then(|t| t.as_str()).map(String::from);
    let preview = v
        .get("preview")
        .and_then(|p| p.as_str())
        .map(|p| dir.join(p))
        .filter(|p| p.exists());
    let palette = preview.as_deref().and_then(|p| palette_of(p).ok());

    if kind == "video" {
        let file = v.get("file").and_then(|f| f.as_str()).ok_or("project.json 里没有视频文件")?;
        let src = dir.join(file);
        let dest = copy_in(app, "wallpapers", &src, false)?;
        return Ok(Imported {
            kind: "video".into(),
            file: Some(dest.display().to_string()),
            palette,
            title,
            note: None,
            dir: None,
            thumb: None,
        });
    }
    if kind == "scene" {
        match crate::we_scene::load_scene(app, dir, &Default::default()) {
            Ok(scene) if !scene_is_empty(&scene) => {
                let (scene_palette, scene_thumb) = scene.into_parts();
                let palette = scene_palette.or(palette);
                // 用还原出来的画面做缩略图，比 Wallpaper Engine 自带的预览图（常带宣传字）更干净
                let thumb = scene_thumb.and_then(|t| make_thumb(app, &t).ok()).map(|p| p.display().to_string());
                return Ok(Imported {
                    kind: "scene".into(),
                    file: None,
                    palette,
                    title,
                    note: None,
                    dir: Some(dir.display().to_string()),
                    thumb,
                })
            }
            Ok(_) => {}
            Err(e) => eprintln!("场景解析失败，改用透明模式：{e}"),
        }
    }
    Ok(Imported {
        kind: "transparent".into(),
        file: None,
        palette,
        title,
        note: Some(format!(
            "这是「{}」类型的壁纸，只能由 Wallpaper Engine 渲染。已切换为透明模式：请在 Wallpaper Engine 里继续使用它，看板会浮在动态壁纸上方，并按它的预览图配色。",
            if kind.is_empty() { "未知" } else { &kind }
        )),
        dir: None,
        thumb: None,
    })
}

#[tauri::command]
pub async fn import_wallpaper(app: AppHandle, path: String) -> Result<Imported, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        if p.is_dir() {
            return import_we(&app, &p);
        }
        if p.file_name().is_some_and(|n| n == "project.json") {
            return import_we(&app, p.parent().unwrap());
        }
        let ext = ext_of(&p);
        if IMAGE_EXT.contains(&ext.as_str()) {
            let dest = copy_in(&app, "wallpapers", &p, false)?;
            let palette = palette_of(&dest).ok();
            let thumb = make_thumb(&app, &dest).ok().map(|p| p.display().to_string());
            return Ok(Imported { kind: "image".into(), file: Some(dest.display().to_string()), palette, title: None, note: None, dir: None, thumb });
        }
        if VIDEO_EXT.contains(&ext.as_str()) {
            let dest = copy_in(&app, "wallpapers", &p, false)?;
            return Ok(Imported { kind: "video".into(), file: Some(dest.display().to_string()), palette: None, title: None, note: None, dir: None, thumb: None });
        }
        Err(format!("不支持的文件类型：.{ext}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct ImportedFont {
    file: String,
    name: String,
}

#[tauri::command]
pub fn import_font(app: AppHandle, path: String) -> Result<ImportedFont, String> {
    let p = PathBuf::from(&path);
    if !FONT_EXT.contains(&ext_of(&p).as_str()) {
        return Err("请选择 .ttf / .otf / .woff / .woff2 字体文件".into());
    }
    let dest = copy_in(&app, "fonts", &p, true)?;
    Ok(ImportedFont {
        file: dest.display().to_string(),
        name: p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "自定义字体".into()),
    })
}

fn scene_is_empty(s: &crate::we_scene::SceneDesc) -> bool {
    s.layer_count() == 0
}

// ---------- 缩略图与壁纸库 ----------

/// 生成 360px 宽的静态 PNG 缩略图（GIF 取第一帧）
fn make_thumb(app: &AppHandle, src: &Path) -> Result<PathBuf, String> {
    let img = image::open(src).map_err(|e| e.to_string())?;
    let dir = sub_dir(app, "thumbs")?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let dest = dir.join(format!("{stamp}.png"));
    img.thumbnail(360, 240).save(&dest).map_err(|e| e.to_string())?;
    Ok(dest)
}

fn we_preview(dir: &Path) -> Option<PathBuf> {
    let text = fs::read_to_string(dir.join("project.json")).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let p = dir.join(v.get("preview")?.as_str()?);
    p.exists().then_some(p)
}

/// 从壁纸库移除时删除复制进来的文件（只允许删除应用自己目录下的文件）
#[tauri::command]
pub fn remove_wallpaper_files(app: AppHandle, files: Vec<String>) -> Result<(), String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    for f in files {
        let p = PathBuf::from(&f);
        if p.starts_with(&root) {
            let _ = fs::remove_file(p);
        }
    }
    Ok(())
}
