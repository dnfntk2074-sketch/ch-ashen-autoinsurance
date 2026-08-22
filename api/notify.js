const crypto = require("crypto");

function cleanPhone(v) {
  return String(v || "").replace(/\D/g, "");
}

function authHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", apiSecret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST 요청만 허용됩니다." });
  }

  try {
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const from = cleanPhone(process.env.SOLAPI_FROM);
    const to = cleanPhone(process.env.SOLAPI_TO);
    if (!apiKey || !apiSecret || !from || !to) {
      return res.status(500).json({ ok: false, error: "문자 발송 환경변수를 확인해주세요." });
    }

    const body = req.body || {};
    const carNo = String(body.carNo || "").trim();
    const expiry = String(body.expiry || "").trim();
    const owner = String(body.owner || "").trim();
    const phone = String(body.phone || "").trim();
    const rrnMethod = String(body.rrnMethod || "").trim();
    const source = String(body.source || "30초 설문").trim();
    if (!carNo || !expiry || !owner || cleanPhone(phone).length < 10 || !rrnMethod) {
      return res.status(400).json({ ok: false, error: "설문 입력값이 올바르지 않습니다." });
    }

    const text = [
      "[자동차보험 비교견적 접수]",
      `차량번호: ${carNo}`,
      `만기일: ${expiry}`,
      `소유주: ${owner}`,
      `연락처: ${phone}`,
      `주민번호 확인: ${rrnMethod}`,
      `유입: ${source}`
    ].join("\n");

    const response = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: { Authorization: authHeader(apiKey, apiSecret), "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ to, from, text }] })
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
    if (!response.ok) {
      const msg = data?.errorMessage || data?.message || data?.error || raw || `SOLAPI HTTP ${response.status}`;
      return res.status(502).json({ ok: false, error: msg });
    }
    const failed = (Array.isArray(data?.failedMessageList) && data.failedMessageList.length > 0) || (typeof data?.errorCount === "number" && data.errorCount > 0);
    if (failed) return res.status(502).json({ ok: false, error: "SOLAPI에서 일부 메시지 발송을 거절했습니다.", detail: data });
    return res.status(200).json({ ok: true, result: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err && err.message ? err.message : "문자 발송 중 오류가 발생했습니다." });
  }
};
