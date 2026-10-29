// Máy nghe cho app Chi Tiêu Giọng Nói khi mở dạng ứng dụng (iPhone chặn nhận giọng của trình duyệt):
// app gửi đoạn ghi âm WAV 16 kHz → mô hình nghe (Workers AI) → trả chữ. Không lưu âm thanh, không ghi log nội dung.
//   ?m=turbo (mặc định, Whisper large-v3-turbo) | ?m=nova (Deepgram Nova-3)
//   ?beam=1..5 · ?p=0 (không gợi ý, mặc định) | 1 (chỉ từ vựng tiền) | 2 (câu mẫu — dễ bị chép lại, chỉ để thử) · ?vad=0|1 · ?cond=0|1
const OK_ORIGINS = ['https://tranvubber-dot.github.io'];
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const VOCAB = 'nghìn, triệu, trăm, rưỡi, chục, k, đô, nợ, vay, trả';
const HINT = 'Ghi chi tiêu bằng tiếng Việt: vừa ăn phở 50 nghìn, đổ xăng 80k, mua đồ Shopee 2 trăm rưỡi, tiền nhà 1 triệu 2, nợ anh Hùng 500 nghìn, cho chị Lan vay 2 triệu, 20 đô.';

function b64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

async function whisper(env, buf, q) {
  const o = { audio: b64(buf), task: 'transcribe', language: 'vi',
    beam_size: Math.min(5, Math.max(1, +q.get('beam') || 5)),
    vad_filter: q.get('vad') !== '0', condition_on_previous_text: q.get('cond') === '1' };
  if (q.get('p') === '1') o.initial_prompt = VOCAB;
  if (q.get('p') === '2') o.initial_prompt = HINT;
  const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', o);
  return (r.text || (r.transcription_info && r.transcription_info.text) || '').trim();
}

async function nova(env, buf) {
  const r = await env.AI.run('@cf/deepgram/nova-3', {
    audio: { body: new Blob([buf]).stream(), contentType: 'audio/wav' },
    language: 'vi', punctuate: true, smart_format: true, numerals: true,
  });
  const alt = r && r.results && r.results.channels && r.results.channels[0] && r.results.channels[0].alternatives[0];
  return ((alt && alt.transcript) || '').trim();
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allow = OK_ORIGINS.includes(origin) || LOCAL.test(origin);
    const cors = { 'Access-Control-Allow-Origin': allow ? origin : OK_ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'X-Ms', Vary: 'Origin' };
    const json = (o, status = 200, ms = 0) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'X-Ms': String(ms) } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method === 'GET') return json({ ok: true, v: 3 });
    if (!allow) return json({ error: 'origin' }, 403);
    const buf = await req.arrayBuffer();
    if (buf.byteLength < 1000 || buf.byteLength > 3e6) return json({ error: 'size' }, 400);
    const q = new URL(req.url).searchParams, t0 = Date.now();
    try {
      const text = q.get('m') === 'nova' ? await nova(env, buf) : await whisper(env, buf, q);
      const ms = Date.now() - t0;
      return json({ text, ms }, 200, ms);
    } catch (e) {
      return json({ error: String(e && e.message || e).slice(0, 200) }, 502);
    }
  },
};
