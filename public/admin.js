let META = null, DATA = null, TAB = 'employees';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m, ok=true){const t=$('toast');t.textContent=m;t.className='toast show '+(ok?'ok':'err');setTimeout(()=>t.className='toast',2400);}

async function init(){
  META = await (await fetch('/api/meta')).json();
  for (const [sel, list] of [['fFloor',META.floors],['fDept',META.departments],['fPos',META.positions]]) {
    $(sel).innerHTML += list.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  }
  await load();
}
async function load(){
  const q = new URLSearchParams();
  const f=$('fFloor').value, d=$('fDept').value, p=$('fPos').value;
  if(f)q.set('floor_id',f); if(d)q.set('department_id',d); if(p)q.set('position_id',p);
  DATA = await (await fetch('/api/admin/overview?'+q.toString())).json();
  $('sessionTitle').textContent = DATA.session.name + '（' + DATA.session.drill_date + '）· 完成情况';
  renderKpis(); renderTab();
  const rt = await (await fetch('/api/admin/retraining')).json();
  $('rtCount').textContent = rt.list.length;
}
function applyFilter(){ load(); }
function resetFilter(){ $('fFloor').value='';$('fDept').value='';$('fPos').value=''; load(); }
function switchTab(t){ TAB=t; document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t)); renderTab(); }

function renderKpis(){
  const s = DATA.summary;
  const rate = s.total ? Math.round(s.completed/s.total*100) : 0;
  const kpis = [
    ['blue','应参加人数', s.total],
    ['green','已全部完成', `${s.completed}（${rate}%）`],
    ['','学习完成（3门）', s.lessons_done_all],
    ['','测验通过', s.quiz_passed],
    ['','现场已签到', s.checked_in],
    ['amber','进行中', s.in_progress],
    ['','未开始', s.not_started],
    ['red','复训名单', s.retraining],
  ];
  $('kpis').innerHTML = kpis.map(([cls,lbl,num]) =>
    `<div class="kpi ${cls}"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`).join('');
}

const statusBadge = st => ({
  completed:'<span class="badge green">已完成</span>',
  in_progress:'<span class="badge amber">进行中</span>',
  not_started:'<span class="badge gray">未开始</span>',
}[st]);
const quizBadge = q => ({
  passed:'<span class="badge green">通过</span>',
  failed:'<span class="badge red">未通过</span>',
  not_taken:'<span class="badge gray">未测验</span>',
}[q]);

function renderTab(){
  if(TAB==='employees') renderEmployees();
  else if(TAB==='retraining') renderRetraining();
  else renderGroups({floor:'by_floor',department:'by_department',position:'by_position'}[TAB]);
}

function renderEmployees(){
  const rows = DATA.employees.map(x => `
    <tr>
      <td>${esc(x.emp_no)}</td>
      <td>${esc(x.name)}</td>
      <td>${esc(x.floor_name)}</td>
      <td>${esc(x.department_name)}</td>
      <td>${esc(x.position_name)}</td>
      <td>${x.lessons_completed?'<span class="badge green">3/3</span>':`<span class="badge gray">${x.lessons_done}/3</span>`}</td>
      <td>${quizBadge(x.quiz_state)}${x.last_score!=null?` <span class="muted">${x.last_score}分</span>`:''}</td>
      <td>${x.checked_in?'<span class="badge green">已签到</span>':'<span class="badge gray">未签到</span>'}</td>
      <td>${statusBadge(x.status)}</td>
      <td>${x.retraining?'<span class="badge red">复训中</span>':'—'}</td>
      <td>${x.checked_in?'':`<button class="sm ghost" onclick="adminCheckin(${x.id})">代签到</button>`}</td>
    </tr>`).join('');
  $('tabContent').innerHTML = `
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>工号</th><th>姓名</th><th>楼层</th><th>部门</th><th>岗位</th>
          <th>课程学习</th><th>线上测验</th><th>线下签到</th><th>整体状态</th><th>复训</th><th>操作</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderGroups(key){
  const list = DATA[key];
  $('tabContent').innerHTML = `
    <div class="table-scroll">
      <table>
        <thead><tr><th style="min-width:180px">名称</th><th>应参加</th><th>完成</th><th>完成率</th><th>测验通过</th><th>已签到</th><th>复训</th></tr></thead>
        <tbody>
          ${list.map(g => `
            <tr>
              <td><b>${esc(g.name)}</b></td>
              <td>${g.total}</td>
              <td>${g.completed}</td>
              <td style="min-width:180px">
                <div class="row">
                  <div class="progress-bar" style="flex:1"><span style="width:${g.rate}%;background:${g.rate>=80?'var(--green)':g.rate>=50?'var(--amber)':'var(--red)'}"></span></div>
                  <b>${g.rate}%</b>
                </div>
              </td>
              <td>${g.quiz_passed}</td>
              <td>${g.checked_in}</td>
              <td>${g.retraining?`<span class="badge red">${g.retraining}</span>`:0}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function renderRetraining(){
  const d = await (await fetch('/api/admin/retraining')).json();
  if(!d.list.length){
    $('tabContent').innerHTML = '<div class="center muted" style="padding:40px">🎉 当前没有需要复训的人员</div>';
    return;
  }
  $('tabContent').innerHTML = `
    <div class="notice">复训名单由系统自动生成：线上测验不满80分，或已通过测验但未完成现场签到的员工。补考/补签到通过后自动销项，安全员也可核实后手动关闭。</div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>工号</th><th>姓名</th><th>楼层</th><th>部门</th><th>岗位</th><th>复训原因</th><th>进入时间</th><th>操作</th></tr></thead>
        <tbody>
          ${d.list.map(r => `
            <tr>
              <td>${esc(r.emp_no)}</td><td>${esc(r.name)}</td>
              <td>${esc(r.floor_name)}</td><td>${esc(r.department_name)}</td><td>${esc(r.position_name)}</td>
              <td>${esc(r.reason)}</td><td class="muted">${new Date(r.created_at).toLocaleString('zh-CN')}</td>
              <td><button class="sm green" onclick="resolveRt(${r.id})">核实已完成 · 销项</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function adminCheckin(id){
  const r = await fetch(`/api/admin/employees/${id}/checkin`,{method:'POST'});
  const d = await r.json();
  if(!r.ok) return toast(d.error||'操作失败',false);
  toast('现场代签到成功');
  load();
}
async function resolveRt(id){
  const r = await fetch(`/api/admin/retraining/${id}/resolve`,{method:'POST'});
  if(!r.ok) return toast('操作失败',false);
  toast('复训记录已销项');
  load();
}

function exportCSV(){
  const header = ['工号','姓名','楼层','部门','岗位','课程完成数','测验状态','最近分数','签到','整体状态','复训'];
  const lines = DATA.employees.map(x => [
    x.emp_no,x.name,x.floor_name,x.department_name,x.position_name,
    x.lessons_done+'/3',
    {passed:'通过',failed:'未通过',not_taken:'未测验'}[x.quiz_state],
    x.last_score??'', x.checked_in?'已签到':'未签到',
    {completed:'已完成',in_progress:'进行中',not_started:'未开始'}[x.status],
    x.retraining?'复训中':''
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  const csv = '﻿' + [header.join(','), ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = '消防演练完成情况.csv';
  a.click();
}

init();
