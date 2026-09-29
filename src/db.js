const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'fire_safety.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

function createTables() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS floors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY,
    emp_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    floor_id INTEGER NOT NULL REFERENCES floors(id),
    department_id INTEGER NOT NULL REFERENCES departments(id),
    position_id INTEGER NOT NULL REFERENCES positions(id)
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lesson_progress (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id),
    completed_at TEXT NOT NULL,
    UNIQUE(employee_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY,
    lesson_code TEXT NOT NULL,
    content TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    answer TEXT NOT NULL CHECK(answer IN ('A','B','C','D'))
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    answers_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drill_sessions (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    drill_date TEXT NOT NULL,
    checkin_code TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES drill_sessions(id),
    method TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(employee_id, session_id)
  );

  CREATE TABLE IF NOT EXISTS retraining (
    id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_emp_org ON employees(floor_id, department_id, position_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_emp ON quiz_attempts(employee_id);
  CREATE INDEX IF NOT EXISTS idx_checkins_session ON checkins(session_id);
  `);
}

const now = () => new Date().toISOString();

function seed() {
  const lessonCount = db.prepare('SELECT COUNT(*) AS c FROM lessons').get().c;
  if (lessonCount > 0) return;

  const insertFloor = db.prepare('INSERT INTO floors (id, name) VALUES (?,?)');
  const floors = [
    [1, '1F 大堂/行政层'],
    [2, '2F 研发层'],
    [3, '3F 生产车间'],
    [4, '5F 仓储物流层'],
  ];
  floors.forEach(f => insertFloor.run(...f));

  const insertDept = db.prepare('INSERT INTO departments (id, name) VALUES (?,?)');
  const depts = [
    [1, '行政人事部'],
    [2, '研发部'],
    [3, '生产部'],
    [4, '仓储部'],
    [5, '安全环保部'],
  ];
  depts.forEach(d => insertDept.run(...d));

  const insertPos = db.prepare('INSERT INTO positions (id, name) VALUES (?,?)');
  const positions = [
    [1, '普通员工'],
    [2, '班组长'],
    [3, '部门主管'],
    [4, '义务消防员'],
  ];
  positions.forEach(p => insertPos.run(...p));

  const insertLesson = db.prepare('INSERT INTO lessons (id, code, title, content) VALUES (?,?,?,?)');
  const lessons = [
    [1, 'extinguisher', '灭火器使用',
      '一、提：手提灭火器提把，快速赶到火场。\n二、拔：拔掉保险销。\n三、握：一手握住喷管前端（喷嘴对准火焰根部），另一手握紧压把。\n四、压：站在上风向，距火源2-3米处用力按下压把，左右扫射。\n\n口诀：“一提二拔三握四压”。\n注意：电气火灾先断电；油锅火灾不能直接用水；室外使用选择上风方向。常见ABC干粉灭火器可扑救固体、液体、气体及带电设备初起火灾。'],
    [2, 'evacuation', '疏散路线',
      '1. 听到警报后，保持冷静，立即停止工作，关闭设备电源和门窗（防火门常闭，切勿堵塞）。\n2. 沿墙面安全出口指示灯和疏散指示标志，从最近的安全楼梯有序撤离，严禁乘坐电梯。\n3. 低姿弯腰、用湿毛巾或衣袖捂住口鼻，扶墙快速通过烟雾区。\n4. 不贪恋财物、不返回火场、不推挤起哄；行动不便者由就近人员帮扶撤离。\n5. 到达指定集合点（各楼层集合点见疏散平面图）后按部门列队清点人数，并向现场指挥报告。'],
    [3, 'alarm', '报警流程',
      '1. 发现火情立即大声呼喊“着火了”并按下就近手动火灾报警按钮（消防手动报警器）。\n2. 拨打 119 火警电话：讲清详细地址（XX市XX路XX号X栋X层）、起火物质、火势大小、有无人员被困、报警人姓名及电话。\n3. 通知单位消防控制室/值班领导，启动灭火和应急疏散预案。\n4. 派人到路口引导消防车；在确保自身安全前提下使用就近器材扑救初起火灾。'],
  ];
  lessons.forEach(l => insertLesson.run(...l));

  const insertQ = db.prepare(`INSERT INTO questions
    (lesson_code, content, option_a, option_b, option_c, option_d, answer)
    VALUES (?,?,?,?,?,?,?)`);
  const questions = [
    ['extinguisher','使用灭火器的正确顺序口诀是？','一提二拔三握四压','一拔二提三压四握','一压二握三拔四提','一握二压三提四拔','A'],
    ['extinguisher','使用干粉灭火器扑救时，喷嘴应对准火焰的哪个部位？','火焰顶部','火焰中部','火焰根部','周围空气','C'],
    ['extinguisher','室外使用灭火器时应选择什么站位？','下风向','上风向','正对浓烟','任意方向','B'],
    ['extinguisher','发现电气设备起火，第一步应该做什么？','用水浇灭','直接用灭火器喷射','先切断电源','用湿布覆盖','C'],
    ['evacuation','火灾逃生时，能否乘坐普通电梯？','可以，更快','人少时可以','严禁，应走疏散楼梯','着火层以下可以','C'],
    ['evacuation','穿过浓烟区域时正确的做法是？','直立奔跑','低姿弯腰、湿毛巾捂口鼻','屏住呼吸原地等待','返回办公室关门','B'],
    ['evacuation','撤离到集合点后首先要做什么？','自行离开回家','按部门列队清点人数','拍照发群','再次返回拿物品','B'],
    ['evacuation','关于常闭式防火门，正确做法是？','用物品撑开方便通行','保持关闭、不堵塞不锁死','可以上锁防盗','拆除以利通行','B'],
    ['alarm','全国统一火警电话是？','110','120','119','122','C'],
    ['alarm','拨打119时不需要说明的内容是？','详细地址和起火楼层','起火物质和火势','报警人姓名电话','个人工资收入','D'],
    ['alarm','发现初起火灾，在确保安全的前提下首先可以？','围观等待','用就近灭火器材扑救并报警','打开所有门窗通风','立即跳楼逃生','B'],
    ['alarm','关于手动火灾报警按钮，正确的是？','仅消防员可按','发现火情任何人都应按下报警','按了会罚款','只在夜间使用','B'],
  ];
  questions.forEach(q => insertQ.run(...q));

  const insertSession = db.prepare('INSERT INTO drill_sessions (id, name, drill_date, checkin_code, active) VALUES (?,?,?,?,1)');
  insertSession.run(1, '2026年第三季度消防应急疏散演练', '2026-09-25', '119');

  const insertEmp = db.prepare('INSERT INTO employees (id, emp_no, name, floor_id, department_id, position_id) VALUES (?,?,?,?,?,?)');
  const employees = [
    [1,'E1001','王建国',1,1,3],[2,'E1002','李晓梅',1,1,1],[3,'E1003','张志强',1,5,4],
    [4,'E1004','陈静',2,2,3],[5,'E1005','刘浩然',2,2,1],[6,'E1006','赵敏',2,2,1],[7,'E1007','孙磊',2,2,2],
    [8,'E1008','周海燕',3,3,3],[9,'E1009','吴鹏',3,3,4],[10,'E1010','郑芳',3,3,1],[11,'E1011','冯刚',3,3,2],[12,'E1012','褚红',3,3,1],
    [13,'E1013','卫龙',4,4,3],[14,'E1014','蒋雪',4,4,1],[15,'E1015','沈大力',4,4,1],[16,'E1016','韩梅',4,4,2],
  ];
  employees.forEach(e => insertEmp.run(...e));

  // 为“已完成”的员工预置：课程全部完成
  const markLesson = db.prepare('INSERT OR IGNORE INTO lesson_progress (employee_id, lesson_id, completed_at) VALUES (?,?,?)');
  const completeAllLessons = (empId, iso) => [1,2,3].forEach(lid => markLesson.run(empId, lid, iso));

  const insAttempt = db.prepare('INSERT INTO quiz_attempts (employee_id, score, passed, answers_json, created_at) VALUES (?,?,?,?,?)');
  const insCheckin = db.prepare('INSERT OR IGNORE INTO checkins (employee_id, session_id, method, created_at) VALUES (?,?,?,?)');
  const insRetrain = db.prepare('INSERT INTO retraining (employee_id, reason, status, created_at, resolved_at) VALUES (?,?,?,?,?)');

  const mk = (score, answers) => [score, score >= 80 ? 1 : 0, JSON.stringify(answers), now()];
  const correctSet = new Set(questions.map((q,i)=>[q[6], i]));
  const ansForScore = (target) => {
    // 每题10分：按目标分做对对应数量
    const needCorrect = Math.round(target / 10);
    const answers = {};
    questions.forEach((q, i) => {
      answers[i + 1] = i < needCorrect ? q[6] : (q[6] === 'A' ? 'B' : 'A');
    });
    return answers;
  };

  // 1-5：全部完成（课程+通过测验+签到）
  [1,2,3,4,5].forEach(id => {
    completeAllLessons(id, now());
    insAttempt.run(id, ...mk(90, ansForScore(90)));
    insCheckin.run(id, 1, 'onsite', now());
  });

  // 6：测验未通过 → 复训（已签到、课程完成）
  completeAllLessons(6, now());
  insAttempt.run(6, ...mk(50, ansForScore(50)));
  insCheckin.run(6, 1, 'onsite', now());
  insRetrain.run(6, '线上测验未通过（50分，及格线80分）', 'open', now(), null);

  // 7：课程完成、测验通过、但未线下签到 → 复训
  completeAllLessons(7, now());
  insAttempt.run(7, ...mk(80, ansForScore(80)));
  insRetrain.run(7, '未完成线下演练签到', 'open', now(), null);

  // 8：课程完成，尚未测验、已签到
  completeAllLessons(8, now());
  insCheckin.run(8, 1, 'admin', now());

  // 9：只完成部分课程
  markLesson.run(9, 1, now());
  markLesson.run(9, 2, now());
  insCheckin.run(9, 1, 'onsite', now());

  // 10-16：未开始（保留为空白，便于演示）
}

createTables();
seed();

module.exports = db;
