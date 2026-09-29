const express = require('express');
const db = require('../db');

const router = express.Router();
const PASS_SCORE = 80;
const TOTAL_LESSONS = 3;
const now = () => new Date().toISOString();

/* ---------------- helpers ---------------- */

function getEmployeeByNo(empNo) {
  return db.prepare(`
    SELECT e.*, f.name AS floor_name, d.name AS department_name, p.name AS position_name
    FROM employees e
    JOIN floors f ON f.id = e.floor_id
    JOIN departments d ON d.id = e.department_id
    JOIN positions p ON p.id = e.position_id
    WHERE e.emp_no = ?`).get(String(empNo || '').trim());
}

function getEmployee(id) {
  return db.prepare(`
    SELECT e.*, f.name AS floor_name, d.name AS department_name, p.name AS position_name
    FROM employees e
    JOIN floors f ON f.id = e.floor_id
    JOIN departments d ON d.id = e.department_id
    JOIN positions p ON p.id = e.position_id
    WHERE e.id = ?`).get(id);
}

function employeeStatus(empId, sessionId) {
  const lessonsDone = db.prepare(
    'SELECT COUNT(*) AS c FROM lesson_progress WHERE employee_id = ?').get(empId).c;
  const attempts = db.prepare(
    'SELECT COUNT(*) AS c FROM quiz_attempts WHERE employee_id = ?').get(empId).c;
  const passed = db.prepare(
    'SELECT COUNT(*) AS c FROM quiz_attempts WHERE employee_id = ? AND passed = 1').get(empId).c;
  const latest = db.prepare(
    'SELECT * FROM quiz_attempts WHERE employee_id = ? ORDER BY id DESC LIMIT 1').get(empId);
  const checkin = db.prepare(
    'SELECT * FROM checkins WHERE employee_id = ? AND session_id = ?').get(empId, sessionId);
  const retrain = db.prepare(
    'SELECT * FROM retraining WHERE employee_id = ? ORDER BY id DESC LIMIT 1').get(empId);

  const lessonsCompleted = lessonsDone >= TOTAL_LESSONS;
  const quizPassed = passed > 0;
  const checkedIn = !!checkin;

  let status;
  if (lessonsCompleted && quizPassed && checkedIn) status = 'completed';
  else if (lessonsDone === 0 && attempts === 0 && !checkedIn) status = 'not_started';
  else status = 'in_progress';

  let quizState = 'not_taken';
  if (quizPassed) quizState = 'passed';
  else if (attempts > 0) quizState = 'failed';

  return {
    lessons_done: lessonsDone,
    lessons_completed: lessonsCompleted,
    quiz_state: quizState,
    last_score: latest ? latest.score : null,
    attempts,
    checked_in: checkedIn,
    checkin_at: checkin ? checkin.created_at : null,
    status,
    retraining: retrain && retrain.status === 'open' ? retrain : null,
  };
}

// 通过补考/补签到后，关闭对应原因的复训记录
function resolveRetraining(empId, reasonLike) {
  const rows = db.prepare(
    'SELECT * FROM retraining WHERE employee_id = ? AND status = \'open\'').all(empId);
  for (const r of rows) {
    if (!reasonLike || r.reason.includes(reasonLike)) {
      db.prepare('UPDATE retraining SET status = ?, resolved_at = ? WHERE id = ?')
        .run('resolved', now(), r.id);
    }
  }
}

/* ---------------- meta ---------------- */

router.get('/meta', (req, res) => {
  res.json({
    pass_score: PASS_SCORE,
    floors: db.prepare('SELECT * FROM floors ORDER BY id').all(),
    departments: db.prepare('SELECT * FROM departments ORDER BY id').all(),
    positions: db.prepare('SELECT * FROM positions ORDER BY id').all(),
  });
});

/* ---------------- employee ---------------- */

router.get('/employee/lookup/:empNo', (req, res) => {
  const emp = getEmployeeByNo(req.params.empNo);
  if (!emp) return res.status(404).json({ error: '工号不存在，请联系安全员' });
  const session = db.prepare('SELECT * FROM drill_sessions WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  res.json({ employee: emp, status: employeeStatus(emp.id, session.id), session });
});

router.get('/employee/:id', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  const session = db.prepare('SELECT * FROM drill_sessions WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  res.json({ employee: emp, status: employeeStatus(emp.id, session.id), session });
});

router.get('/employee/:id/lessons', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  const lessons = db.prepare(`
    SELECT l.id, l.code, l.title, l.content,
      (SELECT completed_at FROM lesson_progress lp WHERE lp.lesson_id = l.id AND lp.employee_id = ?) AS completed_at
    FROM lessons l ORDER BY l.id`).all(emp.id);
  res.json({ lessons });
});

router.post('/employee/:id/lessons/:lessonId/complete', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: '课程不存在' });
  db.prepare('INSERT OR IGNORE INTO lesson_progress (employee_id, lesson_id, completed_at) VALUES (?,?,?)')
    .run(emp.id, lesson.id, now());
  res.json({ ok: true });
});

// 题目（不返回正确答案）
router.get('/employee/:id/questions', (req, res) => {
  const questions = db.prepare(`
    SELECT id, lesson_code, content, option_a, option_b, option_c, option_d
    FROM questions ORDER BY id`).all();
  res.json({ questions, pass_score: PASS_SCORE });
});

router.post('/employee/:id/quiz', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ error: '员工不存在' });

  const lessonsDone = db.prepare(
    'SELECT COUNT(*) AS c FROM lesson_progress WHERE employee_id = ?').get(emp.id).c;
  if (lessonsDone < TOTAL_LESSONS) {
    return res.status(400).json({ error: '请先完成全部三门课程学习后再参加测验' });
  }

  const questions = db.prepare('SELECT * FROM questions ORDER BY id').all();
  const submitted = req.body.answers || {};
  let correct = 0;
  const detail = questions.map(q => {
    const chosen = String(submitted[q.id] || '').toUpperCase();
    const isCorrect = chosen === q.answer;
    if (isCorrect) correct += 1;
    return { question_id: q.id, chosen, correct: isCorrect, answer: q.answer };
  });
  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= PASS_SCORE ? 1 : 0;

  db.prepare(`INSERT INTO quiz_attempts (employee_id, score, passed, answers_json, created_at)
    VALUES (?,?,?,?,?)`).run(emp.id, score, passed, JSON.stringify(detail), now());

  // 本次未通过且历史从未通过 → 自动进入复训名单（曾通过者不因一次重考失误被重新标记）
  const everPassed = db.prepare(
    'SELECT COUNT(*) AS c FROM quiz_attempts WHERE employee_id = ? AND passed = 1').get(emp.id).c > 0;
  if (!passed && !everPassed) {
    db.prepare(`INSERT INTO retraining (employee_id, reason, status, created_at)
      SELECT ?, ?, 'open', ? WHERE NOT EXISTS
      (SELECT 1 FROM retraining WHERE employee_id = ? AND status = 'open')`)
      .run(emp.id, `线上测验未通过（${score}分，及格线${PASS_SCORE}分）`, now(), emp.id);
  } else if (passed) {
    resolveRetraining(emp.id, '测验未通过');
  }

  const session = db.prepare('SELECT * FROM drill_sessions WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  res.json({ ok: true, score, passed: !!passed, pass_score: PASS_SCORE, detail,
    status: employeeStatus(emp.id, session.id) });
});

/* ---------------- 线下签到 ---------------- */

router.post('/checkin', (req, res) => {
  const { emp_no, code } = req.body || {};
  const emp = getEmployeeByNo(emp_no);
  if (!emp) return res.status(404).json({ error: '工号不存在' });
  const session = db.prepare('SELECT * FROM drill_sessions WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!session) return res.status(400).json({ error: '当前没有进行中的演练场次' });
  if (String(code).trim() !== session.checkin_code) {
    return res.status(400).json({ error: '签到码错误，请向现场安全员核对' });
  }
  try {
    db.prepare('INSERT INTO checkins (employee_id, session_id, method, created_at) VALUES (?,?,?,?)')
      .run(emp.id, session.id, 'code', now());
  } catch (e) {
    return res.status(409).json({ error: '您已完成本场次签到，请勿重复签到' });
  }
  resolveRetraining(emp.id, '未完成线下演练签到');
  res.json({ ok: true, session_name: session.name, status: employeeStatus(emp.id, session.id) });
});

/* ---------------- 管理端 ---------------- */

router.get('/admin/overview', (req, res) => {
  const { floor_id, department_id, position_id } = req.query;
  const where = [];
  const params = [];
  if (floor_id) { where.push('e.floor_id = ?'); params.push(floor_id); }
  if (department_id) { where.push('e.department_id = ?'); params.push(department_id); }
  if (position_id) { where.push('e.position_id = ?'); params.push(position_id); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const session = db.prepare('SELECT * FROM drill_sessions WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  const rows = db.prepare(`
    SELECT e.id FROM employees e ${whereSql}`).all(...params);

  const list = rows.map(r => {
    const emp = getEmployee(r.id);
    const st = employeeStatus(r.id, session.id);
    return { ...emp, ...st };
  });

  const summary = {
    total: list.length,
    completed: list.filter(x => x.status === 'completed').length,
    in_progress: list.filter(x => x.status === 'in_progress').length,
    not_started: list.filter(x => x.status === 'not_started').length,
    lessons_done_all: list.filter(x => x.lessons_completed).length,
    quiz_passed: list.filter(x => x.quiz_state === 'passed').length,
    checked_in: list.filter(x => x.checked_in).length,
    retraining: list.filter(x => x.retraining).length,
  };

  const groupBy = (key, labelKey) => {
    const map = new Map();
    for (const x of list) {
      const k = x[key];
      if (!map.has(k)) map.set(k, { id: k, name: x[labelKey], total: 0, completed: 0, retraining: 0, checked_in: 0, quiz_passed: 0 });
      const g = map.get(k);
      g.total += 1;
      if (x.status === 'completed') g.completed += 1;
      if (x.retraining) g.retraining += 1;
      if (x.checked_in) g.checked_in += 1;
      if (x.quiz_state === 'passed') g.quiz_passed += 1;
    }
    return [...map.values()].map(g => ({ ...g, rate: g.total ? Math.round(g.completed / g.total * 100) : 0 }));
  };

  res.json({
    session,
    pass_score: PASS_SCORE,
    summary,
    employees: list,
    by_floor: groupBy('floor_id', 'floor_name'),
    by_department: groupBy('department_id', 'department_name'),
    by_position: groupBy('position_id', 'position_name'),
  });
});

router.get('/admin/retraining', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, e.emp_no, e.name,
      f.name AS floor_name, d.name AS department_name, p.name AS position_name
    FROM retraining r
    JOIN employees e ON e.id = r.employee_id
    JOIN floors f ON f.id = e.floor_id
    JOIN departments d ON d.id = e.department_id
    JOIN positions p ON p.id = e.position_id
    WHERE r.status = 'open'
    ORDER BY r.created_at DESC`).all();
  res.json({ list: rows });
});

// 安全员现场代签到
router.post('/admin/employees/:id/checkin', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  const session = db.prepare('SELECT * FROM drill_sessions WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!session) return res.status(400).json({ error: '当前没有进行中的演练场次' });
  try {
    db.prepare('INSERT INTO checkins (employee_id, session_id, method, created_at) VALUES (?,?,?,?)')
      .run(emp.id, session.id, 'admin', now());
  } catch (e) {
    return res.status(409).json({ error: '该员工已签到' });
  }
  resolveRetraining(emp.id, '未完成线下演练签到');
  res.json({ ok: true, status: employeeStatus(emp.id, session.id) });
});

router.post('/admin/retraining/:id/resolve', (req, res) => {
  const r = db.prepare('SELECT * FROM retraining WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: '记录不存在' });
  db.prepare('UPDATE retraining SET status = ?, resolved_at = ? WHERE id = ?')
    .run('resolved', now(), r.id);
  res.json({ ok: true });
});

module.exports = router;
