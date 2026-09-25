//! 读取 Wallpaper Engine「场景」壁纸（scene.pkg / scene.json），还原成可在网页里叠加显示的图层。
//!
//! 只还原静态图层：贴图解码成 PNG 缓存到本地，按场景树算出每层的变换矩阵和可见性。
//! 粒子、文字、着色器特效、脚本等 Wallpaper Engine 专有的运行时效果不在这里处理，
//! 前端会给带有摆动 / 水波类特效的图层加上近似的 CSS 动效。
//! 只在本机读取用户已订阅的文件，不做任何分发。

use crate::wallpaper::{palette_of_rgba, Palette};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// ---------- scene.pkg ----------

struct Pkg {
    dir: PathBuf,
    file: Option<(PathBuf, u64, HashMap<String, (u32, u32)>)>,
}

impl Pkg {
    fn open(dir: &Path) -> Result<Pkg, String> {
        let path = dir.join("scene.pkg");
        if !path.exists() {
            // 未打包的场景：文件直接放在文件夹里
            return Ok(Pkg { dir: dir.to_path_buf(), file: None });
        }
        let mut f = File::open(&path).map_err(|e| e.to_string())?;
        let mut rd = |n: usize| -> Result<Vec<u8>, String> {
            let mut b = vec![0u8; n];
            f.read_exact(&mut b).map_err(|e| format!("scene.pkg 读取失败：{e}"))?;
            Ok(b)
        };
        let u32_ = |b: &[u8]| u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
        let n = u32_(&rd(4)?) as usize;
        let ver = String::from_utf8_lossy(&rd(n)?).to_string();
        if !ver.starts_with("PKGV") {
            return Err("不是有效的 scene.pkg".into());
        }
        let count = u32_(&rd(4)?);
        let mut entries = HashMap::new();
        let mut header = 8 + n as u64;
        for _ in 0..count {
            let n = u32_(&rd(4)?) as usize;
            let name = String::from_utf8_lossy(&rd(n)?).to_string();
            let pos = rd(8)?;
            entries.insert(name, (u32_(&pos[0..4]), u32_(&pos[4..8])));
            header += 4 + n as u64 + 8;
        }
        Ok(Pkg { dir: dir.to_path_buf(), file: Some((path, header, entries)) })
    }

    fn read(&self, name: &str) -> Option<Vec<u8>> {
        if let Some((path, base, entries)) = &self.file {
            if let Some(&(off, size)) = entries.get(name) {
                let mut f = File::open(path).ok()?;
                f.seek(SeekFrom::Start(base + off as u64)).ok()?;
                let mut b = vec![0u8; size as usize];
                f.read_exact(&mut b).ok()?;
                return Some(b);
            }
        }
        fs::read(self.dir.join(name)).ok()
    }

    fn json(&self, name: &str) -> Option<Value> {
        serde_json::from_slice(&self.read(name)?).ok()
    }
}

// ---------- .tex 贴图 ----------

enum Tex {
    /// 内嵌的 PNG / JPG 等完整图片文件
    Encoded(Vec<u8>, &'static str),
    Rgba(u32, u32, Vec<u8>),
}

struct Rd<'a> {
    b: &'a [u8],
    o: usize,
}

impl Rd<'_> {
    fn i32(&mut self) -> Result<i32, String> {
        let s = self.b.get(self.o..self.o + 4).ok_or("贴图数据不完整")?;
        self.o += 4;
        Ok(i32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn tag(&mut self) -> Result<String, String> {
        let s = self.b.get(self.o..self.o + 8).ok_or("贴图数据不完整")?;
        self.o += 9; // 8 字节标签 + 结尾 \0
        Ok(String::from_utf8_lossy(s).to_string())
    }
    fn bytes(&mut self, n: usize) -> Result<&[u8], String> {
        let s = self.b.get(self.o..self.o + n).ok_or("贴图数据不完整")?;
        self.o += n;
        Ok(s)
    }
}

fn decode_tex(buf: &[u8]) -> Result<Tex, String> {
    let mut r = Rd { b: buf, o: 0 };
    if !r.tag()?.starts_with("TEXV") || !r.tag()?.starts_with("TEXI") {
        return Err("不是 .tex 贴图".into());
    }
    let fmt = r.i32()?;
    let _flags = r.i32()?;
    let (_tw, _th, iw, ih) = (r.i32()?, r.i32()?, r.i32()?, r.i32()?);
    let _ = r.i32()?;
    let tb = r.tag()?;
    let _count = r.i32()?;
    let free_image = if tb.as_str() >= "TEXB0003" { r.i32()? } else { -1 };
    if tb.as_str() >= "TEXB0004" && r.i32()? != 0 {
        return Err("视频贴图暂不支持".into());
    }
    let _mips = r.i32()?;
    let (w, h) = (r.i32()? as usize, r.i32()? as usize);
    let (lz4, raw_size) = if tb.as_str() >= "TEXB0002" { (r.i32()?, r.i32()? as usize) } else { (0, 0) };
    let size = r.i32()? as usize;
    let mut data = r.bytes(size)?.to_vec();
    if lz4 == 1 {
        data = lz4_flex::block::decompress(&data, raw_size).map_err(|e| format!("LZ4 解压失败：{e}"))?;
    }

    if free_image != -1 {
        let ext = if data.starts_with(&[0x89, b'P', b'N', b'G']) {
            "png"
        } else if data.starts_with(&[0xff, 0xd8]) {
            "jpg"
        } else if data.starts_with(b"GIF") {
            "gif"
        } else {
            "png"
        };
        return Ok(Tex::Encoded(data, ext));
    }

    let px = w * h;
    let mut rgba = vec![0u8; px * 4];
    match fmt {
        0 => rgba.copy_from_slice(data.get(..px * 4).ok_or("RGBA 数据长度不对")?),
        4 | 6 | 7 => {
            let f = match fmt {
                4 => texpresso::Format::Bc3,
                6 => texpresso::Format::Bc2,
                _ => texpresso::Format::Bc1,
            };
            f.decompress(&data, w, h, &mut rgba);
        }
        8 => {
            for i in 0..px.min(data.len() / 2) {
                let (v, a) = (data[i * 2], data[i * 2 + 1]);
                rgba[i * 4..i * 4 + 4].copy_from_slice(&[v, v, v, a]);
            }
        }
        9 => {
            for i in 0..px.min(data.len()) {
                let v = data[i];
                rgba[i * 4..i * 4 + 4].copy_from_slice(&[v, v, v, 255]);
            }
        }
        _ => return Err(format!("不支持的贴图格式 {fmt}")),
    }
    // 贴图可能被补齐到 2 的幂，裁回实际图片尺寸
    let (iw, ih) = ((iw as usize).clamp(1, w), (ih as usize).clamp(1, h));
    if iw < w || ih < h {
        let mut out = Vec::with_capacity(iw * ih * 4);
        for y in 0..ih {
            out.extend_from_slice(&rgba[y * w * 4..y * w * 4 + iw * 4]);
        }
        return Ok(Tex::Rgba(iw as u32, ih as u32, out));
    }
    Ok(Tex::Rgba(w as u32, h as u32, rgba))
}

/// 把贴图解码并缓存成图片文件，返回路径
fn extract_texture(pkg: &Pkg, name: &str, cache: &Path) -> Option<PathBuf> {
    if name.starts_with('_') {
        return None; // _rt_ 之类的渲染目标
    }
    let safe = name.replace(['/', '\\', ':'], "_");
    for ext in ["png", "jpg", "gif"] {
        let p = cache.join(format!("{safe}.{ext}"));
        if p.exists() {
            return Some(p);
        }
    }
    let buf = pkg.read(&format!("materials/{name}.tex"))?;
    match decode_tex(&buf).ok()? {
        Tex::Encoded(bytes, ext) => {
            let p = cache.join(format!("{safe}.{ext}"));
            fs::write(&p, bytes).ok()?;
            Some(p)
        }
        Tex::Rgba(w, h, px) => {
            let p = cache.join(format!("{safe}.png"));
            image::RgbaImage::from_raw(w, h, px)?.save(&p).ok()?;
            Some(p)
        }
    }
}

// ---------- 人偶（puppet）网格 ----------
//
// 人偶图层的贴图是一张拼图，要按 .mdl 网格把每个三角形贴回原位才能看到完整角色。
// 这里按静止姿势（不做骨骼动画）把网格光栅化成一张普通图片并缓存。

struct Mesh {
    verts: Vec<([f32; 2], [f32; 2])>, // (位置, UV)
    tris: Vec<[usize; 3]>,
}

fn parse_mdl(b: &[u8]) -> Result<Mesh, String> {
    if !b.starts_with(b"MDLV") {
        return Err("不是 MDL 网格".into());
    }
    let u32_at = |o: usize| -> Option<u32> { Some(u32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?)) };
    let f32_at = |o: usize| -> Option<f32> { Some(f32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?)) };
    // 头部：MDLV00xx\0 + 3 个 int + 材质路径\0，之后的顶点块以 0x0180xxxx 标记开头
    let mat_end = b.iter().skip(21).position(|&c| c == 0).map(|p| p + 22).ok_or("MDL 头部损坏")?;
    let mut o = mat_end;
    while o + 8 < b.len() && (u32_at(o).unwrap_or(0) >> 16) != 0x0180 {
        o += 1;
    }
    o += 4;
    let vsize = u32_at(o).ok_or("MDL 顶点块损坏")? as usize;
    o += 4;
    // 新版本每个顶点 80 字节（位置/法线/切线/骨骼/权重/UV），旧版本 52 字节（位置/骨骼/权重/UV）
    let (stride, uv_off) = if vsize % 80 == 0 { (80, 72) } else if vsize % 52 == 0 { (52, 44) } else { return Err("未知的 MDL 顶点格式".into()) };
    let mut verts = Vec::with_capacity(vsize / stride);
    for i in 0..vsize / stride {
        let v = o + i * stride;
        let p = [f32_at(v).ok_or("顶点越界")?, f32_at(v + 4).ok_or("顶点越界")?];
        let uv = [f32_at(v + uv_off).ok_or("顶点越界")?, f32_at(v + uv_off + 4).ok_or("顶点越界")?];
        verts.push((p, uv));
    }
    o += vsize;
    let isize = u32_at(o).ok_or("MDL 索引块损坏")? as usize;
    o += 4;
    let idx: Vec<usize> = (0..isize / 2)
        .filter_map(|i| b.get(o + i * 2..o + i * 2 + 2).map(|s| u16::from_le_bytes([s[0], s[1]]) as usize))
        .collect();
    let tris = idx
        .chunks_exact(3)
        .map(|t| [t[0], t[1], t[2]])
        .filter(|t| t.iter().all(|&i| i < verts.len()))
        .collect();
    Ok(Mesh { verts, tris })
}

/// 人偶骨骼上的挂点（attachment）：子图层用 "attachment": "眼睛" 挂在父人偶的某根骨骼上。
/// 返回每个挂点在人偶网格坐标系（中心为原点、y 向上）里的 2D 变换。
fn puppet_attachments(b: &[u8], names: &[String]) -> HashMap<String, M> {
    let mut out = HashMap::new();
    let Some(start) = b.windows(4).position(|w| w == b"MDLS") else { return out };
    let end = b.windows(4).position(|w| w == b"MDLA").unwrap_or(b.len());
    let u32_at = |o: usize| -> Option<u32> { Some(u32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?)) };
    let f32_at = |o: usize| -> Option<f32> { Some(f32::from_le_bytes(b.get(o..o + 4)?.try_into().ok()?)) };
    let cstr_end = |o: usize| b.get(o..).and_then(|s| s.iter().position(|&c| c == 0)).map(|p| o + p);
    let mat_at = |o: usize| -> Option<M> {
        // 4×4 列主序矩阵，取 2D 部分
        Some([f32_at(o)?, f32_at(o + 4)?, f32_at(o + 16)?, f32_at(o + 20)?, f32_at(o + 48)?, f32_at(o + 52)?])
    };

    // 骨骼：名字\0、int、父骨骼序号、矩阵字节数、矩阵、[物理参数 JSON\0]
    let mut o = start + 9 + 4;
    let Some(count) = u32_at(o) else { return out };
    o += 4;
    let mut world: Vec<M> = Vec::new();
    for _ in 0..count.min(512) {
        let Some(e) = cstr_end(o) else { return out };
        o = e + 1 + 4;
        let parent = u32_at(o).map(|p| p as i32).unwrap_or(-1);
        let msize = u32_at(o + 4).unwrap_or(64) as usize;
        let Some(local) = mat_at(o + 8) else { return out };
        o += 8 + msize;
        if b.get(o) == Some(&b'{') {
            let Some(e) = cstr_end(o) else { return out };
            o = e + 1;
        }
        let w = if parent >= 0 && (parent as usize) < world.len() { mul(&world[parent as usize], &local) } else { local };
        world.push(w);
    }

    // 挂点：u16 骨骼序号 + 名字\0 + 4×4 矩阵，直接按名字查找
    for name in names {
        let pat: Vec<u8> = name.bytes().chain(std::iter::once(0)).collect();
        let Some(p) = b[o.min(end)..end].windows(pat.len()).position(|w| w == pat.as_slice()).map(|p| p + o.min(end)) else {
            continue;
        };
        let bone = u16::from_le_bytes([b[p - 2], b[p - 1]]) as usize;
        let local = mat_at(p + pat.len()).unwrap_or([1., 0., 0., 1., 0., 0.]);
        if let Some(bw) = world.get(bone) {
            out.insert(name.clone(), mul(bw, &local));
        }
    }
    out
}

fn sample(img: &image::RgbaImage, u: f32, v: f32) -> [f32; 4] {
    let (w, h) = img.dimensions();
    let x = (u * w as f32 - 0.5).clamp(0.0, (w - 1) as f32);
    let y = (v * h as f32 - 0.5).clamp(0.0, (h - 1) as f32);
    let (x0, y0) = (x.floor() as u32, y.floor() as u32);
    let (x1, y1) = ((x0 + 1).min(w - 1), (y0 + 1).min(h - 1));
    let (fx, fy) = (x - x0 as f32, y - y0 as f32);
    let p = |x, y| img.get_pixel(x, y).0.map(|c| c as f32);
    let (a, b, c, d) = (p(x0, y0), p(x1, y0), p(x0, y1), p(x1, y1));
    let mut out = [0f32; 4];
    for i in 0..4 {
        out[i] = (a[i] * (1.0 - fx) + b[i] * fx) * (1.0 - fy) + (c[i] * (1.0 - fx) + d[i] * fx) * fy;
    }
    out
}

/// 把人偶网格按静止姿势画成 w×h 的图片（坐标以图层中心为原点、y 向上）
fn bake_puppet(mesh: &Mesh, atlas: &image::RgbaImage, w: u32, h: u32) -> image::RgbaImage {
    let mut out = image::RgbaImage::new(w, h);
    let (hw, hh) = (w as f32 / 2.0, h as f32 / 2.0);
    let to_px = |p: [f32; 2]| [p[0] + hw, hh - p[1]];
    for t in &mesh.tris {
        let (a, b, c) = (mesh.verts[t[0]], mesh.verts[t[1]], mesh.verts[t[2]]);
        let (pa, pb, pc) = (to_px(a.0), to_px(b.0), to_px(c.0));
        let area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
        if area.abs() < 1e-6 {
            continue;
        }
        let minx = pa[0].min(pb[0]).min(pc[0]).floor().max(0.0) as u32;
        let maxx = (pa[0].max(pb[0]).max(pc[0]).ceil() as u32).min(w);
        let miny = pa[1].min(pb[1]).min(pc[1]).floor().max(0.0) as u32;
        let maxy = (pa[1].max(pb[1]).max(pc[1]).ceil() as u32).min(h);
        for y in miny..maxy {
            for x in minx..maxx {
                let (px, py) = (x as f32 + 0.5, y as f32 + 0.5);
                let w0 = ((pb[0] - px) * (pc[1] - py) - (pc[0] - px) * (pb[1] - py)) / area;
                let w1 = ((pc[0] - px) * (pa[1] - py) - (pa[0] - px) * (pc[1] - py)) / area;
                let w2 = 1.0 - w0 - w1;
                if w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4 {
                    continue;
                }
                let u = w0 * a.1[0] + w1 * b.1[0] + w2 * c.1[0];
                let v = w0 * a.1[1] + w1 * b.1[1] + w2 * c.1[1];
                let s = sample(atlas, u, v);
                let sa = s[3] / 255.0;
                if sa <= 0.0 {
                    continue;
                }
                // 后画的三角形叠在上面（Porter-Duff over）
                let d = out.get_pixel_mut(x, y);
                let da = d.0[3] as f32 / 255.0;
                let oa = sa + da * (1.0 - sa);
                for i in 0..3 {
                    let c = (s[i] * sa + d.0[i] as f32 * da * (1.0 - sa)) / oa;
                    d.0[i] = c.round().clamp(0.0, 255.0) as u8;
                }
                d.0[3] = (oa * 255.0).round() as u8;
            }
        }
    }
    out
}

fn baked_puppet(pkg: &Pkg, mdl: &str, atlas_file: &Path, w: f32, h: f32, cache: &Path) -> Option<PathBuf> {
    let (w, h) = (w.round().max(1.0) as u32, h.round().max(1.0) as u32);
    let safe = mdl.replace(['/', '\\', ':'], "_");
    let p = cache.join(format!("puppet-{safe}-{w}x{h}.png"));
    if p.exists() {
        return Some(p);
    }
    let mesh = parse_mdl(&pkg.read(mdl)?).ok()?;
    let atlas = image::open(atlas_file).ok()?.to_rgba8();
    bake_puppet(&mesh, &atlas, w, h).save(&p).ok()?;
    Some(p)
}

/// 按实际画面合成一张 1/8 缩略图再取色，结果按可见图层组合缓存
fn scene_palette(layers: &[Layer], width: f32, height: f32, clear: [f32; 3], cache: &Path) -> Option<Palette> {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for l in layers {
        l.id.hash(&mut hasher);
        l.file.hash(&mut hasher);
    }
    let cached = cache.join(format!("palette-{:x}.json", hasher.finish()));
    if let Some(p) = fs::read(&cached).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()) {
        if let Ok(p) = serde_json::from_value::<PaletteIn>(p) {
            return Some(p.into());
        }
    }
    let k = 0.125f32;
    let bg = image::Rgba([(clear[0] * 255.0) as u8, (clear[1] * 255.0) as u8, (clear[2] * 255.0) as u8, 255]);
    let mut canvas = image::RgbaImage::from_pixel((width * k).max(1.0) as u32, (height * k).max(1.0) as u32, bg);
    for l in layers {
        let (w, h) = ((l.w * (l.m[0].powi(2) + l.m[1].powi(2)).sqrt() * k).max(1.0) as u32, (l.h * (l.m[2].powi(2) + l.m[3].powi(2)).sqrt() * k).max(1.0) as u32);
        let Ok(img) = image::open(&l.file) else { continue };
        let img = image::imageops::thumbnail(&img.to_rgba8(), w, h);
        let mut faded = img;
        if l.alpha < 1.0 {
            for p in faded.pixels_mut() {
                p[3] = (p[3] as f32 * l.alpha) as u8;
            }
        }
        image::imageops::overlay(&mut canvas, &faded, (l.m[4] * k) as i64, (l.m[5] * k) as i64);
    }
    let p = palette_of_rgba(&canvas).ok()?;
    let _ = fs::write(&cached, serde_json::to_vec(&p).unwrap_or_default());
    Some(p)
}

#[derive(serde::Deserialize)]
struct SwatchIn {
    hex: String,
    weight: f32,
}
#[derive(serde::Deserialize)]
struct PaletteIn {
    colors: Vec<SwatchIn>,
    luminance: f32,
}
impl From<PaletteIn> for Palette {
    fn from(p: PaletteIn) -> Palette {
        Palette::new(p.colors.into_iter().map(|c| (c.hex, c.weight)).collect(), p.luminance)
    }
}

// ---------- 场景树 ----------

type M = [f32; 6]; // 2D 仿射矩阵 [a b c d e f]：x' = a x + c y + e，y' = b x + d y + f

fn mul(p: &M, q: &M) -> M {
    [
        p[0] * q[0] + p[2] * q[1],
        p[1] * q[0] + p[3] * q[1],
        p[0] * q[2] + p[2] * q[3],
        p[1] * q[2] + p[3] * q[3],
        p[0] * q[4] + p[2] * q[5] + p[4],
        p[1] * q[4] + p[3] * q[5] + p[5],
    ]
}

/// "x y z" 字符串，或 { value: "x y z" }（脚本驱动的属性取它的静态值）
fn vec3(v: Option<&Value>, d: f32) -> [f32; 3] {
    match v {
        Some(Value::String(s)) => {
            let n: Vec<f32> = s.split_whitespace().filter_map(|x| x.parse().ok()).collect();
            [n.first().copied().unwrap_or(d), n.get(1).copied().unwrap_or(d), n.get(2).copied().unwrap_or(d)]
        }
        Some(Value::Number(n)) => [n.as_f64().unwrap_or(d as f64) as f32; 3],
        Some(Value::Object(o)) => vec3(o.get("value"), d),
        _ => [d; 3],
    }
}

fn num(v: Option<&Value>, d: f32) -> f32 {
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(d as f64) as f32,
        Some(Value::Object(o)) => num(o.get("value"), d),
        Some(Value::String(s)) => s.parse().unwrap_or(d),
        _ => d,
    }
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Bool(b) => *b,
        Value::String(s) => s == "1" || s == "true",
        Value::Number(n) => n.as_f64().unwrap_or(0.0) != 0.0,
        _ => false,
    }
}

/// 需要 Wallpaper Engine 运行时才能工作的开关，默认关掉
fn default_off(label: &str) -> bool {
    ["media_integration", "mouse_button", "audio"].iter().any(|k| label.contains(k))
}

fn prop_label(key: &str, text: &str) -> String {
    let clean: String = {
        let mut out = String::new();
        let mut tag = false;
        for c in text.chars() {
            match c {
                '<' => tag = true,
                '>' => tag = false,
                _ if !tag => out.push(c),
                _ => {}
            }
        }
        out.trim().to_string()
    };
    let known = [
        ("ui_settings_theme", "主题"),
        ("bubbles", "气泡"),
        ("clock", "时钟"),
        ("media_integration", "媒体播放器"),
        ("mouse_button", "鼠标按键"),
        ("particle", "粒子"),
    ];
    for (k, v) in known {
        if clean.contains(k) {
            return v.to_string();
        }
    }
    if clean.is_empty() {
        key.to_string()
    } else {
        clean
    }
}

#[derive(Serialize)]
pub struct Layer {
    id: i64,
    name: String,
    file: String,
    w: f32,
    h: f32,
    /// CSS matrix(a, b, c, d, e, f)，把元素本地坐标（左上角原点、y 向下）映射到场景画布
    m: M,
    alpha: f32,
    blend: String,
    fx: Vec<String>,
}

#[derive(Serialize)]
pub struct PropOption {
    label: String,
    value: String,
}

#[derive(Serialize)]
pub struct Prop {
    key: String,
    label: String,
    kind: String,
    value: Value,
    options: Vec<PropOption>,
}

#[derive(Serialize)]
pub struct SceneDesc {
    title: String,
    width: f32,
    height: f32,
    clear: String,
    layers: Vec<Layer>,
    props: Vec<Prop>,
    palette: Option<Palette>,
}

struct Ctx<'a> {
    objs: HashMap<i64, &'a Value>,
    props: HashMap<String, Value>,
    world: HashMap<i64, M>,
    /// (父人偶图层 id, 挂点名) → 挂点在父图层坐标系里的变换
    attach: HashMap<(i64, String), M>,
}

impl Ctx<'_> {
    fn world(&mut self, id: i64) -> M {
        if let Some(m) = self.world.get(&id) {
            return *m;
        }
        let Some(o) = self.objs.get(&id).copied() else { return [1., 0., 0., 1., 0., 0.] };
        let [ox, oy, _] = vec3(o.get("origin"), 0.0);
        let [sx, sy, _] = vec3(o.get("scale"), 1.0);
        let [_, _, az] = vec3(o.get("angles"), 0.0);
        let (s, c) = az.sin_cos();
        let local = [c * sx, s * sx, -s * sy, c * sy, ox, oy];
        let m = match o.get("parent").and_then(|p| p.as_i64()) {
            Some(pid) => {
                let parent = self.world(pid);
                let att = o
                    .get("attachment")
                    .and_then(|a| a.as_str())
                    .and_then(|a| self.attach.get(&(pid, a.to_string())));
                match att {
                    Some(a) => mul(&parent, &mul(a, &local)),
                    None => mul(&parent, &local),
                }
            }
            None => local,
        };
        self.world.insert(id, m);
        m
    }

    /// 返回（是否可见，影响它的用户属性）
    fn visible(&self, id: i64, used: &mut Vec<String>) -> bool {
        let Some(o) = self.objs.get(&id).copied() else { return true };
        let own = match o.get("visible") {
            None => true,
            Some(Value::Bool(b)) => *b,
            Some(Value::Object(v)) => match v.get("user") {
                Some(Value::String(k)) => {
                    used.push(k.clone());
                    self.props.get(k).map(truthy).unwrap_or(true)
                }
                Some(Value::Object(u)) => {
                    let k = u.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let cond = u.get("condition").map(|c| c.as_str().map(String::from).unwrap_or(c.to_string())).unwrap_or_default();
                    used.push(k.clone());
                    let cur = self.props.get(&k).map(|v| v.as_str().map(String::from).unwrap_or(v.to_string())).unwrap_or_default();
                    cur == cond
                }
                // 脚本控制的可见性（开场动画之类）无法还原，直接隐藏
                _ if v.contains_key("script") => false,
                _ => v.get("value").map(truthy).unwrap_or(true),
            },
            _ => true,
        };
        let parent = match o.get("parent").and_then(|p| p.as_i64()) {
            Some(pid) => self.visible(pid, used),
            None => true,
        };
        own && parent
    }
}

fn cache_dir(app: &AppHandle, dir: &Path) -> Result<PathBuf, String> {
    let name = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "scene".into());
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("we-cache").join(name);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

pub fn load_scene(app: &AppHandle, dir: &Path, overrides: &HashMap<String, Value>) -> Result<SceneDesc, String> {
    load_scene_in(dir, &cache_dir(app, dir)?, overrides)
}

fn load_scene_in(dir: &Path, cache: &Path, overrides: &HashMap<String, Value>) -> Result<SceneDesc, String> {
    let project: Value = serde_json::from_str(&fs::read_to_string(dir.join("project.json")).map_err(|_| "缺少 project.json")?)
        .map_err(|e| format!("project.json 解析失败：{e}"))?;
    let pkg = Pkg::open(dir)?;
    let scene_file = project.get("file").and_then(|f| f.as_str()).unwrap_or("scene.json");
    let scene = pkg.json(scene_file).ok_or("场景包里没有 scene.json")?;
    let objects = scene.get("objects").and_then(|o| o.as_array()).ok_or("scene.json 里没有 objects")?;

    // 用户属性：壁纸默认值 → 需要 WE 运行时的开关默认关 → 用户在看板里改过的值
    let mut props: HashMap<String, Value> = HashMap::new();
    let defs = project.pointer("/general/properties").and_then(|p| p.as_object()).cloned().unwrap_or_default();
    for (k, p) in &defs {
        if let Some(v) = p.get("value") {
            let text = p.get("text").and_then(|t| t.as_str()).unwrap_or("");
            props.insert(k.clone(), if default_off(text) { Value::Bool(false) } else { v.clone() });
        }
    }
    for (k, v) in overrides {
        props.insert(k.clone(), v.clone());
    }

    // 收集每个人偶图层被子图层引用的挂点，从它的 .mdl 骨骼里算出位置
    let mut wanted: HashMap<i64, Vec<String>> = HashMap::new();
    for o in objects {
        if let (Some(pid), Some(a)) = (o.get("parent").and_then(|p| p.as_i64()), o.get("attachment").and_then(|a| a.as_str())) {
            wanted.entry(pid).or_default().push(a.to_string());
        }
    }
    let mut attach = HashMap::new();
    for o in objects {
        let Some(id) = o.get("id").and_then(|v| v.as_i64()) else { continue };
        let Some(names) = wanted.get(&id) else { continue };
        let mdl = o
            .get("image")
            .and_then(|m| m.as_str())
            .and_then(|m| pkg.json(m))
            .and_then(|m| m.get("puppet").and_then(|p| p.as_str()).map(String::from))
            .and_then(|p| pkg.read(&p));
        if let Some(mdl) = mdl {
            for (name, m) in puppet_attachments(&mdl, names) {
                attach.insert((id, name), m);
            }
        }
    }

    let mut ctx = Ctx {
        objs: objects.iter().filter_map(|o| Some((o.get("id")?.as_i64()?, o))).collect(),
        props,
        world: HashMap::new(),
        attach,
    };
    let proj = scene.pointer("/general/orthogonalprojection");
    let width = proj.and_then(|p| p.get("width")).and_then(|v| v.as_f64()).unwrap_or(1920.0) as f32;
    let height = proj.and_then(|p| p.get("height")).and_then(|v| v.as_f64()).unwrap_or(1080.0) as f32;
    let [cr, cg, cb] = vec3(scene.pointer("/general/clearcolor"), 0.0);
    let clear = format!("rgb({}, {}, {})", (cr * 255.0) as u8, (cg * 255.0) as u8, (cb * 255.0) as u8);

    let mut layers = Vec::new();
    let mut used_props: HashSet<String> = HashSet::new();
    for o in objects {
        let (Some(id), Some(model_name)) = (o.get("id").and_then(|v| v.as_i64()), o.get("image").and_then(|v| v.as_str())) else {
            continue;
        };
        let Some(model) = pkg.json(model_name) else { continue };
        let Some(mat) = model.get("material").and_then(|m| m.as_str()).and_then(|m| pkg.json(m)) else { continue };
        let pass = mat.pointer("/passes/0");
        let Some(tex) = pass.and_then(|p| p.pointer("/textures/0")).and_then(|t| t.as_str()) else { continue };
        let Some(file) = extract_texture(&pkg, tex, cache) else { continue };

        let mut used = Vec::new();
        let vis = ctx.visible(id, &mut used);
        used_props.extend(used);
        let alpha = num(o.get("alpha"), 1.0);
        if !vis || alpha <= 0.01 {
            continue;
        }

        let (iw, ih) = image::image_dimensions(&file).unwrap_or((1, 1));
        let [w, h, _] = match o.get("size") {
            Some(v) => vec3(Some(v), 0.0),
            None => [iw as f32, ih as f32, 0.0],
        };
        if w <= 0.0 || h <= 0.0 {
            continue;
        }
        // 人偶图层：贴图是拼图，按网格烘焙成完整图片
        let file = match model.get("puppet").and_then(|p| p.as_str()) {
            Some(mdl) => match baked_puppet(&pkg, mdl, &file, w, h, cache) {
                Some(f) => f,
                None => continue,
            },
            None => file,
        };
        // 本地像素坐标（y 向下）→ 以中心为原点、y 向上 → 场景世界坐标 → 画布坐标（y 向下）
        let to_obj: M = [1., 0., 0., -1., -w / 2.0, h / 2.0];
        let to_screen: M = [1., 0., 0., -1., 0., height];
        let world = ctx.world(id);
        let m = mul(&to_screen, &mul(&world, &to_obj));

        let blend = match pass.and_then(|p| p.get("blending")).and_then(|b| b.as_str()) {
            Some("additive") => "additive",
            _ => "normal",
        };
        let fx = o
            .get("effects")
            .and_then(|e| e.as_array())
            .map(|a| {
                a.iter()
                    .filter(|e| e.get("visible").map(truthy).unwrap_or(true))
                    .filter_map(|e| e.get("file")?.as_str()?.split('/').nth(1).map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        layers.push(Layer {
            id,
            name: o.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
            file: file.display().to_string(),
            w,
            h,
            m,
            alpha,
            blend: blend.into(),
            fx,
        });
    }

    // 只列出会影响可见图层的属性（主题切换、气泡开关等）
    let mut prop_list: Vec<Prop> = defs
        .iter()
        .filter(|(k, _)| used_props.contains(*k))
        .filter_map(|(k, p)| {
            let kind = p.get("type")?.as_str()?;
            if kind != "combo" && kind != "bool" {
                return None;
            }
            let text = p.get("text").and_then(|t| t.as_str()).unwrap_or("");
            Some(Prop {
                key: k.clone(),
                label: prop_label(k, text),
                kind: kind.into(),
                value: ctx.props.get(k).cloned().unwrap_or(Value::Null),
                options: p
                    .get("options")
                    .and_then(|o| o.as_array())
                    .map(|a| {
                        a.iter()
                            .map(|x| PropOption {
                                label: x.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                value: x.get("value").map(|v| v.as_str().map(String::from).unwrap_or(v.to_string())).unwrap_or_default(),
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            })
        })
        .collect();
    prop_list.sort_by_key(|p| (p.kind != "combo", p.key.clone()));

    let palette = scene_palette(&layers, width, height, [cr, cg, cb], cache);

    Ok(SceneDesc {
        title: project.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
        width,
        height,
        clear,
        layers,
        props: prop_list,
        palette,
    })
}

impl SceneDesc {
    pub fn layer_count(&self) -> usize {
        self.layers.len()
    }
    pub fn into_palette(self) -> Option<Palette> {
        self.palette
    }
}

#[tauri::command]
pub async fn we_scene(app: AppHandle, dir: String, props: Option<HashMap<String, Value>>) -> Result<SceneDesc, String> {
    tauri::async_runtime::spawn_blocking(move || load_scene(&app, Path::new(&dir), &props.unwrap_or_default()))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore]
    fn dump_scene() {
        let dir = std::env::var("WE_DIR").expect("WE_DIR");
        let cache = std::env::temp_dir().join("we-scene-test");
        std::fs::create_dir_all(&cache).unwrap();
        let t = std::time::Instant::now();
        let ov: std::collections::HashMap<String, serde_json::Value> = std::env::var("WE_PROPS").ok().and_then(|p| serde_json::from_str(&p).ok()).unwrap_or_default();
        let s = super::load_scene_in(std::path::Path::new(&dir), &cache, &ov).unwrap();
        println!("{} {}x{} layers={} in {:?}", s.title, s.width, s.height, s.layers.len(), t.elapsed());
        for l in &s.layers {
            println!("{:>5} {:<10} {:>6.0}x{:<6.0} m=[{:.3} {:.3} {:.3} {:.3} {:.0} {:.0}] a={} fx={:?}", l.id, l.name, l.w, l.h, l.m[0], l.m[1], l.m[2], l.m[3], l.m[4], l.m[5], l.alpha, l.fx);
        }
        for p in &s.props {
            println!("prop {} {} {} {:?}", p.key, p.label, p.value, p.options.iter().map(|o| &o.value).collect::<Vec<_>>());
        }
        println!("palette {}", serde_json::to_string(&s.palette).unwrap());
        std::fs::write(cache.join("scene.json"), serde_json::to_string(&s).unwrap()).unwrap();
        // 预览合成：按 1/4 缩放把图层叠起来（测试里只处理缩放+平移）
        let k = 0.25f32;
        let mut canvas = image::RgbaImage::from_pixel((s.width * k) as u32, (s.height * k) as u32, image::Rgba([180, 180, 180, 255]));
        for l in &s.layers {
            let img = image::open(&l.file).unwrap().to_rgba8();
            let (w, h) = ((l.w * l.m[0] * k).abs().max(1.0) as u32, (l.h * l.m[3] * k).abs().max(1.0) as u32);
            let img = image::imageops::resize(&img, w, h, image::imageops::FilterType::Triangle);
            image::imageops::overlay(&mut canvas, &img, (l.m[4] * k) as i64, (l.m[5] * k) as i64);
        }
        canvas.save(cache.join("preview.png")).unwrap();
    }
}
