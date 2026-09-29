/**
 * 业务逻辑：状态聚合 + 学习/考试/签到/复训动作
 */
const crypto = require('crypto');
const store = require('./store');

const COURSE_IDS = ['C01', 'C02', 'C03'];

function uid(prefix) {
  return prefix + crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 9);
}

function nowIso() { return new Date().toISOString(); }

function deptMap() { return Object.fromEntries(store.get().departments.map(d => [d.id, d])); }
function empMap() { return Object.fromEntries(store.get().employees.map(e => [e.id, e])); }

/** 某员工在某批次的聚合状态 */
function getProgress(sessionId, empId) {
  const db = store.get();
  const session = db.sessions.find(s => s.id === sessionId);
  const learns = db.learning.filter(l => l.sessionId === sessionId && l.empId === empId);
  const exams = db.exams
    .filter(x => x.sessionId === sessionId && x.empId === empId)
    .sort((a, b) => b.attempt - a.attempt);
  const latestExam = exams[0] || null;
  // 同一人可能有"缺席→补签"两条记录，优先取有效签到
  const attendRecords = db.attendance.filter(a => a.sessionId === sessionId && a.empId === empId);
  const attend = attendRecords.find(a => a.status === 'present') || attendRecords[0] || null;

  const completedCourses = [...new Set(learns.map(l => l.courseId))];
  const courseStatus = COURSE_IDS.map(cid => ({
    courseId: cid,
    completed: completedCourses.includes(cid),
    completedAt: (learns.filter(l => l.courseId === cid).sort(
      (a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0] || {}).completedAt || null
  }));
  const learningDone = COURSE_IDS.every(cid => completedCourses.includes(cid));

  const examPassed = !!(latestExam && latestExam.passed);
  const examScore = latestExam ? latestExam.score : null;
  const attended = !!(attend && attend.status === 'present');

  // 综合合格：三门课学完 + 最近一次考试通过 + 线下签到
  const qualified = learningDone && examPassed && attended;

  // 未达标原因
  const reasons = [];
  if (!learningDone) reasons.push('learning_incomplete');
  if (latestExam && !latestExam.passed) reasons.push('exam_fail');
  if (attend && attend.status !== 'present') reasons.push('drill_absent');
  // 演练已结束但无签到记录也算缺席（由 sessions.status 判断）
  const noAttendanceRecord = !attend;

  return {
    sessionId, empId,
    courseStatus,
    learningDone,
    examTaken: !!latestExam,
    examAttempts: exams.length,
    examScore,
    examPassed,
    latestExam,
    attendance: attend,
    attended,
    noAttendanceRecord,
    qualified,
    reasons,
    passScore: session ? session.passScore : 80
  };
}

/**
 * 批次下是否应缺席判定：
 * 演练状态 closed/ongoing 且没有 present 记录 → 视为缺训
 * planned 批次不判定（还没到演练日）
 */
function effectiveAbsent(session, progress) {
  if (session.status === 'planned') return false;
  if (progress.attended) return false;
  return true; // ongoing（演练已结束）或 closed，无有效签到
}

/** 学习打卡：重复提交幂等 */
function completeCourse(sessionId, empId, courseId) {
  const db = store.get();
  if (!COURSE_IDS.includes(courseId)) throw httpError(400, '课程不存在');
  const exists = db.learning.some(l => l.sessionId === sessionId && l.empId === empId && l.courseId === courseId);
  if (!exists) {
    db.learning.push({ id: uid('L'), sessionId, empId, courseId, completedAt: nowIso() });
    store.save();
  }
  return getProgress(sessionId, empId);
}

/** 组卷：灭火器4 + 疏散3 + 报警3（共10题，10分/题） */
function buildPaper(sessionId, empId) {
  const db = store.get();
  const byCourse = {};
  db.questions.forEach(q => { (byCourse[q.courseId] = byCourse[q.courseId] || []).push(q); });
  const draw = (cid, n) => {
    const pool = [...byCourse[cid]];
    // Fisher-Yates 部分洗牌
    for (let i = pool.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  };
  const questions = [...draw('C01', 4), ...draw('C02', 3), ...draw('C03', 3)].map(q => ({
    id: q.id, courseId: q.courseId, stem: q.stem, options: q.options
  }));
  // 打乱题目顺序
  for (let i = questions.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return { sessionId, empId, paperToken: uid('T'), questions };
}

/** 交卷判分（服务端以题库为准，不信任前端分值） */
function submitExam(sessionId, empId, payload) {
  const db = store.get();
  const session = db.sessions.find(s => s.id === sessionId);
  if (!session) throw httpError(404, '演练批次不存在');
  const answers = payload.answers;
  if (!Array.isArray(answers) || answers.length === 0) throw httpError(400, '答题数据为空');

  // 学习前置校验
  const progress = getProgress(sessionId, empId);
  if (!progress.learningDone) throw httpError(400, '请先完成全部三门课程学习后再参加测验');

  const qmap = Object.fromEntries(db.questions.map(q => [q.id, q]));
  const details = [];
  let correct = 0;
  for (const a of answers) {
    const q = qmap[a.questionId];
    if (!q) continue;
    const ok = Number(a.optionIndex) === q.answer;
    if (ok) correct++;
    details.push({
      questionId: q.id, courseId: q.courseId, stem: q.stem,
      options: q.options, yourAnswer: Number(a.optionIndex),
      correctAnswer: q.answer, ok, analysis: q.analysis
    });
  }
  const total = details.length;
  const score = Math.round((correct / total) * 100);
  const passed = score >= session.passScore;
  const attempt = db.exams.filter(x => x.sessionId === sessionId && x.empId === empId).length + 1;

  const record = {
    id: uid('X'), sessionId, empId, attempt,
    questionIds: details.map(d => d.questionId),
    answers: details.map(d => d.yourAnswer),
    score, passed, submittedAt: nowIso()
  };
  db.exams.push(record);
  store.save();

  // 自动复训判定（考试不过）
  if (!passed) ensureRetrain(empId, sessionId, 'exam_fail');
  else resolveRetrainByExam(empId, sessionId);

  return { score, passed, passScore: session.passScore, correct, total, attempt, details };
}

/** 签到（线下签到台，工号或姓名匹配） */
function checkIn(sessionId, keyword, adminId) {
  const db = store.get();
  const kw = String(keyword || '').trim();
  if (!kw) throw httpError(400, '请输入工号或姓名');
  const emp = db.employees.find(e => e.empNo.toLowerCase() === kw.toLowerCase() || e.name === kw);
  if (!emp) throw httpError(404, `未找到员工：${kw}`);
  const assigned = db.sessionEmployees.some(se => se.sessionId === sessionId && se.empId === emp.id);
  if (!assigned) throw httpError(400, `${emp.name}（${emp.empNo}）不属于本批次覆盖楼层`);

  const existing = db.attendance.find(a => a.sessionId === sessionId && a.empId === emp.id);
  if (existing && existing.status === 'present') {
    return { duplicated: true, attendance: existing, emp: publicEmp(emp) };
  }
  let rec;
  if (existing) {
    existing.status = 'present';
    existing.checkedInAt = nowIso();
    existing.method = 'onsite';
    existing.by = adminId;
    rec = existing;
  } else {
    rec = { id: uid('A'), sessionId, empId: emp.id, status: 'present', checkedInAt: nowIso(), method: 'onsite', by: adminId };
    db.attendance.push(rec);
  }
  store.save();
  // 补签到后移除"缺训"原因；仅剩该原因则自动解除，考试未过则继续保留复训
  resolveRetrainByAttendance(emp.id, sessionId);
  return { duplicated: false, attendance: rec, emp: publicEmp(emp) };
}

/** 标记缺席（管理员） */
function markAbsent(sessionId, empId) {
  const db = store.get();
  let rec = db.attendance.find(a => a.sessionId === sessionId && a.empId === empId);
  if (!rec) {
    rec = { id: uid('A'), sessionId, empId, status: 'absent', checkedInAt: null, method: null, by: null };
    db.attendance.push(rec);
  } else {
    rec.status = 'absent';
  }
  store.save();
  ensureRetrain(empId, sessionId, 'drill_absent');
  return rec;
}

/** 撤销签到（管理员纠错） */
function undoCheckIn(sessionId, empId) {
  const db = store.get();
  const rec = db.attendance.find(a => a.sessionId === sessionId && a.empId === empId);
  if (rec) {
    rec.status = 'absent';
    rec.checkedInAt = null;
    store.save();
    ensureRetrain(empId, sessionId, 'drill_absent');
  }
  return rec;
}

/** 确保复训记录存在（自动入册） */
function ensureRetrain(empId, sessionId, reason) {
  const db = store.get();
  let rec = db.retrain.find(r => r.empId === empId && r.sourceSessionId === sessionId && r.status === 'pending');
  if (!rec) {
    rec = { id: uid('R'), empId, sourceSessionId: sessionId, reasons: [], status: 'pending', createdAt: nowIso(),
      resolvedAt: null, resolveType: null, resolveSessionId: null };
    db.retrain.push(rec);
  }
  if (!rec.reasons.includes(reason)) rec.reasons.push(reason);
  store.save();
  return rec;
}

/** 补考通过：若仅剩 exam_fail 则解除；否则去掉该原因 */
function resolveRetrainByExam(empId, sessionId) {
  const db = store.get();
  const rec = db.retrain.find(r => r.empId === empId && r.sourceSessionId === sessionId && r.status === 'pending');
  if (!rec) return;
  rec.reasons = rec.reasons.filter(r => r !== 'exam_fail');
  if (rec.reasons.length === 0) {
    rec.status = 'resolved';
    rec.resolvedAt = nowIso();
    rec.resolveType = 'retake_passed';
    rec.resolveSessionId = sessionId;
  }
  store.save();
}

/** 补签到：若仅剩 drill_absent 则解除 */
function resolveRetrainByAttendance(empId, sessionId) {
  const db = store.get();
  const rec = db.retrain.find(r => r.empId === empId && r.sourceSessionId === sessionId && r.status === 'pending');
  if (!rec) return;
  rec.reasons = rec.reasons.filter(r => r !== 'drill_absent');
  if (rec.reasons.length === 0) {
    rec.status = 'resolved';
    rec.resolvedAt = nowIso();
    rec.resolveType = 'makeup_checkin';
    rec.resolveSessionId = sessionId;
  }
  store.save();
}

/**
 * 同步批次复训名单（管理端触发/系统结算）：
 * 已结束(closed/ongoing)批次中，考试未过 或 缺签到 或 学习未完成（ongoing 学习未完成也入册，演练日后截止）
 */
function syncSessionRetrain(sessionId) {
  const db = store.get();
  const session = db.sessions.find(s => s.id === sessionId);
  if (!session) return [];
  const empIds = db.sessionEmployees.filter(se => se.sessionId === sessionId).map(se => se.empId);
  const touched = [];
  for (const empId of empIds) {
    const p = getProgress(sessionId, empId);
    if (session.status === 'planned') continue;
    if (p.latestExam && !p.examPassed) touched.push(ensureRetrain(empId, sessionId, 'exam_fail').id);
    if (!p.attended) touched.push(ensureRetrain(empId, sessionId, 'drill_absent').id);
    if (!p.learningDone && session.status === 'closed') touched.push(ensureRetrain(empId, sessionId, 'learning_incomplete').id);
  }
  return [...new Set(touched)];
}

/** 管理员手动将某人加入/移出复训 */
function addRetrain(empId, sessionId, reasons) {
  if (!reasons || reasons.length === 0) reasons = ['manual'];
  const rec = ensureRetrain(empId, sessionId, reasons[0]);
  for (const r of reasons.slice(1)) if (!rec.reasons.includes(r)) rec.reasons.push(r);
  return rec;
}
function closeRetrain(id, resolveType = 'manual') {
  const db = store.get();
  const rec = db.retrain.find(r => r.id === id);
  if (!rec) throw httpError(404, '复训记录不存在');
  rec.status = 'resolved';
  rec.resolvedAt = nowIso();
  rec.resolveType = resolveType;
  store.save();
  return rec;
}

function publicEmp(e) {
  return { id: e.id, empNo: e.empNo, name: e.name, deptId: e.deptId, jobTitle: e.jobTitle, position: e.position, floor: e.floor };
}

function httpError(status, message) { const err = new Error(message); err.status = status; return err; }

module.exports = {
  COURSE_IDS, getProgress, effectiveAbsent, completeCourse, buildPaper, submitExam,
  checkIn, markAbsent, undoCheckIn, syncSessionRetrain, addRetrain, closeRetrain,
  publicEmp, httpError, deptMap, empMap
};
