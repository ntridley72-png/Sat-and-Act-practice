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
  $('lock').addEventListener('click',()=>{generation++;controller?.abort();$('token').value='';for(const p of ['funsat','pillcounted'])$(p).querySelector('.report').textContent='Not loaded.';$('status').textContent='Token and reports cleared.';});
  $('controls').addEventListener('submit',async e=>{e.preventDefault();controller?.abort();controller=new AbortController();const version=++generation;const token=$('token').value;const query=new URLSearchParams({from:$('from').value,to:$('to').value});$('status').textContent='Loading separate project reports…';
    async function load(route,project){try{const r=await fetch('/api/analytics/'+route+'?'+query+'&project='+project,{headers:{Authorization:'Bearer '+token},signal:controller.signal,cache:'no-store',credentials:'same-origin',referrerPolicy:'no-referrer'});const data=await r.json();return r.ok?data:{error:data.error||'Report unavailable.'};}catch(_){return {error:'Report could not be loaded.'};}}
    await Promise.all(['funsat','pillcounted'].map(async project=>{const [summary,cloud]=await Promise.all([load('summary',project),load('cloudflare',project)]);if(version===generation)render(project,summary,cloud);}));
    if(version===generation)$('status').textContent='Reports loaded. Any unavailable sources are identified in their own project.';
  });
})();
