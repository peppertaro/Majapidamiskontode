const GAS_URL="https://script.google.com/macros/s/AKfycbxnrGxFzWxb0Hnr9pund21uMs27Qx-gFboEPw__LusMi9dAnZRjtuT6p-hvVgk0YZRJ/exec",
Auth = {
  init:(isForcedLogout = false) => {
    const g=window.google?.accounts?.id;
    isLoading(true);
    if(!g) return;
    if(isForcedLogout) g._ok = false;
    if(!g._ok){
      g?.initialize({
        client_id: "226873784682-hr7ublchu4h5s9jeovddbp8i7jjc40sr.apps.googleusercontent.com",
        auto_select: true,
        use_fedcm_for_prompt: true,
        callback: res => {
          isLoading(true);
          return Auth.handleSuccess(res)
        }
      });
      g._ok=true;
    }
    g.prompt(n => n?.isNotDisplayed?.() && Auth.clear({ msg: "Please type [/login]." }));
  },
  handleSuccess: res => res.credential ? getCmds(res) : Auth.clear({msg:"No credential found.", isError:true}),
  clear: ({msg, isError = false, isForcedLogout = false}) => {
    if(msg) showToast(msg, isError);
    sessionStorage.clear();
    if(isForcedLogout)return Auth.init(true);
    Auth.setList({list:["login"]});
  },
  setList: e => window.dispatchEvent(new CustomEvent("syncSuggestions", { detail: e })), //CustomEventに渡せるParamはdetailにのみ格納可
},
getSessionItem = (k, v = sessionStorage.getItem(k)) => /^[\[\{]/.test(v) ? JSON.parse(v) : v,
showToast = (v, isError = false) =>{
  q("#dlg").close();
  isLoading(false);
  const toast = createEle("div",{"className":`toast show ${isError && "err"}`,"aria-live":"polite","textContent":v});
  setTimeout(()=>{
    toast.classList.remove("show");
    toast.ontransitionend = () => toast.remove();
  },3000);
  q("#toastBox").append(toast);
},
getCmds = c =>{
  const s = Object.fromEntries(["credential","actions","expiration"].map(k=>[k,getSessionItem(k)]));
  if(!s.credential)sessionStorage.setItem("credential",c.credential);  
  if(s.actions)return;
  const expiration = c?.expiration || JSON.parse(atob(c.credential.split('.')[1])).exp;
  if(expiration < new Date().getTime()/1000)Auth.clear({msg:"Token expired. Please login again.",isError:true,isForcedLogout:true})
  const f = new FormData();
  f.set("token", s.credential || c.credential);
  f.set("cmd", "/list");
  return fetchGAS(f);
},
fetchGAS = body => {
  isLoading(true);
  q("#dlg").close();
  return fetch(GAS_URL, {method: "POST",body:new URLSearchParams(body)})
  .then(res => res.ok
    ? res.json()
    : Promise.reject(new Error(`HTTP error: ${res.status}`))
  )
  .then(data => {
    if(data?.error) return Promise.reject(new Error(`Data error: ${data.error}`));
    if(data?.list) return Auth.setList(data);
    if(data?.toast) showToast(data.toast);
    if(data?.newVals) {
      const actions = JSON.parse(sessionStorage.getItem('actions'));
      actions[dlgContainer.name] = data.newVals;
      sessionStorage.setItem("actions",JSON.stringify(actions));
    }
  })
  .catch(err => {
    console.error(err);
    if(err.message) showToast(err.message, true);
    if(err.logout)Auth.clear({msg:"Your account has been logged out. Please login again.", isError:true, isForcedLogout:true});
  })
},
q = s => document.querySelector(s),
createEle = (tagName, props = {}) => Object.assign(document.createElement(tagName), props),
createBtns = ()=>{
  btns = createEle("menu",{id:"dlgBtns"}),
  btns.append(
    createEle("button",{value:"confirm", textContent:"Confirm",type:"submit"}),
    createEle("button",{value:"cancel", textContent:"Cancel", formNoValidate:true})
  );
  return btns;
},
showDialog = cmd => {
  // reset Dialog
  q("#cmd").value = "";
  const box = q("#dlgContent");
  if(!box)return Auth.clear({msg:"Invalid request, you may loaded page wrongly."})
  box?.replaceChildren();
  const action = cmd.replace(/^\//,"");
  if(action==="login"){
    q("#dlg").showModal();
    google.accounts.id.renderButton(box,{ theme: "outline", size: "large", shape: "rectangular" });
    return;
  }
  if(action==="logout")return Auth.clear({msg:"Successfully logged out from the account."});
  const s = Object.fromEntries(["actions","expiration"].map(k=>[k,getSessionItem(k)]));
  contents = s.actions?.[action],
  expiration = parseFloat(s.expiration) || 0;
  if(expiration < Math.floor(new Date().getTime()/1000))return Auth.clear({msg:"Session Expired.",isError:true, isForcedLogout:true})
  if(!contents)return Auth.clear({msg:"Something went wrong.",isError:true});
  q('#dlgContainer').name = action;
  box.append(
    ...contents.map(line=>{
      const { tag = "input", id='', name = id, inert = false, placeholder = " ", options = [], required = true, ...props} = line,
      l = createEle("label", {classList:"field",inert});
      if(id==='title')return createEle("h2",{...props,id})
      if(props.type==="date"){
      const d = v => new Intl.DateTimeFormat("en-CA").format(new Date(v || Date.now()));
        props.value= d(props.value);
        props.max= d();
      }
      e = createEle(tag, {...props, id, name, placeholder, required}); 
      if(options.length)e.append(
        createEle("option",{value:"",textContent:"Select an option",disabled:true,hidden:true,selected:true}),
        ...options.map(opt => new Option(opt))
      );
      l.append(e, id && createEle("span", {textContent: id[0].toUpperCase()+id.slice(1)}));
      if(props.type==="checkbox")l.append(e, createEle("span", {className:"slider"}))
      return l;
    }),
    createBtns()
  );
  q("#dlg").showModal();
},
toUTF8 = async file =>{
  const b = new Uint8Array(await file.arrayBuffer()),
  bom = {
    "239,187,191": "utf-8",
    "255,254": "utf-16le",
    "254,255": "utf-16be"
  },
  enc = bom[[...b.slice(0, 3)].join(",")]
    || bom[[...b.slice(0, 2)].join(",")] || "utf-8";
  try { return new TextDecoder(enc, { fatal: true }).decode(b); }
  catch { return new TextDecoder("shift_jis").decode(b); }
};
window.addEventListener("syncSuggestions", e => {
  const el = q("#cmdList");
  if(!el || !e?.detail?.list)return showToast("Something went wrong on obtaining list.");
  isLoading(true);
  const l = e.detail.list,
  k = Array.isArray(l) ? l : Object.keys(l);
  if(!k.includes("login")){
    sessionStorage.setItem("actions",JSON.stringify(l));    
    k.push("logout");
  }
  if(e.detail.expiration)sessionStorage.setItem("expiration",e.detail.expiration);
  el.innerHTML = k.map(v => `<option value="/${v}" />`).join("");
  if(e?.detail?.toast)showToast(e.detail.toast);
  isLoading(false);
}),
q("#dlgContainer").addEventListener("submit", e => ({
  confirm: () => {
    e.preventDefault();
    const csv = new FormData(e.target).get("csv");
    if(csv?.size && !csv.name.toLowerCase().endsWith(".csv"))return showToast("Invalid file type. Please upload a CSV file.");
    q("#dlgContent")?.querySelectorAll('label')?.forEach(e=>e.inert=true);
    q("#title").textContent = "Would you like to Submit?";
    e.submitter.textContent = 'Submit';
    e.submitter.value = 'submit';
  },
  submit: async() => {
    const token = getSessionItem("credential");
    if(!token) return Auth.clear({msg:"Token not found, please login again.",isError:true,isForcedLogout:true});
    const ele = e.target;
    if(!ele.name) return showToast("Invalid request, please try again.");
    const f = new FormData(ele),    
    c = f.get("csv");
    f.delete("csv");
    await fetchGAS({
      token,
      cmd: `/${ele.name}`,
      payload: JSON.stringify(Object.fromEntries(f)),
      ...(c?.size && {csv: await toUTF8(c), filename: c.name})
    });
  }
})[e?.submitter?.value]?.() ?? ''),
q("#cmd").addEventListener("input", e => {
  const v = e.target.value.trim();
  if(!q("#cmdList").querySelector(`option[value="${CSS.escape(v)}"]`))return;
  showDialog(v);
});
// Initial set up
const domReady = new Promise(r => document.readyState !== 'loading' ? r() : document.addEventListener('DOMContentLoaded', r)),
svgReady = new Promise(r => {
  const e = q('#logoIcon')?.contentWindow,
  check = () => e?.loading ? r(e) : requestAnimationFrame(check);
  check();
});
Promise.all([domReady, svgReady]).then(([, e]) =>{
  const s = Object.fromEntries(["credential","actions","expiration"].map(k=>[k, getSessionItem(k)])),
  expiration = parseFloat(s.expiration)||0;
  isLoading = state =>{
    e.loading(state);
    q('#logoName').classList.toggle('loading',state);
  };
  if(!s.credential)return Auth.init();
  if(expiration < Math.floor(new Date().getTime()/1000))Auth.clear({msg:"Token expired. Please login again.",isError:true,isForcedLogout:true})
  return s.actions
  ? Auth.setList({list:s.actions,toast:"List successfully loaded from the Session.\nEnjoy!"})
  : getCmds(s);
});