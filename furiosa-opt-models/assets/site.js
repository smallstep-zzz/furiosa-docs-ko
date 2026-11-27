/* Site renderer: no build tools, no remote runtime dependencies. */
(function(){
"use strict";
const docRoot="https://developer.furiosa.ai/furiosa-opt-models/";
const upstream="https://github.com/furiosa-ai/furiosa-opt-models/blob/c982976100d18d7a9641d5a8c22b89cec4544049/";
const INVENTORY=[
 ["시작하기",[["index","홈","docs/index.md"],["getting-started/installation","설치","docs/getting-started/installation.md"],["getting-started/quickstart","빠른 시작","docs/getting-started/quickstart.md"],["concepts","RNGD 모델 실행 개념","docs/concepts.md"]]],
 ["서빙·KV 캐시",[["serving/index","서빙: KV 캐시·LoRA 중심 발췌","docs/serving/index.md"],["serving/vllm","vLLM 옵션","docs/serving/vllm.md"],["serving/sglang","SGLang 옵션","docs/serving/sglang.md"],["engine/python","Python 엔진 사용","docs/engine/python.md"],["engine/frameworks","프레임워크 연결","docs/engine/frameworks.md"]]],
 ["구조·개발",[["design/architecture","아키텍처와 책임 경계","docs/design/architecture.md"],["design/testing","검증 설계","docs/design/testing.md"],["develop/compose","모델 조립","docs/develop/compose.md"],["develop/add-model","모델 추가","docs/develop/add-model.md"],["develop/kernel","커널 작성","docs/develop/kernel.md"],["develop/testing","모델 테스트","docs/develop/testing.md"]]],
 ["모델",[["models/index","지원 모델·성능","docs/models/index.md"],["models/qwen3-0.6b","Qwen3 0.6B","docs/models/qwen3-0.6b.md"],["models/qwen3-1.7b","Qwen3 1.7B","docs/models/qwen3-1.7b.md"],["models/qwen3-4b","Qwen3 4B","docs/models/qwen3-4b.md"],["models/qwen3-8b","Qwen3 8B","docs/models/qwen3-8b.md"],["models/qwen3-embedding","Qwen3 임베딩","docs/models/qwen3-embedding.md"],["models/qwen3-reranker","Qwen3 리랭커","docs/models/qwen3-reranker.md"],["models/llama3-8b","Llama 3 8B","docs/models/llama3-8b.md"],["models/llama3.1-8b-nvfp4","Llama 3.1 NVFP4","docs/models/llama3.1-8b-nvfp4.md"],["models/mistral-7b","Mistral 7B","docs/models/mistral-7b.md"],["models/mistral-nemo","Mistral NeMo","docs/models/mistral-nemo.md"],["models/gemma4-12b","Gemma 4 12B","docs/models/gemma4-12b.md"]]],
 ["참조",[["reference/environment","환경변수","docs/reference/environment.md"],["reference/troubleshooting","문제 해결","docs/reference/troubleshooting.md"],["reference/python","Python API 참조","docs/reference/python.md"],["reference/rust","Rust API 참조","docs/reference/rust.md"]]]
];
const pageInfo=Object.fromEntries(INVENTORY.flatMap(([group,rows])=>rows.map(([id,title,source])=>[id,{id,title,source,group}])));
const docs=Object.assign({},window.OPT_DOCS_FOUNDATION||{},window.OPT_DOCS_SERVING||{},window.OPT_DOCS_ADVANCED||{});
function esc(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
function urlFor(id){return "index.html?doc="+encodeURIComponent(id)}
function codeHtml(v){return '<code>'+esc(v)+'</code>'}
function fmt(s){let result=esc(s);result=result.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");result=result.replace(/`([^`]+)`/g,"<code>$1</code>");result=result.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,(_,label,id)=>pageInfo[id] ? '<a href="'+esc(urlFor(id))+'" data-doc="'+esc(id)+'">'+label+'</a>' : label);return result}
function sourceUrl(id){return docRoot+(id==="index"?"":id+"/")}
function paragraph(ko,en,cls=""){return '<div class="translation '+(en?'has-en ':'')+esc(cls)+'"><p>'+fmt(ko)+(en?'<button type="button" class="original-button" aria-label="이 문단 영어 원문 열기" aria-expanded="false" title="영문 원문">EN ↕</button>':'')+'</p>'+(en?'<div class="english" lang="en">'+esc(en)+'</div>':'')+'</div>'}
function block(b,slug){let [kind,a,c,d]=b;
 if(kind==="h2"||kind==="h3"){let id=slug+"-"+String(a).replace(/[^\w가-힣]+/g,"-").replace(/^-|-$/g,"").toLowerCase();return '<'+kind+' id="'+esc(id)+'" data-heading="'+esc(a)+'">'+esc(a)+'</'+kind+'>'}
 if(kind==="p")return paragraph(a,c);
 if(kind==="note")return '<aside class="callout">'+paragraph(a,c)+'</aside>';
 if(kind==="list")return '<ul>'+a.map(item=>'<li>'+paragraph(Array.isArray(item)?item[0]:item,Array.isArray(item)?item[1]:null)+'</li>').join("")+'</ul>';
 if(kind==="code")return '<div class="code-wrap"><div class="code-label">'+esc(a)+'<button class="copy" type="button" aria-label="코드 복사">복사</button></div><pre><code>'+esc(c)+'</code></pre></div>';
 if(kind==="table")return '<div class="table-scroll"><table><thead><tr>'+a.map(x=>'<th>'+fmt(x)+'</th>').join("")+'</tr></thead><tbody>'+c.map(row=>'<tr>'+row.map(x=>'<td>'+fmt(x)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
 if(kind==="link")return '<p><a data-doc="'+esc(a)+'" href="'+esc(urlFor(a))+'">'+esc(c)+'</a></p>';
 return '';}
function renderNav(search=""){const nav=document.querySelector("#nav");const needle=search.trim().toLowerCase();nav.innerHTML=INVENTORY.map(([group,rows])=>{let items=rows.filter(([id,title])=>(id+" "+title+" "+group).toLowerCase().includes(needle));if(!items.length)return "";return '<div class="nav-group"><h3>'+esc(group)+'</h3>'+items.map(([id,title])=>{let status=docs[id]?.partial?"partial":docs[id]?"complete":"untranslated";let mark=status==="complete"?"●":status==="partial"?"◐":"↗";let attrs= docs[id]?'href="'+esc(urlFor(id))+'" data-doc="'+esc(id)+'"':'href="'+esc(sourceUrl(id))+'" target="_blank" rel="noopener"';return '<a class="nav-item '+status+'" data-name="'+esc(id)+'" '+attrs+'><span class="mark">'+mark+'</span><span>'+esc(title)+'</span></a>'}).join("")+'</div>'}).join("")}
function currentId(){let name=new URLSearchParams(location.search).get("doc")||"index";return docs[name]?name:"index"}
function render(id,scroll=true){let data=docs[id];if(!data){id="index";data=docs[id]}let info=pageInfo[id], source=upstream+info.source;let html='<div class="breadcrumb">furiosa-opt-models / '+esc(info.group)+'</div><h1>'+esc(data.title||info.title)+'</h1><div class="doc-meta"><span class="tag '+(data.partial?"partial":"complete")+'">'+(data.partial?"◐ 발췌 번역":"● 한국어 번역")+'</span><a href="'+esc(sourceUrl(id))+'" rel="noopener" target="_blank">공식 영문 웹 문서 ↗</a><a href="'+esc(source)+'" target="_blank" rel="noopener">기준 GitHub 원본 ↗</a><span>원문 기준: 2026-11-11 · 검토: 2026-11-27</span></div>';
 if(data.partial)html+='<div class="intro-note">이 페이지는 <strong>관심도가 높은 항목만 번역한 발췌판</strong>입니다. 빠진 항목은 공식 영어 문서를 참고하세요. 발췌 부분을 전체 번역처럼 표시하지 않습니다.</div>';
 html+=data.blocks.map(b=>block(b,id)).join("");html+='<div class="intro-note">비공식 번역 · 실제 SDK/플러그인 기능은 사용 중인 버전의 공식 문서를 확인하세요. 코드와 옵션 이름은 원문 표기를 유지합니다.</div>';
 document.querySelector("#article").innerHTML=html;document.title=(data.title||info.title)+" · furiosa-opt-models 한국어";document.querySelectorAll(".nav-item").forEach(x=>{x.classList.toggle("active",x.dataset.name===id);x.setAttribute("aria-current",x.dataset.name===id?"page":"false")});
 const headings=[...document.querySelector("#article").querySelectorAll("h2")];document.querySelector("#toc").innerHTML=headings.map(x=>'<a href="#'+encodeURIComponent(x.id)+'">'+esc(x.dataset.heading)+'</a>').join("")||'<span>제목</span>';
 document.body.classList.toggle("show-original",document.querySelector("#original-all").getAttribute("aria-pressed")==="true");
 closeNav();if(scroll)window.scrollTo({top:0,behavior:"instant"});}
function closeNav(){document.querySelector("#sidebar").classList.remove("open");document.querySelector("#shade").hidden=true;document.querySelector("#nav-toggle").setAttribute("aria-expanded","false")}
function select(id){if(!docs[id])return;history.pushState({id},"",urlFor(id));render(id,true)}
document.addEventListener("click",async e=>{
 let link=e.target.closest("a[data-doc]");if(link){e.preventDefault();select(link.dataset.doc);return}
 let original=e.target.closest(".original-button");if(original){let node=original.closest(".translation");let expanded=node.classList.toggle("expanded");original.setAttribute("aria-expanded",String(expanded));return}
 let cp=e.target.closest("button.copy");if(cp){try{await navigator.clipboard.writeText(cp.closest(".code-wrap").querySelector("code").textContent);cp.textContent="복사됨";setTimeout(()=>cp.textContent="복사",1100)}catch{cp.textContent="선택 후 복사"}return}
 if(e.target.id==="shade"){closeNav();return}
});
document.querySelector("#filter").addEventListener("input",e=>renderNav(e.target.value));
document.querySelector("#nav-toggle").addEventListener("click",()=>{let sb=document.querySelector("#sidebar");let expanded=sb.classList.toggle("open");document.querySelector("#shade").hidden=!expanded;document.querySelector("#nav-toggle").setAttribute("aria-expanded",String(expanded))});
document.querySelector("#original-all").addEventListener("click",e=>{let on=e.currentTarget.getAttribute("aria-pressed")!=="true";e.currentTarget.setAttribute("aria-pressed",String(on));document.body.classList.toggle("show-original",on)});
document.querySelector("#theme-toggle").addEventListener("click",()=>{let dark=document.documentElement.dataset.theme!=="dark";document.documentElement.dataset.theme=dark?"dark":"light";try{localStorage.setItem("fom-ko-theme",dark?"dark":"light")}catch{}});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeNav()});
window.addEventListener("popstate",()=>render(currentId(),true));
renderNav();render(currentId(),false);
})();
