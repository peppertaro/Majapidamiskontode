const GAS_URL="https://script.google.com/macros/s/AKfycbxnrGxFzWxb0Hnr9pund21uMs27Qx-gFboEPw__LusMi9dAnZRjtuT6p-hvVgk0YZRJ/exec",
Auth = {
  init:() => {
    window.google?.accounts?.id?.initialize({
      client_id: "226873784682-hr7ublchu4h5s9jeovddbp8i7jjc40sr.apps.googleusercontent.com",
      auto_select: true,
      use_fedcm_for_prompt: true,
      callback: res => {
        isLoading(true);
        return Auth.handleSuccess(res)
      }
    });
    window.google?.accounts?.id?.prompt(n=>{
      if(!n)return;
      if(n?.isNotDisplayed?.()) Auth.clear("Cannot detect the account. Please type [/login].");
    });
  },
  handleSuccess: res => res.credential ? getCmds(res.credential) : Auth.clear("No credential found."),
  clear: err => {
    if(err) showToast(err);
    console.error(err);
    sessionStorage.clear();
    Auth.setList({list:["login"]});
  },
  setList: e => window.dispatchEvent(new CustomEvent("syncSuggestions", { detail: e })), //CustomEventに渡せるParamはdetailにのみ格納可
},
getSessionItem = (k, v = sessionStorage.getItem(k)) => /^[\[\{]/.test(v) ? JSON.parse(v) : v,
showToast = v =>{
  q("#dlg").close();
  isLoading(false);
  toast.innerHTML = v;
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"),3000);
},
getCmds = c =>{
  if(!getSessionItem("authToken"))sessionStorage.setItem("authToken",c);  
  if(getSessionItem("actions"))return;
  const f = new FormData();
  f.set("token", getSessionItem("authToken") || c);
  f.set("cmd", "/list");
  return fetchGAS(f);
},
fetchGAS = body => {
  isLoading(true);
  q("#dlg").close();
  return fetch(GAS_URL, {method: "POST",body})
  .then(res => res.ok
    ? res.json()
    : Promise.reject(new Error(`HTTP error: ${res.status}`))
  )
  .then(data => {
    if(data?.error) return Promise.reject(new Error(`Data error: ${data.error}`));
    if(data?.toast) showToast(data.toast);
    if(data?.list) Auth.setList(data);
  })
  .catch(err => Auth.clear(err.message));  
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
  if(!box)return err("Invalid request, you may loaded page wrongly.<br>please login again.")
  box?.replaceChildren();
  const action = cmd.replace(/^\//,"");
  if(action==="login"){
    q("#dlg").showModal();
    google.accounts.id.renderButton(box,{ theme: "outline", size: "large", shape: "rectangular" });
    return;
  }
  if(action==="logout"){
    showToast("Successfully logged out from the account.");
    return;
  }
  const contents = getSessionItem("actions")?.[action];
  if(!contents)return err("Something went wrong, <br>please login again.");
  q('#dlgContainer').name = action;
  box.append(
    ...contents.map(line=>{
      const { tag = "input", id='', name = id, inert = false, placeholder = " ", options = [], required = true, ...props} = line,
      l = createEle("label", {classList:"field",inert});
      if(id==='title')return createEle("h2",{...props,id})
      if(props.type==="date")props.value=new Intl.DateTimeFormat("en-CA").format(new Date(props.value || Date.now()));
      e = createEle(tag, {...props, id, name, placeholder, required}); 
      if(options.length)e.append(
        createEle("option",{value:"",textContent:"Select an option",disabled:true,hidden:true,selected:true}),
        ...options.map(opt => new Option(opt))
      );
      l.append(e, id && createEle("span", {textContent: id[0].toUpperCase()+id.slice(1)}));
      return l;
    }),
    createBtns()
  );
  q("#dlg").showModal();
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
  el.innerHTML = k.map(v => `<option value="/${v}" />`).join("");
  if(e?.detail?.toast)showToast(e.detail.toast);
  isLoading(false);
}),
q("#dlgContainer").addEventListener("submit", e => ({
  confirm: () => {
    e.preventDefault();
    q("#dlgContent")?.querySelectorAll('label')?.forEach(e=>e.inert=true);
    q("#title").textContent = "Would you like to Submit?";
    e.submitter.textContent = 'Submit';
    e.submitter.value = 'submit';
  },
  submit: () => {
    const ele = e.target,
    f = new FormData(),
    d = new FormData(ele),
    csv = d.get("csv");
    d.delete("csv");
    if(!ele.name) return showToast("Invalid request, please try again.");
    f.set("token", getSessionItem("authToken") || c);
    f.set("cmd", `/${ele.name}`);
    f.set("payload", JSON.stringify(Object.fromEntries(d)));
    if(csv && csv.size > 0)f.set("csv", csv);
    fetchGAS(f);
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
  isLoading = state =>{
    e.loading(state);
    q('#logoName').classList.toggle('loading',state);
  };
  isLoading(true);
  if(!getSessionItem("authToken"))return Auth.init();
  const cmds = getSessionItem("actions")??{};
  return Object.keys(cmds).length
  ? Auth.setList({list:cmds,toast:"List successfully loaded from the Session.<br>Enjoy!"})
  : getCmds(getSessionItem("authToken"));
});