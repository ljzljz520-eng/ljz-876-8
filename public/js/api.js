// 轻量 API 封装
window.api = (function () {
  function token() { return localStorage.getItem('fire_token') || ''; }
  function setToken(t) { t ? localStorage.setItem('fire_token', t) : localStorage.removeItem('fire_token'); }
  async function request(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || '请求失败'); e.status = res.status; throw e; }
    return data;
  }
  return {
    token, setToken,
    get: p => request('GET', p),
    post: (p, b) => request('POST', p, b || {})
  };
})();

window.REASON_TEXT = {
  learning_incomplete: '课程未学完',
  exam_fail: '测验未通过',
  drill_absent: '演练缺训',
  manual: '管理员纳入'
};
