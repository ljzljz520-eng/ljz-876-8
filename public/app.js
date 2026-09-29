const PASS = 80;
let STATE = { emp: null, status: null, session: null, questions: [], detail: null };

const $ = id => document.getElementById(id);
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || '请求失败');
  return data;
};
const toast = (msg, ok = true) => {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast show ' + (ok ? 'ok' : 'err');
  setTimeout(() => t.className = 'toast', 2400);
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function login() {
  const no = $('empNo').value.trim();
  if (!no) return toast('请输入工号', false);
  try {
    const d = await api(`/api/employee/lookup/${encodeURIComponent(no)}`);
    STATE.emp = d.employee; STATE.status = d.status; STATE.session = d.session;
    sessionStorage.setItem('empId', d.employee.id);
    $('loginCard').style.display = 'none';
    $('app').style.display = 'block';
    await renderApp();
  } catch (e) { toast(e.message, false); }
}
function logout() {
  sessionStorage.removeItem('empId');
  location.reload();
}
async function autoLogin() {
  const id = sessionStorage.getItem('empId');
  if (!id) return;
  try {
    const d = await api(`/api/employee/${id}`);
    STATE.emp = d.employee; STATE.status = d.status; STATE.session = d.session;
    $('loginCard').style.display = 'none';
    $('app').style.display = 'block';
    await renderApp();
  } catch (e) { sessionStorage.removeItem('empId'); }
}

async function refreshStatus() {
  const d = await api(`/api/employee/${STATE.emp.id}`);
  STATE.status = d.status; STATE.session = d.session;
}

async function completeLesson(lid) {
  await api(`/api/employee/${STATE.emp.id}/lessons/${lid}/complete`, { method: 'POST' });
  toast('已记录学习完成 ✓');
  await renderApp();
}

async function loadQuestions() {
  const d = await api(`/api/employee/${STATE.emp.id}/questions`);
  STATE.questions = d.questions;
}

async function openQuiz() {
  try {
    await loadQuestions();
    renderQuiz();
    $('quizCard').style.display = 'block';
    $('resultCard').style.display = 'none';
    $('quizCard').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { toast(e.message, false); }
}

function renderQuiz() {
  const titles = { extinguisher: '【灭火器使用】', evacuation: '【疏散路线】', alarm: '【报警流程】' };
  $('questionsBox').innerHTML = STATE.questions.map((q, i) => `
    <div class="q">
      <div class="qt">${i + 1}. ${titles[q.lesson_code] || ''}${esc(q.content)}</div>
      ${['A','B','C','D'].map(k => `
        <label class="opt"><input type="radio" name="q${q.id}" value="${k}">${k}. ${esc(q['option_' + k.toLowerCase()])}</label>
      `).join('')}
    </div>`).join('');
}

async function submitQuiz() {
  const answers = {};
  let unanswered = 0;
  for (const q of STATE.questions) {
    const picked = document.querySelector(`input[name="q${q.id}"]:checked`);
    if (!picked) unanswered++;
    else answers[q.id] = picked.value;
  }
  if (unanswered > 0) return toast(`还有 ${unanswered} 题未作答`, false);
  $('submitQuizBtn').disabled = true;
  try {
    const d = await api(`/api/employee/${STATE.emp.id}/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    STATE.status = d.status;
    renderResult(d);
  } catch (e) { toast(e.message, false); }
  $('submitQuizBtn').disabled = false;
}

function renderResult(d) {
  $('quizCard').style.display = 'none';
  $('resultCard').style.display = 'block';
  $('scoreNum').textContent = d.score;
  $('scoreNum').style.color = d.passed ? 'var(--green)' : 'var(--red)';
  $('scoreTag').innerHTML = d.passed
    ? '<span class="badge green">测验通过</span>'
    : '<span class="badge red">未通过 · 已进入复训名单</span>';
  $('attemptsNum').textContent = d.status.attempts;
  $('resultMsg').innerHTML = d.passed
    ? `恭喜您通过线上测验！请按通知参加并完成<b>第③步：线下应急疏散演练现场签到</b>（可直接在<a href="/checkin.html">现场签到页</a>输入工号与签到码）。`
    : `很遗憾未达到及格线（${d.pass_score}分）。系统已自动将您加入<b>复训名单</b>。请重新学习未掌握的内容后点击"重新学习后补考"。`;
  $('detailBox').innerHTML = d.detail.map((item, i) => {
    const q = STATE.questions.find(x => x.id === item.question_id);
    return `
    <div class="q">
      <div class="qt">${i + 1}. ${esc(q.content)}
        ${item.correct ? '<span class="badge green">正确</span>' : '<span class="badge red">错误</span>'}</div>
      ${['A','B','C','D'].map(k => {
        let cls = 'opt';
        if (k === item.answer) cls += ' correct';
        else if (k === item.chosen && !item.correct) cls += ' wrong';
        return `<div class="${cls}">${k}. ${esc(q['option_' + k.toLowerCase()])}
          ${k === item.answer ? '✔ 正确答案' : ''}${k === item.chosen && !item.correct ? '✘ 你的选择' : ''}</div>`;
      }).join('')}
    </div>`;
  }).join('');
  $('resultCard').scrollIntoView({ behavior: 'smooth' });
  renderSteps();
}

async function renderApp() {
  if (!STATE.emp) return;
  $('welcome').textContent = `👋 你好，${STATE.emp.name}`;
  $('orgInfo').textContent = `${STATE.emp.floor_name} · ${STATE.emp.department_name} · ${STATE.emp.position_name}（工号 ${STATE.emp.emp_no}）`;

  const { lessons } = await api(`/api/employee/${STATE.emp.id}/lessons`);
  const done = lessons.filter(l => l.completed_at).length;
  $('lessonsBox').innerHTML = lessons.map(l => `
    <details class="lesson" ${l.completed_at ? '' : 'open'}>
      <summary>
        <span>${titleIcon(l)} ${esc(l.title)}</span>
        ${l.completed_at
          ? '<span class="tag badge green">已完成 ✓</span>'
          : '<span class="tag badge gray">未学习</span>'}
      </summary>
      <div class="body">${esc(l.content)}</div>
      <div class="foot">
        ${l.completed_at
          ? '<button class="ghost sm" onclick="completeLesson(' + l.id + ')">重新学习并再次确认</button>'
          : '<button class="sm" onclick="completeLesson(' + l.id + ')">我已学完，标记完成</button>'}
      </div>
    </details>`).join('');
  $('lessonHint').textContent = `学习进度：${done}/${lessons.length}，三门课程全部完成后解锁测验`;
  $('startQuizBtn').disabled = done < lessons.length;
  $('startQuizBtn').textContent = done < lessons.length
    ? `完成全部课程解锁测验（${done}/${lessons.length}）`
    : (STATE.status.quiz_state === 'passed' ? '已通过 · 查看/重考测验 →' : '第②步 开始线上测验 →');

  renderSteps();
  renderRetrainBanner();
  renderCheckinGuide();
}
const titleIcon = l => ({ extinguisher: '🧯', evacuation: '🚪', alarm: '📞' }[l.code] || '📄');

function renderSteps() {
  const st = STATE.status;
  const set = (id, done) => $(id).classList.toggle('done', done);
  set('step1', st.lessons_completed);
  set('step2', st.quiz_state === 'passed');
  set('step3', st.checked_in);
  set('step4', st.status === 'completed');
}

function renderRetrainBanner() {
  const r = STATE.status.retraining;
  if (!r) { $('retrainBanner').style.display = 'none'; return; }
  $('retrainBanner').style.display = 'block';
  $('retrainBanner').innerHTML = `⚠️ <b>复训提醒：</b>${esc(r.reason)}。请按提示完成补考或补签到，完成后将自动移出复训名单。`;
}

function renderCheckinGuide() {
  const st = STATE.status;
  if (st.checked_in) {
    $('checkinGuide').innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><span class="badge green">已完成现场签到 ✓</span>
        <span class="muted" style="margin-left:8px">${new Date(st.checkin_at).toLocaleString('zh-CN')}</span></div>
        ${st.status === 'completed'
          ? '<span class="badge blue">🎉 全部环节完成，感谢参与本次消防演练！</span>'
          : '<span class="muted">完成剩余环节即为演练达标</span>'}
      </div>`;
  } else {
    $('checkinGuide').innerHTML = `
      <p class="muted" style="margin-bottom:10px">参加「${esc(STATE.session.name)}」（${STATE.session.drill_date}），
      到达集合点后，在现场扫码或前往 <a href="/checkin.html">现场签到页</a>，输入工号和安全员公布的<b>签到码</b>完成签到。</p>
      <div class="row"><a href="/checkin.html"><button class="green sm">前往签到</button></a></div>`;
  }
}

autoLogin();
