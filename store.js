/**
 * 轻量 JSON 持久化存储（零外部依赖）
 * 集合：employees / admins / courses / questions / sessions
 *       learning / exams / attendance / retrain
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ---------------- 种子数据 ----------------
function seed() {
  const floors = [3, 5, 6, 7, 8];
  const departments = [
    { id: 'D01', name: '研发中心', leader: '王磊' },
    { id: 'D02', name: '市场营销部', leader: '李静' },
    { id: 'D03', name: '财务部', leader: '赵敏' },
    { id: 'D04', name: '人力资源部', leader: '陈刚' },
    { id: 'D05', name: '行政安保部', leader: '周强' }
  ];
  const positions = ['正式员工', '班组长', '部门主管', '新入职员工', '前台/值班'];

  // 员工：工号、姓名、部门、岗位、楼层
  const empRaw = [
    ['E001','张伟','D01','研发工程师','正式员工',5],
    ['E002','刘洋','D01','测试工程师','正式员工',5],
    ['E003','王磊','D01','技术总监','部门主管',5],
    ['E004','陈晨','D01','前端工程师','正式员工',5],
    ['E005','赵强','D01','运维工程师','班组长',6],
    ['E006','孙丽','D01','研发工程师','新入职员工',5],
    ['E007','周杰','D02','市场经理','部门主管',6],
    ['E008','吴敏','D02','市场专员','正式员工',6],
    ['E009','郑爽','D02','品牌专员','正式员工',6],
    ['E010','冯远','D02','渠道专员','正式员工',6],
    ['E011','褚红','D02','市场助理','新入职员工',6],
    ['E012','卫东','D03','会计','正式员工',3],
    ['E013','蒋琳','D03','出纳','正式员工',3],
    ['E014','沈括','D03','财务总监','部门主管',3],
    ['E015','韩雪','D03','税务会计','正式员工',3],
    ['E016','杨阳','D04','招聘主管','班组长',7],
    ['E017','朱珠','D04','HRBP','正式员工',7],
    ['E018','秦海','D04','培训专员','正式员工',7],
    ['E019','尤静','D04','人事助理','新入职员工',7],
    ['E020','许峰','D05','安保主管','部门主管',8],
    ['E021','何勇','D05','消防员','班组长',8],
    ['E022','吕布','D05','安保员','正式员工',8],
    ['E024','施然','D05','行政前台','前台/值班',3],
    ['E025','张涛','D01','架构师','正式员工',7],
    ['E026','孔敏','D02','活动策划','正式员工',7],
    ['E027','曹颖','D04','薪酬专员','正式员工',7],
    ['E028','严松','D05','安保员','正式员工',8],
    ['E029','华兰','D05','监控值班','前台/值班',8],
    ['E030','金鑫','D01','研发工程师','新入职员工',6],
    ['E023','罗飞','D05','安保员','正式员工',8]
  ];
  const employees = empRaw.map(([empNo, name, deptId, jobTitle, position, floor]) => ({
    id: empNo, empNo, name, deptId, jobTitle, position, floor,
    password: '123456', createdAt: '2026-01-10T09:00:00.000Z'
  }));

  const admins = [
    { id: 'A001', username: 'admin', password: 'admin123', name: '消防安全管理员', role: 'admin' },
    { id: 'A002', username: 'guard', password: 'guard123', name: '签到台值班员', role: 'guard' }
  ];

  // 课程
  const courses = [
    {
      id: 'C01', key: 'extinguisher', title: '灭火器使用',
      durationMin: 15,
      summary: '识别灭火器类型、掌握"提、拔、握、压"四步法，针对不同火情正确选择灭火器。',
      sections: [
        { heading: '一、灭火器类型与适用火情',
          body: '① 干粉灭火器（ABC/BC）：适用固体、液体、气体及带电设备初起火灾；\n② 二氧化碳灭火器：适用精密仪器、带电设备火灾，不适用室外大风环境；\n③ 水基型灭火器：适用固体/液体火灾，不可用于带电设备和油锅火灾。\n办公室常见为 4kg 手提式干粉灭火器，压力表红区=压力不足、绿区=正常、黄区=压力过高。' },
        { heading: '二、"提拔握压"四步法',
          body: '一提：提起灭火器，迅速赶到着火点；\n二拔：拔掉保险销；\n三握：一手握住喷管前端（二氧化碳型握喇叭筒防冻伤），另一手握紧压把；\n四压：距火源 2~3 米处，压下压把，左右扫射，对准火焰根部由近及远灭火。' },
        { heading: '三、注意事项',
          body: '① 站在上风方向，保持安全距离；\n② 电器火灾先断电，无法断电时严禁用水；\n③ 火势失控或有爆炸/中毒风险时立即撤离并报警，切勿贪恋财物；\n④ 使用后灭火器即使有剩余也须送修重新充装。' }
      ]
    },
    {
      id: 'C02', key: 'evacuation', title: '疏散路线',
      durationMin: 12,
      summary: '熟悉本楼层疏散通道与集合点，掌握低姿、防烟、有序撤离要点。',
      sections: [
        { heading: '一、疏散前准备',
          body: '① 入职/换岗时确认所在楼层安全出口、疏散楼梯位置，牢记两条不同方向的逃生路线；\n② 留意地面蓄光疏散指示标识、墙面安全出口灯；\n③ 严禁占用、锁闭疏散通道和安全出口，严禁在楼梯间堆放杂物。' },
        { heading: '二、疏散动作要领',
          body: '① 听到警报或广播后立即停止工作，沿最近安全出口快速有序撤离，不乘电梯；\n② 用湿毛巾/衣袖捂住口鼻，弯腰低姿或匍匐前进（烟气上浮，近地面空气较清新）；\n③ 关门隔烟：经过的防火门随手关闭，阻止烟火蔓延；\n④ 不折返、不拥挤、不推搡，照顾身边受伤及行动不便同事。' },
        { heading: '三、集合与清点',
          body: '① 按楼层疏散至指定集合点（大厦东侧停车场 A 区）；\n② 各班组长/部门主管清点人数，向现场指挥员报告；\n③ 未经许可不得返回大楼；被困时退回有窗房间、堵门缝、挥舞鲜艳衣物呼救并拨打 119。' }
      ]
    },
    {
      id: 'C03', key: 'alarm', title: '报警流程',
      durationMin: 10,
      summary: '掌握内部报警与 119 报警要素，会使用手动报警按钮和灭火器材初期处置。',
      sections: [
        { heading: '一、发现火情先做什么',
          body: '① 大声呼喊"着火了"警示周边人员；\n② 按下走廊墙壁上的手动火灾报警按钮（击碎玻璃/按下压板），消防控制室同步收到信号；\n③ 火情初起（约废纸篓大小）时在确保安全前提下取用灭火器扑救；火势扩大立即撤离。' },
        { heading: '二、拨打 119 五要素',
          body: '① 详细地址：XX市XX区XX路XX号XX大厦X层；\n② 起火物：电器/纸张/油类等；\n③ 火势大小、有无人员被困；\n④ 报警人姓名及联系电话；\n⑤ 安排人员到路口/大门口引导消防车。\n报警后保持电话畅通，配合消防部门询问。' },
        { heading: '三、内部上报链',
          body: '第一发现人 → 部门负责人 / 当班安保 → 消防控制室（内线 8119）→ 启动应急广播 → 全员疏散。\n严禁谎报、瞒报火警，严禁在未确认安全情况下擅自断电、破拆。' }
      ]
    }
  ];

  // 题库：按课程分类，单选
  const questions = [
    // C01 灭火器
    { id: 'Q01', courseId: 'C01', type: 'single', stem: '办公室常用的 4kg 手提式干粉灭火器，压力表指针指向哪个区域表示压力正常？',
      options: ['红色区域', '绿色区域', '黄色区域', '任何区域都可以'], answer: 1, analysis: '绿区为正常压力区间；红区压力不足需检修充装，黄区为超压。' },
    { id: 'Q02', courseId: 'C01', type: 'single', stem: '使用手提式灭火器的正确四步顺序是？',
      options: ['拔销—提起—压把—握管', '提起—拔销—握管—压把', '握管—压把—提起—拔销', '压把—提起—拔销—握管'], answer: 1, analysis: '口诀"提、拔、握、压"。' },
    { id: 'Q03', courseId: 'C01', type: 'single', stem: '扑救带电电气设备火灾，在无法断电时应选用？',
      options: ['清水', '泡沫灭火器', '二氧化碳或干粉灭火器', '湿棉被覆盖'], answer: 2, analysis: '二氧化碳/干粉不导电；水和泡沫有触电危险。' },
    { id: 'Q04', courseId: 'C01', type: 'single', stem: '灭火时喷射应对准火焰的哪个部位？',
      options: ['火焰顶部', '火焰中部', '火焰根部', '周围空气'], answer: 2, analysis: '对准根部才能切断燃烧源，并左右扫射由近及远。' },
    { id: 'Q05', courseId: 'C01', type: 'single', stem: '室外使用灭火器灭火时，人应站在什么位置？',
      options: ['下风方向', '上风方向', '正对火焰中心', '任意位置'], answer: 1, analysis: '站在上风方向可避免烟气和干粉被吹向自己。' },
    // C02 疏散
    { id: 'Q06', courseId: 'C02', type: 'single', stem: '火灾疏散时，能否乘坐普通电梯下楼？',
      options: ['可以，电梯最快', '不可以，应走疏散楼梯', '人少时可以', '停电时才不能用'], answer: 1, analysis: '火灾可能断电致电梯困人，且电梯井有烟囱效应，必须走楼梯。' },
    { id: 'Q07', courseId: 'C02', type: 'single', stem: '穿过浓烟区域疏散时，正确的做法是？',
      options: ['直立奔跑快速通过', '用湿毛巾捂住口鼻、弯腰低姿前行', '屏住呼吸原地等待', '乘电梯下楼'], answer: 1, analysis: '烟气上浮，近地面空气较清洁；湿毛巾可过滤部分烟尘。' },
    { id: 'Q08', courseId: 'C02', type: 'single', stem: '疏散经过防火门时应当？',
      options: ['保持敞开方便他人', '随手关闭以阻隔烟火蔓延', '用杂物顶住', '拆掉门吸固定'], answer: 1, analysis: '关闭防火门可形成防火防烟分区，延缓烟火蔓延。' },
    { id: 'Q09', courseId: 'C02', type: 'single', stem: '到达集合点后，第一件重要的事情是？',
      options: ['立即回家', '排队领水休息', '由班组长/主管清点人数并上报', '自行返回拿物品'], answer: 2, analysis: '清点人数用于确认无人被困，指导救援决策。' },
    { id: 'Q10', courseId: 'C02', type: 'single', stem: '如果所有逃生通道都被大火封堵，正确做法是？',
      options: ['直接从窗户跳下', '退回有窗房间，用湿物堵门缝、挥舞鲜艳物品呼救并拨打119', '躲进电梯', '向楼顶奔跑并大声呼救'], answer: 1,
      analysis: '退回安全房间、封堵门缝、窗口呼救等待救援是正确求生方法。' },
    // C03 报警
    { id: 'Q11', courseId: 'C03', type: 'single', stem: '发现初起火情的第一反应应当是？',
      options: ['先拍照发群里', '大声呼喊警示周围人员并按下手动报警按钮', '自己先跑', '等领导决定'], answer: 1, analysis: '报警与警示优先，为疏散和扑救争取时间。' },
    { id: 'Q12', courseId: 'C03', type: 'single', stem: '拨打 119 报警时，以下哪项不是必须说明的要素？',
      options: ['详细地址和起火楼层', '起火物质和火势', '被困人员情况', '公司去年的营业额'], answer: 3, analysis: '五要素：地址、起火物、火势/被困、报警人信息、派人引导。' },
    { id: 'Q13', courseId: 'C03', type: 'single', stem: '本楼消防控制室的内线报警电话是？',
      options: ['8119', '110', '120', '10086'], answer: 0, analysis: '消防控制室内线 8119（谐音119）。' },
    { id: 'Q14', courseId: 'C03', type: 'single', stem: '关于初起火灾扑救，下列说法正确的是？',
      options: ['任何火灾都必须先灭火', '废纸篓大小的初起火可在确保安全时用灭火器扑救，火势扩大立即撤离', '先抢救贵重财物', '回办公室关电脑'], answer: 1, analysis: '初起火可快速处置，火势失控须立即逃生报警。' },
    { id: 'Q15', courseId: 'C03', type: 'single', stem: '报警后，安排人员到大厦门口/路口的主要目的是？',
      options: ['维持交通罚款', '引导消防车快速到达起火位置', '接受媒体采访', '登记疏散人数'], answer: 1, analysis: '引导消防车可显著缩短到场和展开时间。' }
  ];

  // 演练批次
  const sessions = [
    { id: 'S01', name: '2026年上半年综合消防演练', drillDate: '2026-06-18', drillTime: '15:00', location: '大厦东侧集合点（停车场A区）',
      floors: [3,5,6], passScore: 80, status: 'closed', remark: '覆盖3/5/6层，已完成补训闭环。' },
    { id: 'S02', name: '2026年三季度高层疏散演练', drillDate: '2026-09-25', drillTime: '10:30', location: '大厦东侧集合点（停车场A区）',
      floors: [7,8], passScore: 80, status: 'ongoing', remark: '覆盖7/8层；线下演练已结束，签到与测验收尾中。' },
    { id: 'S03', name: '2026年三季度补训专场', drillDate: '2026-10-15', drillTime: '16:00', location: '8层多功能厅+东侧集合点',
      floors: [3,5,6,7,8], passScore: 80, status: 'planned', remark: '面向未通过/缺训人员的复训补考补签到。' }
  ];

  // 员工-批次分配
  const sessionEmployees = [];
  const empById = Object.fromEntries(empRaw.map(e => [e[0], e]));
  for (const s of sessions) {
    for (const e of empRaw) {
      if (s.floors.includes(e[5])) sessionEmployees.push({ sessionId: s.id, empId: e[0] });
    }
  }

  return { floors, departments, positions, employees, admins, courses, questions, sessions, sessionEmployees,
    learning: [], exams: [], attendance: [], retrain: [] };
}

// ---------------- 存储核心 ----------------
let db = null;
let saveTimer = null;

function init(reset = false) {
  ensureDataDir();
  if (!reset && fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      return;
    } catch (e) {
      console.error('数据库文件损坏，重新初始化:', e.message);
    }
  }
  db = seed();
  buildHistory(db);
  flush();
}

function flush() {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// 防抖写盘
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}

function get() { return db; }

function resetAll() { db = seed(); buildHistory(db); flush(); return db; }

// 简易可复现伪随机
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成历史记录（S01 已闭环、S02 进行中、S03 待开始）
 * learning: {id, sessionId, empId, courseId, completedAt}
 * exams:    {id, sessionId, empId, attempt, questionIds:[], answers:[], score, passed, submittedAt}
 * attendance:{id, sessionId, empId, status:'present'|'absent', checkedInAt, method, by}
 * retrain:  {id, empId, sourceSessionId, reasons:[], status:'pending'|'resolved', createdAt, resolvedAt, resolveType, resolveSessionId}
 */
function buildHistory(d) {
  const rnd = mulberry32(20260929);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const courseIds = d.courses.map(c => c.id);

  let lrnSeq = 1, exSeq = 1, atSeq = 1, rtSeq = 1;
  const L = () => 'L' + String(lrnSeq++).padStart(4, '0');
  const X = () => 'X' + String(exSeq++).padStart(4, '0');
  const A = () => 'A' + String(atSeq++).padStart(4, '0');
  const R = () => 'R' + String(rtSeq++).padStart(4, '0');

  function genExam(sessionId, empId, attempt, passBias) {
    // 每门课随机抽题，组卷 10 题（5/3/2 分布 → 这里从题库各课分别随机，总数10）
    const byCourse = {};
    d.questions.forEach(q => { (byCourse[q.courseId] = byCourse[q.courseId] || []).push(q); });
    const draw = (cid, n) => {
      const pool = [...byCourse[cid]];
      const out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      return out;
    };
    const paper = [...draw('C01', 4), ...draw('C02', 3), ...draw('C03', 3)];
    const baseCorrect = passBias
      ? Math.min(10, Math.floor(8 + rnd() * 3))   // 8~10 对（80~100分，通过）
      : Math.max(2, Math.floor(3 + rnd() * 5));    // 3~7 对（30~70分，不过）
    let correctIdx = new Set();
    while (correctIdx.size < baseCorrect) correctIdx.add(Math.floor(rnd() * 10));
    const passScore = d.sessions.find(s => s.id === sessionId).passScore;
    const answers = paper.map((q, i) =>
      correctIdx.has(i) ? q.answer : (q.answer + 1 + Math.floor(rnd() * 3)) % 4);
    const score = Math.round((correctIdx.size / paper.length) * 100);
    return {
      id: X(), sessionId, empId, attempt,
      questionIds: paper.map(q => q.id), answers, score,
      passed: score >= passScore,
      submittedAt: attempt === 1 ? '2026-06-16T10:00:00.000Z' : '2026-06-22T10:00:00.000Z'
    };
  }

  // ---------- S01（3/5/6层，已闭环） ----------
  const s01Emps = d.sessionEmployees.filter(x => x.sessionId === 'S01').map(x => d.employees.find(e => e.id === x.empId));
  // 预设：E009、E012 首考不过且缺训 → 复训后解决；其余首轮通过
  const specialFail = new Set(['E009', 'E012']);
  for (const emp of s01Emps) {
    // 学习记录
    courseIds.forEach((cid, i) => d.learning.push({
      id: L(), sessionId: 'S01', empId: emp.id, courseId: cid,
      completedAt: `2026-06-1${5 + Math.floor(rnd() * 2)}T0${8 + i}:3${i}:00.000Z`
    }));
    if (specialFail.has(emp.id)) {
      d.exams.push(genExam('S01', emp.id, 1, false));
      d.attendance.push({ id: A(), sessionId: 'S01', empId: emp.id, status: 'absent', checkedInAt: null, method: null, by: null });
      d.retrain.push({
        id: R(), empId: emp.id, sourceSessionId: 'S01',
        reasons: ['exam_fail', 'drill_absent'], status: 'resolved',
        createdAt: '2026-06-18T08:00:00.000Z', resolvedAt: '2026-06-23T09:00:00.000Z',
        resolveType: 'retake_and_makeup', resolveSessionId: 'S01'
      });
      // 复训动作：重新学习 + 补考通过 + 补签到
      courseIds.forEach(cid => d.learning.push({
        id: L(), sessionId: 'S01', empId: emp.id, courseId: cid, completedAt: '2026-06-22T09:00:00.000Z', retake: true
      }));
      d.exams.push(genExam('S01', emp.id, 2, true));
      d.attendance.push({ id: A(), sessionId: 'S01', empId: emp.id, status: 'present', checkedInAt: '2026-06-23T08:55:00.000Z', method: 'onsite', by: 'A002', makeup: true });
    } else {
      d.exams.push(genExam('S01', emp.id, 1, true));
      d.attendance.push({ id: A(), sessionId: 'S01', empId: emp.id, status: 'present', checkedInAt: '2026-06-18T06:50:00.000Z', method: 'onsite', by: 'A002' });
    }
  }

  // ---------- S02（7/8层，进行中）：部分学习中/未考/已考不过/缺签到 ----------
  const s02Emps = d.sessionEmployees.filter(x => x.sessionId === 'S02').map(x => d.employees.find(e => e.id === x.empId));
  // 状态脚本：
  //  E016 全完成且通过且签到（完成态）
  //  E017 学完、考试 70 分未过、已签到 → 复训（待复训）
  //  E018 学完2门、未考、已签到
  //  E019 学完1门、未考、未签到（新员工，未启动完全）
  //  E020 全完成、通过、签到
  //  E021 全完成、通过、未签到（漏签）
  //  E023 全完成、60分、未签到 → 复训（双原因）
  //  E025 全完成、通过、签到
  //  E026 学完、通过、签到
  //  E027 未学、未考、未签到
  //  E028 全完成、90分、签到
  //  E029 全完成、通过、签到
  const script = {
    E016: { learn: 3, exam: true, pass: true, attend: true },
    E017: { learn: 3, exam: true, pass: false, score: 70, attend: true },
    E018: { learn: 2, exam: false, attend: true },
    E019: { learn: 1, exam: false, attend: false },
    E020: { learn: 3, exam: true, pass: true, attend: true },
    E021: { learn: 3, exam: true, pass: true, attend: false },
    E023: { learn: 3, exam: true, pass: false, score: 60, attend: false },
    E025: { learn: 3, exam: true, pass: true, attend: true },
    E026: { learn: 3, exam: true, pass: true, attend: true },
    E027: { learn: 0, exam: false, attend: false },
    E028: { learn: 3, exam: true, pass: true, attend: true },
    E029: { learn: 3, exam: true, pass: true, attend: true },
    E024: { learn: 3, exam: true, pass: true, attend: true }
  };
  for (const emp of s02Emps) {
    const sc = script[emp.id] || { learn: 3, exam: true, pass: true, attend: true };
    for (let i = 0; i < sc.learn; i++) {
      d.learning.push({ id: L(), sessionId: 'S02', empId: emp.id, courseId: courseIds[i], completedAt: `2026-09-2${2 + (i % 4)}T0${2 + i}:00:00.000Z` });
    }
    if (sc.exam) {
      const ex = genExam('S02', emp.id, 1, sc.pass);
      if (sc.score != null) {
        ex.score = sc.score;
        ex.passed = sc.score >= 80;
        // 让对错数量与分数一致
        const wantCorrect = sc.score / 10;
        const ans = [...ex.answers];
        let cur = 0;
        ans.forEach((a, i) => { if (a === d.questions.find(q => q.id === ex.questionIds[i]).answer) cur++; });
        // 直接重排 answers 使正确数=wantCorrect
        const qs = ex.questionIds.map(qid => d.questions.find(q => q.id === qid));
        const correctSet = new Set();
        while (correctSet.size < wantCorrect) correctSet.add(Math.floor(rnd() * 10));
        ex.answers = qs.map((q, i) => correctSet.has(i) ? q.answer : (q.answer + 1 + Math.floor(rnd() * 3)) % 4);
      }
      ex.submittedAt = '2026-09-24T03:30:00.000Z';
      d.exams.push(ex);
    }
    if (sc.attend) {
      d.attendance.push({ id: A(), sessionId: 'S02', empId: emp.id, status: 'present', checkedInAt: '2026-09-25T02:25:00.000Z', method: 'onsite', by: 'A002' });
    }
  }
  // S02 复训名单由 API 动态计算（基于当前考试/签到），同时落库两条以演示"自动进入"
  for (const [empId, reasons] of [['E017', ['exam_fail']], ['E023', ['exam_fail', 'drill_absent']]]) {
    d.retrain.push({
      id: R(), empId, sourceSessionId: 'S02', reasons, status: 'pending',
      createdAt: '2026-09-25T03:00:00.000Z', resolvedAt: null, resolveType: null, resolveSessionId: null
    });
  }
  // S03 无任何记录（待开始）
}

module.exports = { init, save, flush, get, resetAll };
