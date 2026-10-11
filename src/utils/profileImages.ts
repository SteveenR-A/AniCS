import { isTauri } from '@tauri-apps/api/core';

export const isProfileImage = (avatar: string) => /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(avatar);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    image.src = url;
  });
}

export async function importProfileImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Elige una imagen PNG, JPG, WebP o GIF.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error('La imagen no es válida.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen.');
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export async function exportProfileImage(avatar: string, name: string, color: string, icon: SVGSVGElement | null): Promise<boolean> {
  let png = avatar;
  if (!isProfileImage(avatar)) {
    if (!icon) throw new Error('No se encontró el avatar para exportar.');
    const svg = icon.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('stroke', '#ffffff');
    svg.setAttribute('width', '160'); svg.setAttribute('height', '160');
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try {
      const image = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la imagen.');
      context.fillStyle = /^#[a-f0-9]{6}$/i.test(color) ? color : '#3b82f6';
      context.fillRect(0, 0, 256, 256);
      context.drawImage(image, 48, 48, 160, 160);
      png = canvas.toDataURL('image/png');
    } finally { URL.revokeObjectURL(url); }
  }
  const filename = `AniCS-${name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'perfil'}.png`;
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: filename, filters: [{ name: 'Imagen PNG', extensions: ['png'] }] });
    if (!path) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const bytes = Uint8Array.from(atob(png.split(',')[1]), char => char.charCodeAt(0));
    await writeFile(path, bytes);
  } else {
    const link = document.createElement('a'); link.href = png; link.download = filename; link.click();
  }
  return true;
}
