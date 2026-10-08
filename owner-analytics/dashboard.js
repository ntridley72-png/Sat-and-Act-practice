(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  $('to').value=new Date().toISOString().slice(0,10);
  $('from').value=new Date(Date.now()-6*86400000).toISOString().slice(0,10);
  let controller=null, generation=0;
  function cell(tag,text){const e=document.createElement(tag);e.textContent=String(text);return e;}
  function table(headers,rows){const t=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody'),r=document.createElement('tr');headers.forEach(h=>r.append(cell('th',h)));head.append(r);rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(value=>tr.append(cell('td',value??'Unavailable')));body.append(tr)});t.append(head,body);return t;}
  function message(host,text){host.append(cell('p',text));}
  function render(project,summary,cloud){const host=$(project).querySelector('.report');host.replaceChildren();
    host.append(cell('h3','Consented usage'));
    if(summary.error)message(host,summary.error);
    else{host.append(table(['Metric','Observed'],[['Events',summary.totals.events],['Anonymous tab sessions',summary.totals.observed_sessions]]));
      const details=document.createElement('details');details.append(cell('summary','Event counts'));details.append(table(['Event','Count','Sessions'],summary.events.map(e=>[e.name,e.events,e.sessions])));host.append(details);}
    host.append(cell('h3','Cloudflare infrastructure'));
    if(cloud.error)message(host,cloud.error);
    else{message(host,'Provider status: '+cloud.status);
      if(cloud.workers?.status==='ok'){const row=cloud.workers.data[0];host.append(table(['Workers metric','Value'],[['Requests',row?.sum.requests],['Errors',row?.sum.errors],['Subrequests',row?.sum.subrequests],['CPU time p50 (μs)',row?.quantiles.cpuTimeP50],['CPU time p99 (μs)',row?.quantiles.cpuTimeP99]]));}
      else message(host,'Workers: '+(cloud.workers?.status||'not configured'));
      if(cloud.zone?.status==='ok')host.append(table(['UTC date','HTTP requests','Bytes','Daily unique estimate'],cloud.zone.data.map(r=>[r.date,r.sum.requests,r.sum.bytes,r.uniq.uniques])));
      else message(host,'Zone: '+(cloud.zone?.status||'not configured'));
    }
  }
  function connection(project){return {token:$(project+'-cf-token').value.trim(),accountId:$(project+'-account').value.trim(),zoneId:$(project+'-zone').value.trim(),workerName:$(project+'-worker').value.trim()};}
  async function save(project,remove){const host=$(project+'-connection-status');host.textContent=remove?'Removing…':'Saving securely…';try{
    const r=await fetch('/api/analytics/connections?project='+project,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(remove?{action:'delete'}:connection(project)),credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'});
    const data=await r.json();if(r.status===401){location.replace('/owner-analytics/login.html');return;}
    host.textContent=r.ok?(remove?'Saved connection removed.':'Connection saved. You can load reports now.'):(data.error||'Could not save connection.');
    $(project+'-cf-token').value='';
  }catch{host.textContent='Could not connect. Try again.';$(project+'-cf-token').value='';}}
  for(const button of document.querySelectorAll('[data-save]'))button.addEventListener('click',()=>save(button.dataset.save,false));
  for(const button of document.querySelectorAll('[data-delete]'))button.addEventListener('click',()=>save(button.dataset.delete,true));
  $('lock').addEventListener('click',async()=>{generation++;controller?.abort();for(const input of document.querySelectorAll('#connection input'))input.value='';for(const p of ['funsat','pillcounted'])$(p).querySelector('.report').textContent='Not loaded.';try{const r=await fetch('/api/analytics/logout',{method:'POST',credentials:'same-origin',cache:'no-store'});if(r.ok)location.replace('/owner-analytics/login.html');else $('status').textContent='Reports cleared; sign-out failed. Close this page.';}catch{$('status').textContent='Reports cleared; sign-out failed. Close this page.';}});
  $('controls').addEventListener('submit',async e=>{e.preventDefault();controller?.abort();controller=new AbortController();const version=++generation;const query=new URLSearchParams({from:$('from').value,to:$('to').value});$('status').textContent='Loading separate project reports…';
    async function load(route,project){try{const r=await fetch('/api/analytics/'+route+'?'+query+'&project='+project,{signal:controller.signal,cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});if(r.status===401){location.replace('/owner-analytics/login.html');return {error:'PIN login expired.'};}const data=await r.json();return r.ok?data:{error:data.error||'Report unavailable.'};}catch(_){return {error:'Report could not be loaded.'};}}
    await Promise.all(['funsat','pillcounted'].map(async project=>{const [summary,cloud]=await Promise.all([load('summary',project),load('cloudflare',project)]);if(version===generation)render(project,summary,cloud);}));
    if(version===generation)$('status').textContent='Reports loaded. Any unavailable sources are identified in their own project.';
  });
})();
