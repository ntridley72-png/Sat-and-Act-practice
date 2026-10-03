/* Three complete practice layouts share the same questions, tools, and saved progress. */
(() => {
  const themes = ['exam', 'notebook', 'focus'];
  const labels = {exam:'Exam workspace', notebook:'Study notebook', focus:'Focus studio'};
  const icons = {
    calc:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2"/>',
    highlight:'<path d="m5 15 9-11 5 4-9 11-5-4ZM3 21h12"/>',
    reader:'<path d="M4 5h16M4 10h12M4 15h16M4 20h12"/>',
    notes:'<path d="M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h7"/>'
  };
  const icon = (name) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">'+icons[name]+'</svg>';
  let theme = 'exam';
  try { const saved = localStorage.getItem('funsatWorkspaceTheme'); if (themes.includes(saved)) theme = saved; } catch(e) {}
  let activeTab = 'tutor', lastQuestion = '', lastAnswer = null;
  const toolbar = $('toolsBar');
  const toolsHome = document.createElement('div'); toolsHome.className='workspace-tools-home';
  toolbar.before(toolsHome);
  const tools = [['btnCalc','calc','Calculator'],['btnHl','highlight','Highlight'],['btnLine','reader','Line reader']];
  tools.forEach(([id,i,label]) => { $(id).innerHTML=icon(i)+'<span>'+label+'</span>'; });
  const notesButton = document.createElement('button'); notesButton.type='button'; notesButton.id='btnNotes'; notesButton.className='tool-btn';
  notesButton.innerHTML=icon('notes')+'<span>Notes</span>'; notesButton.onclick=()=>selectLearningTab('notes'); toolbar.append(notesButton);
  const select = document.createElement('select'); select.id='workspaceTheme'; select.setAttribute('aria-label','Workspace layout');
  themes.forEach((t)=>{const option=document.createElement('option');option.value=t;option.textContent=labels[t];select.append(option);}); select.value=theme;
  const themeLabel=document.createElement('label');themeLabel.className='workspace-theme-label';themeLabel.innerHTML='<span>Layout</span>';themeLabel.append(select);
  document.querySelector('.topbar').append(themeLabel);
  document.querySelector('.brand').innerHTML='Fun<span class="brand-sat">SAT</span>';
  const applyTheme=()=>{document.body.dataset.workspace=theme;document.documentElement.style.colorScheme=theme==='focus'?'dark':'light';};
  select.onchange=()=>{theme=select.value;applyTheme();try{localStorage.setItem('funsatWorkspaceTheme',theme);}catch(e){}if(state.view==='test')renderQuestion();};
  applyTheme();
  function selectLearningTab(name) {
    activeTab=name;
    document.querySelectorAll('.learning-tab').forEach((button)=>{const on=button.dataset.tab===name;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});
    document.querySelectorAll('.learning-section').forEach((section)=>{section.hidden=section.dataset.section!==name;});
    if(name==='notes') $('workspaceNotes')?.focus();
  }
  function tabPanel(name, label) {
    const panel=document.createElement('section');panel.className='learning-section';panel.dataset.section=name;panel.id='learning-'+name;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-label',label);return panel;
  }
  function equationCandidates(text) {
    const seen=new Set(), found=[];
    const source=String(text||'');
    const equation=/((?:[a-z]\([a-z]\)|(?:\d+(?:\.\d+)?)?[a-z](?:[⁰¹²³⁴⁵⁶⁷⁸⁹^]\d*)?(?:\s*[+−–-]\s*(?:\d+(?:\.\d+)?)?[a-z](?:[⁰¹²³⁴⁵⁶⁷⁸⁹^]\d*)?)*))\s*(=|≤|≥|<|>)\s*([^,;.?\n]+)/gi;
    for(const match of source.matchAll(equation)){const value=plainEquation(match[1]+' '+match[2]+' '+match[3]);if(value&&!seen.has(value)){seen.add(value);found.push(value);}}
    source.split('\n').map((line)=>line.trim()).filter((line)=>line.length<=90&&!/[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(line)&&/(?:√|π|\^|[⁰¹²³⁴⁵⁶⁷⁸⁹])/.test(line)).forEach((line)=>{const value=plainEquation(line);if(value&&!seen.has(value)){seen.add(value);found.push(value);}});
    return found.slice(0,4);
  }
  function addEquationCopies(q, body, detailed) {
    const equations=equationCandidates(q.q);
    const explanationEquations=state.answers[q.id]!=null?equationCandidates(q.exp):[];
    const place=(host,items)=>items.forEach((equation)=>{const row=document.createElement('div');row.className='equation-copy-row';const code=document.createElement('code');code.textContent=equation;code.setAttribute('aria-label','Copyable equation '+equation);const button=document.createElement('button');button.type='button';button.className='copy-equation secondary';button.textContent='Copy equation';button.addEventListener('click',()=>copyEquationText(equation,button));row.append(code,button);host.append(row);});
    if(equations.length){const questionText=body.querySelector('.qtext');const holder=document.createElement('div');holder.className='question-equations';place(holder,equations);questionText?.after(holder);}
    if(detailed&&explanationEquations.length){const holder=document.createElement('div');holder.className='explanation-equations';place(holder,explanationEquations);detailed.append(holder);}
  }
  function buildWorkspace() {
    if(state.view!=='test')return;
    const card=$('questionCard');const qid=currentQids()[state.qi];const q=byId(qid);if(!q)return;
    const chosen=state.answers[qid];
    if(lastQuestion!==qid || (lastAnswer==null && chosen!=null)) activeTab=chosen==null?'tutor':chosen===q.ans?'detailed':'simple';
    lastQuestion=qid;lastAnswer=chosen;
    const feedback=card.querySelector('.feedback');
    const detailed=feedback?.querySelector('.explain');
    const simple=feedback?.querySelector('.idk-box');
    const study=card.querySelector(':scope > .idk-box') || card.querySelector('.split-r > .idk-box');
    const coach=card.querySelector('.coach');const chat=coach?.querySelector('.cchat');
    [detailed,simple,study,chat,coach].forEach((el)=>el?.remove());
    const grid=document.createElement('div');grid.className='workspace-grid';
    const rail=document.createElement('div');rail.className='workspace-tool-rail';
    const nav=document.createElement('nav');nav.className='workspace-navigator';nav.setAttribute('aria-label','Questions in this module');
    const navHeading=document.createElement('strong');navHeading.textContent='Questions';nav.append(navHeading);
    const navGrid=document.createElement('div');navGrid.className='workspace-number-grid';nav.append(navGrid);
    currentQids().forEach((id,i)=>{const button=document.createElement('button');button.type='button';button.textContent=i+1;button.className='workspace-question-number';
      if(i===state.qi){button.classList.add('current');button.setAttribute('aria-current','step');}
      if(state.answers[id]!=null)button.classList.add('answered');if(state.flags?.[id])button.classList.add('flagged');
      button.setAttribute('aria-label','Question '+(i+1)+(state.answers[id]!=null?', answered':', unanswered'));
      button.onclick=()=>{state.qi=i;save();render();};navGrid.append(button);
    });
    const canvas=document.createElement('div');canvas.className='workspace-canvas';
    const body=document.createElement('div');body.className='workspace-question-body';
    const foot=card.querySelector('.bb-foot');if(foot)foot.remove();
    while(card.firstChild)body.append(card.firstChild);canvas.append(body);if(foot)canvas.append(foot);
    const learn=document.createElement('aside');learn.className='workspace-learning';learn.setAttribute('aria-label','Learning tools');
    learn.innerHTML='<h2>Learning tools</h2><div class="learning-tabs" role="tablist" aria-label="Study tools"></div>';
    const sections={};
    [['detailed','Detailed'],['simple','Simple'],['study','Study'],['notes','Notes'],['tutor','Groq']].forEach(([name,label])=>{
      const button=document.createElement('button');button.type='button';button.className='learning-tab';button.dataset.tab=name;button.setAttribute('role','tab');button.setAttribute('aria-controls','learning-'+name);button.textContent=label;
      button.onclick=()=>selectLearningTab(name);button.onkeydown=(e)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const list=[...learn.querySelectorAll('.learning-tab')];const index=list.indexOf(button);const target=e.key==='Home'?0:e.key==='End'?list.length-1:(index+(e.key==='ArrowRight'?1:-1)+list.length)%list.length;list[target].click();list[target].focus();};
      learn.querySelector('.learning-tabs').append(button);sections[name]=tabPanel(name,label);learn.append(sections[name]);
    });
    if(detailed)sections.detailed.append(detailed);else sections.detailed.textContent='Answer the question to see the worked solution.';
    if(simple)sections.simple.append(simple);else if(chosen!=null){const holder=document.createElement('div');holder.innerHTML=explanationHtml(q,-1);sections.simple.append(holder.querySelector('.idk-box'));}else sections.simple.textContent='Answer the question or choose “I don’t know” for simple steps.';
    if(coach){coach.querySelector('h3')?.remove();coach.querySelectorAll('.sec').forEach((el)=>{if(el.querySelector('.sec-t')?.textContent==='Step by step')el.remove();});sections.detailed.append(coach);}
    if(study)sections.study.append(study);else {
      const tips=STUDY_TOOLS[q.domain]||['Recall, check, retry.','List what the question asks.','Explain the method in your own words.'];
      sections.study.innerHTML='<h3>'+escapeHtml(q.skill||q.domain)+'</h3><h4>Memory tip</h4><p>'+escapeHtml(tips[0])+'</p><h4>Study method</h4><p>'+escapeHtml(tips[2])+'</p>';
      if(chosen!=null){const drill=document.createElement('button');drill.type='button';drill.className='secondary';drill.textContent='Practice this topic';drill.onclick=()=>startDrill(curSection(),q.domain);sections.study.append(drill);}
    }
    addEquationCopies(q,body,detailed);
    const notesLabel=document.createElement('label');notesLabel.htmlFor='workspaceNotes';notesLabel.textContent='Your notes for this question';
    const notes=document.createElement('textarea');notes.id='workspaceNotes';notes.rows=10;notes.placeholder='Write a formula, an evidence quote, or your next step…';notes.maxLength=3000;notes.value=state.notes?.[qid]||'';
    let notesTimer;notes.oninput=()=>{state.notes=state.notes||{};state.notes[qid]=notes.value;clearTimeout(notesTimer);notesTimer=setTimeout(()=>save(),350);};notes.onblur=()=>{clearTimeout(notesTimer);save();};
    const noteStatus=document.createElement('p');noteStatus.className='small muted';noteStatus.textContent='Notes save with this practice session.';sections.notes.append(notesLabel,notes,noteStatus);
    if(chat)sections.tutor.append(chat);
    const provider=document.createElement('p');provider.className='small muted';provider.textContent='Powered by Groq · Ask for a method, memory tip, or another example.';sections.tutor.prepend(provider);
    const dock=document.createElement('div');dock.className='workspace-calculator-dock';dock.id='workspaceCalcDock';
    if(theme==='exam'){toolsHome.append(toolbar);learn.prepend(dock);grid.append(nav,canvas,learn);}
    if(theme==='notebook'){toolsHome.append(toolbar);canvas.insertBefore(dock,foot||null);grid.append(canvas,learn,nav);}
    if(theme==='focus'){rail.append(toolbar);grid.append(rail,dock,canvas,learn,nav);}
    dock.append($('calcPanel'));card.append(grid);selectLearningTab(activeTab);
  }
  const baseQuestionRender=renderQuestion;
  renderQuestion=function(){
    // Preserve live tool instances and text drafts while the question is redrawn.
    const calc=$('calcPanel');if(calc)document.body.append(calc);toolsHome.append(toolbar);
    const input=$('cinput');const draft=currentQids()[state.qi]===lastQuestion ? input?.value||'' : '';const focused=document.activeElement?.id;
    baseQuestionRender();buildWorkspace();
    if($('cinput')){$('cinput').value=draft;if(focused==='cinput')$('cinput').focus();}
    if(calcTool.engine==='desmos'&&calcTool.calc)requestAnimationFrame(()=>calcTool.calc.resize());
  };
  const baseShowScreen=showScreen;
  showScreen=function(id){document.body.classList.toggle('workspace-practicing',id==='screen-test');baseShowScreen(id);if(id!=='screen-test'){document.body.append($('calcPanel'));toolsHome.append(toolbar);}};
  document.body.classList.toggle('workspace-practicing',state.view==='test'||state.view==='routing');
  if(state.view==='test')renderQuestion();
})();
