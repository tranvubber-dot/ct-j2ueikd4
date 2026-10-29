// Máy nghe cho app Chi Tiêu Giọng Nói khi mở dạng ứng dụng (iPhone chặn nhận giọng của trình duyệt):
// app gửi đoạn ghi âm WAV 16 kHz → Whisper (Workers AI) → trả chữ. Không lưu âm thanh, không ghi log nội dung.
const OK_ORIGINS = ['https://tranvubber-dot.github.io'];
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const HINT = 'Ghi chi tiêu bằng tiếng Việt: vừa ăn phở 50 nghìn, đổ xăng 80k, mua đồ Shopee 2 trăm rưỡi, tiền nhà 1 triệu 2, nợ anh Hùng 500 nghìn, cho chị Lan vay 2 triệu, 20 đô.';

function b64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allow = OK_ORIGINS.includes(origin) || LOCAL.test(origin);
    const cors = { 'Access-Control-Allow-Origin': allow ? origin : OK_ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method === 'GET') return json({ ok: true });
    if (!allow) return json({ error: 'origin' }, 403);
    const buf = await req.arrayBuffer();
    if (buf.byteLength < 1000 || buf.byteLength > 3e6) return json({ error: 'size' }, 400);
    try {
      const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: b64(buf), task: 'transcribe', language: 'vi', vad_filter: true, initial_prompt: HINT });
      const text = (r.text || (r.transcription_info && r.transcription_info.text) || '').trim();
      return json({ text });
    } catch (e) {
      return json({ error: String(e && e.message || e).slice(0, 200) }, 502);
    }
  },
};
