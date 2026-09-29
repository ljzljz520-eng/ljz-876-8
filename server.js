/**
 * 消防安全演练考试台 - HTTP 服务（零依赖）
 * 静态资源：/public ；API：/api/*
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const store = require('./store');
const L = require('./logic');

const PORT = process.env.PORT || 3000;
store.init();

// ---------------- 会话 tokens（内存） ----------------
const tokens = new Map(); // token -> {type:'emp'|'admin', id, admin}
function issueToken(type, id, extra) {
  const t = crypto.randomBytes(24).toString('hex');
  tokens.set(t, { type, id, ...(extra || {}) });
  return t;
}

// ---------------- 统计聚合 ----------------
function sessionStats(sessionId, filters = {}) {
  const db = store.get();
  const session = db.sessions.find(s => s.id === sessionId);
  let rows = db.sessionEmployees
    .filter(se => se.sessionId === sessionId)
    .map(se => db.employees.find(e => e.id === se.empId))
    .filter(Boolean);
  if (filters.floor) rows = rows.filter(e => String(e.floor) === String(filters.floor));
  if (filters.deptId) rows = rows.filter(e => e.deptId === filters.deptId);
  if (filters.position) rows = rows.filter(e => e.position === filters.position);
  if (filters.keyword) {
    const k = filters.keyword.trim();
    rows = rows.filter(e => e.name.includes(k) || e.empNo.toLowerCase().includes(k.toLowerCase()));
  }

  const dm = L.deptMap();
  const items = rows.map(e => {
    const p = L.getProgress(sessionId, e.id);
    const absent = L.effectiveAbsent(session, p);
    // 未达标原因（补入缺训判定）
    const reasons = [...p.reasons];
    if (absent && !reasons.includes('drill_absent')) reasons.push('drill_absent');
    return {
      empNo: e.empNo, name: e.name, deptId: e.deptId, deptName: dm[e.deptId] ? dm[e.deptId].name : '-',
      position: e.position, jobTitle: e.jobTitle, floor: e.floor,
      learningDone: p.learningDone,
      learningCount: p.courseStatus.filter(c => c.completed).length,
      examTaken: p.examTaken, examScore: p.examScore, examPassed: p.examPassed, examAttempts: p.examAttempts,
      attended: p.attended, absent,
      qualified: p.learningDone && p.examPassed && p.attended,
      retrainPending: db.retrain.some(r => r.empId === e.id && r.sourceSessionId === sessionId && r.status === 'pending'),
      reasons
    };
  });

  const total = items.length;
  const qualified = items.filter(i => i.qualified).length;
  const learningDone = items.filter(i => i.learningDone).length;
  const examPassed = items.filter(i => i.examPassed).length;
  const examTaken = items.filter(i => i.examTaken).length;
  const attended = items.filter(i => i.attended).length;
  const retrain = items.filter(i => i.retrainPending).length;

  const group = key => {
    const m = {};
    for (const it of items) {
      const k = it[key];
      if (!m[k]) m[k] = { key: k, total: 0, qualified: 0, learningDone: 0, examPassed: 0, attended: 0, retrain: 0 };
      const g = m[k];
      g.total++;
      if (it.qualified) g.qualified++;
      if (it.learningDone) g.learningDone++;
      if (it.examPassed) g.examPassed++;
      if (it.attended) g.attended++;
      if (it.retrainPending) g.retrain++;
    }
    return Object.values(m).map(g => ({ ...g, rate: g.total ? Math.round(g.qualified / g.total * 100) : 0 }));
  };

  return {
    session,
    summary: {
      total, qualified, rate: total ? Math.round(qualified / total * 100) : 0,
      learningDone, examTaken, examPassed, attended, retrain
    },
    byFloor: group('floor').sort((a, b) => a.key - b.key),
    byDept: group('deptId').map(g => ({ ...g, key: g.key, label: (dm[g.key] || {}).name || g.key })),
    byPosition: group('position'),
    items
  };
}

// ---------------- HTTP 工具 ----------------
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) reject(L.httpError(413, '请求体过大')); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(L.httpError(400, 'JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}
function auth(req, type) {
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  const sess = t && tokens.get(t);
  if (!sess) throw L.httpError(401, '未登录或会话已失效');
  if (type && sess.type !== type) throw L.httpError(403, '无权访问该资源');
  return sess;
}
// 仅完整管理员（非签到员）可操作
function authAdmin(req) {
  const sess = auth(req, 'admin');
  if (sess.admin === false) throw L.httpError(403, '签到员账号无权执行该操作');
  return sess;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // 简写入口
  if (rel === '/employee') rel = '/employee.html';
  if (rel === '/admin') rel = '/admin.html';
  const fp = path.join(__dirname, 'public', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!fp.startsWith(path.join(__dirname, 'public'))) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(fp, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---------------- 路由 ----------------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const q = parsed.query;
  try {
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    // ------- 认证 -------
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const b = await readBody(req);
      const db = store.get();
      if (b.role === 'admin') {
        const a = db.admins.find(x => x.username === b.username && x.password === b.password);
        if (!a) throw L.httpError(401, '管理员账号或密码错误');
        const token = issueToken('admin', a.id, { admin: a.role === 'admin' });
        return sendJson(res, 200, { token, role: 'admin', name: a.name, username: a.username, guard: a.role === 'guard' });
      }
      const e = db.employees.find(x => x.empNo.toLowerCase() === String(b.username || '').toLowerCase() && x.password === b.password);
      if (!e) throw L.httpError(401, '工号或密码错误（初始密码 123456）');
      const token = issueToken('emp', e.id);
      return sendJson(res, 200, { token, role: 'emp', emp: L.publicEmp(e) });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const h = req.headers['authorization'] || '';
      const t = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (t) tokens.delete(t);
      return sendJson(res, 200, { ok: true });
    }

    // ------- 基础数据 -------
    if (pathname === '/api/meta' && req.method === 'GET') {
      const db = store.get();
      return sendJson(res, 200, {
        floors: db.floors,
        departments: db.departments,
        positions: db.positions,
        courses: db.courses
      });
    }

    if (pathname === '/api/sessions' && req.method === 'GET') {
      const db = store.get();
      return sendJson(res, 200, db.sessions.map(s => ({
        id: s.id, name: s.name, drillDate: s.drillDate, drillTime: s.drillTime,
        location: s.location, floors: s.floors, passScore: s.passScore, status: s.status, remark: s.remark
      })));
    }

    // ------- 员工端 -------
    if (pathname === '/api/me' && req.method === 'GET') {
      const sess = auth(req, 'emp');
      const db = store.get();
      const emp = db.employees.find(e => e.id === sess.id);
      const dm = L.deptMap();
      // 该员工可参与的批次（按楼层）
      const mySessions = db.sessionEmployees
        .filter(se => se.empId === emp.id)
        .map(se => db.sessions.find(s => s.id === se.sessionId))
        .map(s => {
          const p = L.getProgress(s.id, emp.id);
          const absent = L.effectiveAbsent(s, p);
          const retrainPending = db.retrain.some(r => r.empId === emp.id && r.sourceSessionId === s.id && r.status === 'pending');
          return {
            id: s.id, name: s.name, drillDate: s.drillDate, drillTime: s.drillTime, location: s.location,
            status: s.status, passScore: s.passScore,
            learningDone: p.learningDone, courseStatus: p.courseStatus,
            examTaken: p.examTaken, examScore: p.examScore, examPassed: p.examPassed, examAttempts: p.examAttempts,
            attended: p.attended, absent, qualified: p.learningDone && p.examPassed && p.attended, retrainPending
          };
        });
      return sendJson(res, 200, {
        emp: { ...L.publicEmp(emp), deptName: dm[emp.deptId] ? dm[emp.deptId].name : '-' },
        sessions: mySessions
      });
    }

    if (pathname === '/api/me/progress' && req.method === 'GET') {
      const sess = auth(req, 'emp');
      const sessionId = q.sessionId;
      const db = store.get();
      if (!db.sessionEmployees.some(se => se.sessionId === sessionId && se.empId === sess.id)) throw L.httpError(403, '你不在该演练批次名单中');
      const p = L.getProgress(sessionId, sess.id);
      const session = db.sessions.find(s => s.id === sessionId);
      return sendJson(res, 200, {
        session: { id: session.id, name: session.name, drillDate: session.drillDate, drillTime: session.drillTime,
          location: session.location, status: session.status, passScore: session.passScore },
        progress: {
          courseStatus: p.courseStatus, learningDone: p.learningDone,
          examTaken: p.examTaken, examScore: p.examScore, examPassed: p.examPassed, examAttempts: p.examAttempts,
          attended: p.attended, qualified: p.qualified,
          latestExam: p.latestExam ? { attempt: p.latestExam.attempt, score: p.latestExam.score, passed: p.latestExam.passed, submittedAt: p.latestExam.submittedAt } : null
        }
      });
    }

    if (pathname === '/api/me/learn' && req.method === 'POST') {
      const sess = auth(req, 'emp');
      const b = await readBody(req);
      const db = store.get();
      if (!db.sessionEmployees.some(se => se.sessionId === b.sessionId && se.empId === sess.id)) throw L.httpError(403, '你不在该演练批次名单中');
      const p = L.completeCourse(b.sessionId, sess.id, b.courseId);
      return sendJson(res, 200, { ok: true, learningDone: p.learningDone, courseStatus: p.courseStatus });
    }

    if (pathname === '/api/me/exam/paper' && req.method === 'GET') {
      const sess = auth(req, 'emp');
      const sessionId = q.sessionId;
      const db = store.get();
      if (!db.sessionEmployees.some(se => se.sessionId === sessionId && se.empId === sess.id)) throw L.httpError(403, '你不在该演练批次名单中');
      return sendJson(res, 200, L.buildPaper(sessionId, sess.id));
    }

    if (pathname === '/api/me/exam/submit' && req.method === 'POST') {
      const sess = auth(req, 'emp');
      const b = await readBody(req);
      const db = store.get();
      if (!db.sessionEmployees.some(se => se.sessionId === b.sessionId && se.empId === sess.id)) throw L.httpError(403, '你不在该演练批次名单中');
      const result = L.submitExam(b.sessionId, sess.id, b);
      return sendJson(res, 200, result);
    }

    // ------- 管理端 -------
    if (pathname === '/api/admin/employees' && req.method === 'GET') {
      auth(req, 'admin');
      const db = store.get();
      const dm = L.deptMap();
      return sendJson(res, 200, db.employees.map(e => ({
        ...L.publicEmp(e), deptName: dm[e.deptId] ? dm[e.deptId].name : '-'
      })));
    }

    if (pathname === '/api/admin/stats' && req.method === 'GET') {
      auth(req, 'admin');
      if (!q.sessionId) throw L.httpError(400, '缺少 sessionId');
      const result = sessionStats(q.sessionId, {
        floor: q.floor, deptId: q.deptId, position: q.position, keyword: q.keyword
      });
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/admin/overview' && req.method === 'GET') {
      auth(req, 'admin');
      const db = store.get();
      const sessions = db.sessions.map(s => {
        const st = sessionStats(s.id);
        return { id: s.id, name: s.name, drillDate: s.drillDate, status: s.status, floors: s.floors, summary: st.summary };
      });
      return sendJson(res, 200, { sessions });
    }

    // 复训名单
    if (pathname === '/api/admin/retrain' && req.method === 'GET') {
      auth(req, 'admin');
      const db = store.get();
      const dm = L.deptMap();
      let recs = db.retrain.map(r => {
        const e = db.employees.find(x => x.id === r.empId);
        const s = db.sessions.find(x => x.id === r.sourceSessionId);
        return {
          ...r, emp: e ? { ...L.publicEmp(e), deptName: dm[e.deptId] ? dm[e.deptId].name : '-' } : null,
          sourceSessionName: s ? s.name : r.sourceSessionId
        };
      });
      if (q.status) recs = recs.filter(r => r.status === q.status);
      if (q.sessionId) recs = recs.filter(r => r.sourceSessionId === q.sessionId);
      if (q.floor) recs = recs.filter(r => r.emp && String(r.emp.floor) === String(q.floor));
      if (q.deptId) recs = recs.filter(r => r.emp && r.emp.deptId === q.deptId);
      recs.sort((a, b) => (a.status === b.status ? new Date(b.createdAt) - new Date(a.createdAt) : a.status === 'pending' ? -1 : 1));
      return sendJson(res, 200, recs);
    }

    if (pathname === '/api/admin/retrain/close' && req.method === 'POST') {
      authAdmin(req);
      const b = await readBody(req);
      return sendJson(res, 200, L.closeRetrain(b.id, b.resolveType || 'manual'));
    }

    if (pathname === '/api/admin/retrain/add' && req.method === 'POST') {
      authAdmin(req);
      const b = await readBody(req);
      return sendJson(res, 200, L.addRetrain(b.empId, b.sessionId, b.reasons || ['manual']));
    }

    // 同步/结算批次（演练结束后把缺训者自动纳入复训）
    if (pathname === '/api/admin/session/sync-retrain' && req.method === 'POST') {
      authAdmin(req);
      const b = await readBody(req);
      const ids = L.syncSessionRetrain(b.sessionId);
      return sendJson(res, 200, ok({ retrainRecordIds: ids }));
    }

    // 签到台
    if (pathname === '/api/admin/checkin' && req.method === 'POST') {
      const sess = auth(req, 'admin');
      const b = await readBody(req);
      const r = L.checkIn(b.sessionId, b.keyword, sess.id);
      return sendJson(res, 200, r);
    }
    if (pathname === '/api/admin/checkin/undo' && req.method === 'POST') {
      authAdmin(req);
      const b = await readBody(req);
      return sendJson(res, 200, L.undoCheckIn(b.sessionId, b.empId));
    }
    if (pathname === '/api/admin/checkin/list' && req.method === 'GET') {
      auth(req, 'admin');
      const db = store.get();
      const sessionId = q.sessionId;
      const dm = L.deptMap();
      const list = db.attendance.filter(a => a.sessionId === sessionId).map(a => {
        const e = db.employees.find(x => x.id === a.empId);
        return { ...a, emp: e ? { ...L.publicEmp(e), deptName: dm[e.deptId] ? dm[e.deptId].name : '-' } : null };
      }).sort((a, b) => new Date(b.checkedInAt || 0) - new Date(a.checkedInAt || 0));
      return sendJson(res, 200, list);
    }

    // 考试记录
    if (pathname === '/api/admin/exams' && req.method === 'GET') {
      auth(req, 'admin');
      const db = store.get();
      const dm = L.deptMap();
      let recs = db.exams.map(x => {
        const e = db.employees.find(en => en.id === x.empId);
        return { ...x, emp: e ? { ...L.publicEmp(e), deptName: dm[e.deptId] ? dm[e.deptId].name : '-' } : null };
      });
      if (q.sessionId) recs = recs.filter(r => r.sessionId === q.sessionId);
      recs.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      return sendJson(res, 200, recs);
    }

    // 重置演示数据
    if (pathname === '/api/admin/reset-demo' && req.method === 'POST') {
      authAdmin(req);
      store.resetAll();
      return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 404, { error: '接口不存在' });
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message || '服务器内部错误' });
  }
});

function ok(o) { return { ok: true, ...o }; }

server.listen(PORT, () => {
  console.log('🔥 消防安全演练考试台已启动');
  console.log(`   门户首页:  http://localhost:${PORT}/`);
  console.log(`   员工端:    http://localhost:${PORT}/employee.html`);
  console.log(`   管理端:    http://localhost:${PORT}/admin.html`);
  console.log('   管理员 admin/admin123 ｜ 签到员 guard/guard123 ｜ 员工工号 E001 密码 123456');
});
