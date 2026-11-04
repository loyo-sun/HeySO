export const MAX_MARKDOWN_LENGTH = 1024 * 1024;
export const MAX_PASTED_IMAGE_BYTES = 256 * 1024;
export function safeMarkdownUrl(url, key) {
  if (typeof url !== 'string') return '';
  if (key === 'src' && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(url))
    return url.length <= Math.ceil(MAX_PASTED_IMAGE_BYTES * 4 / 3) + 80 ? url : '';
  const clean = url.trim();
  if (/^[\u0000-\u0020]*[a-z][a-z0-9+.-]*:/i.test(clean))
    return /^(?:https?:|mailto:)/i.test(clean) && (key !== 'src' || /^https?:/i.test(clean)) ? clean : '';
  if (/^(?:\/\/|\\)/.test(clean) || /[\u0000-\u001f]/.test(clean)) return '';
  return clean;
}
export function insertMarkdown(value, start, end, insertion) {
  const text = value.slice(0, start) + insertion + value.slice(end);
  if (text.length > MAX_MARKDOWN_LENGTH) throw Error('内容过长，请减少图片或文字后重试。');
  return {text, cursor:start + insertion.length};
}
export function formatMarkdown(value,start,end,syntax) {
  if (syntax === '**文字**') return insertMarkdown(value,start,end,'**'+(value.slice(start,end)||'文字')+'**');
  const from=start===0?0:value.lastIndexOf('\n',start-1)+1;
  const next=value.indexOf('\n',end),to=next<0?value.length:next;
  const block=value.slice(from,to).split('\n').map((line,index)=>(syntax==='1. '?`${index+1}. `:syntax)+line.replace(/^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s)/,''));
  return insertMarkdown(value,from,to,block.join('\n'));
}

export async function pastedImageData(file) {
  if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type)) throw Error('支持粘贴 PNG、JPEG、WebP 或 GIF 图片。');
  if (file.size > 20 * 1024 * 1024) throw Error('原始图片不能超过 20 MB，请缩小后重试。');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve,reject) => { image.onload=resolve; image.onerror=()=>reject(Error('无法读取图片，请重新复制后粘贴。')); image.src=url; });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw Error('图片尺寸过大，请缩小后重试。');
    for (const maximum of [1600,1280,960]) {
      const scale = Math.min(1, maximum / Math.max(image.naturalWidth,image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');
      if (!context) throw Error('当前浏览器无法处理图片。');
      context.drawImage(image,0,0,canvas.width,canvas.height);
      for (const quality of [.82,.65,.45]) {
        const data=canvas.toDataURL('image/webp',quality);
        if (data.length <= Math.ceil(MAX_PASTED_IMAGE_BYTES*4/3)+80 && safeMarkdownUrl(data,'src')) return data;
      }
    }
    throw Error('图片压缩后仍然过大，请缩小图片后重试。');
  } finally { URL.revokeObjectURL(url); }
}
