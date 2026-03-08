/**
 * 补豆商城（独立版）
 * 所有依赖内联，无需 BeadsShared
 */
(function(){
  "use strict";

  // ====== 内联依赖 ======

  const APP_PAGE_KEY = "catshop_page_v1";
  const CHECKOUT_CODE_KEY = "catshop_checkout_code_v1";

  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function formatUploadError(err) { if (!err) return "上传失败"; return typeof err === "string" ? err : (err.message || "上传失败"); }

  function toast(msg, type) {
    const wrap = document.getElementById("toastWrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast-msg" + (type === "error" ? " toast-error" : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  const showToast = toast;

  function showGlobalLoading() { const el = document.getElementById("globalLoading"); if (el) el.classList.add("active"); }
  function hideGlobalLoading() { const el = document.getElementById("globalLoading"); if (el) el.classList.remove("active"); }
  function trackEvent() {}

  async function requestJson(url, options) {
    const r = await fetch(url, options);
    let payload = null;
    try {
      payload = await r.json();
    } catch {
      payload = null;
    }
    if (!r.ok) {
      const err = new Error((payload && payload.message) || `HTTP ${r.status}`);
      err.httpStatus = r.status;
      err.payload = payload;
      throw err;
    }
    return payload || {};
  }
  async function apiGet(url) { return requestJson(url); }
  async function apiPost(url, body) { return requestJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  async function apiPostForm(url, fd) { return requestJson(url, { method: "POST", body: fd }); }

  function showPage(page, opts) {
    document.body.dataset.page = page;
    document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
    const target = document.querySelector(`.page[data-page="${page}"]`);
    if (target) target.classList.add("active");
    if (opts?.scrollTop) window.scrollTo(0, 0);
    try { localStorage.setItem(APP_PAGE_KEY, page); } catch {}
  }

  let _qrLibLoaded = false;
  function loadQRCodeLibrary() {
    return new Promise((resolve, reject) => {
      if (_qrLibLoaded || window.QRCode) { _qrLibLoaded = true; return resolve(); }
      const s = document.createElement("script");
      s.src = "/vendor/qrcodejs/qrcode.min.js";
      s.onload = () => { _qrLibLoaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function updateImageInputLabel(inputEl, fileNameEl) {
    if (!inputEl || !fileNameEl) return;
    fileNameEl.textContent = inputEl.files?.[0]?.name || "选择图片";
  }

  function sortCodes(a, b) {
    const ma = a.match(/^([A-Z])(\d+)$/i), mb = b.match(/^([A-Z])(\d+)$/i);
    if (!ma || !mb) return a.localeCompare(b);
    if (ma[1] !== mb[1]) return ma[1].localeCompare(mb[1]);
    return parseInt(ma[2]) - parseInt(mb[2]);
  }

  // ====== 色盘数据（内联） ======
  const S = { MASTER_CODES: [], MASTER_HEX: {}, MASTER_SERIES: {}, MASTER_IS_DEFAULT: {}, SERIES_ORDER: [], DEFAULT_CODES: [] };
  (function buildPalette(){
    const P=[["A1","#FAF5CD","A系列",1],["A2","#FCFED6","A系列",1],["A3","#FCFF92","A系列",1],["A4","#F7EC5C","A系列",1],["A5","#FFE44B","A系列",1],["A6","#FDA951","A系列",1],["A7","#FA8C4F","A系列",1],["A8","#F9E045","A系列",1],["A9","#F99C5F","A系列",1],["A10","#F47E36","A系列",1],["A11","#FEDB99","A系列",1],["A12","#FDA276","A系列",1],["A13","#FEC667","A系列",1],["A14","#F85842","A系列",1],["A15","#FBF65E","A系列",1],["A16","#FEFF97","A系列",1],["A17","#FDE173","A系列",1],["A18","#FCBF80","A系列",1],["A19","#FD7E77","A系列",1],["A20","#F9D66E","A系列",1],["A21","#FAE393","A系列",1],["A22","#EDF878","A系列",1],["A23","#E1C9BD","A系列",1],["A24","#F3F6A9","A系列",1],["A25","#FFD785","A系列",1],["A26","#FEC832","A系列",1],["B1","#DFF139","B系列",1],["B2","#64F343","B系列",1],["B3","#9FF685","B系列",1],["B4","#5FDF34","B系列",1],["B5","#39E158","B系列",1],["B6","#64E0A4","B系列",1],["B7","#3FAE7C","B系列",1],["B8","#1D9E54","B系列",1],["B9","#2A5037","B系列",1],["B10","#9AD1BA","B系列",1],["B11","#627032","B系列",1],["B12","#1A6E3D","B系列",1],["B13","#C8E87D","B系列",1],["B14","#ACE84C","B系列",1],["B15","#305335","B系列",1],["B16","#C0ED9C","B系列",1],["B17","#9EB33E","B系列",1],["B18","#E6ED4F","B系列",1],["B19","#26B78E","B系列",1],["B20","#CAEDCF","B系列",1],["B21","#176268","B系列",1],["B22","#0A4241","B系列",1],["B23","#343B1A","B系列",1],["B24","#E8FAA6","B系列",1],["B25","#4E846D","B系列",1],["B26","#907C35","B系列",1],["B27","#D0E0AF","B系列",1],["B28","#9EE5BB","B系列",1],["B29","#C6DF5F","B系列",1],["B30","#E3FBB1","B系列",1],["B31","#B2E694","B系列",1],["B32","#92AD60","B系列",1],["C1","#FFFEE4","C系列",1],["C2","#ABF8FE","C系列",1],["C3","#9EE0F8","C系列",1],["C4","#44CDFB","C系列",1],["C5","#06ABE3","C系列",1],["C6","#54A7E9","C系列",1],["C7","#3977CC","C系列",1],["C8","#0F52BD","C系列",1],["C9","#3349C3","C系列",1],["C10","#3DBBE3","C系列",1],["C11","#2ADED3","C系列",1],["C12","#1E334E","C系列",1],["C13","#CDE7FE","C系列",1],["C14","#D6FDFC","C系列",1],["C15","#21C5C4","C系列",1],["C16","#1858A2","C系列",1],["C17","#02D1F3","C系列",1],["C18","#213244","C系列",1],["C19","#188690","C系列",1],["C20","#1A70A9","C系列",1],["C21","#BEDDFC","C系列",1],["C22","#6BB1BB","C系列",1],["C23","#C8E2F9","C系列",1],["C24","#7EC5F9","C系列",1],["C25","#A9E8E0","C系列",1],["C26","#42ADD1","C系列",1],["C27","#D0DEEF","C系列",1],["C28","#BDCEED","C系列",1],["C29","#364A89","C系列",1],["D1","#ACB7EF","D系列",1],["D2","#868DD3","D系列",1],["D3","#3653AF","D系列",1],["D4","#162C7E","D系列",1],["D5","#B34EC6","D系列",1],["D6","#B37BDC","D系列",1],["D7","#8758A9","D系列",1],["D8","#E3D2FE","D系列",1],["D9","#D6BAF5","D系列",1],["D10","#301A49","D系列",1],["D11","#BCBAE2","D系列",1],["D12","#DC99CE","D系列",1],["D13","#B5038F","D系列",1],["D14","#882893","D系列",1],["D15","#2F1E8E","D系列",1],["D16","#E2E4F0","D系列",1],["D17","#C7D3F9","D系列",1],["D18","#9A64B8","D系列",1],["D19","#D8C2D9","D系列",1],["D20","#9C34AD","D系列",1],["D21","#940595","D系列",1],["D22","#383995","D系列",1],["D23","#FADBF8","D系列",1],["D24","#768AE1","D系列",1],["D25","#4950C2","D系列",1],["D26","#D6C6EB","D系列",1],["E1","#F6D4CB","E系列",1],["E2","#FCC1DD","E系列",1],["E3","#F6BDE8","E系列",1],["E4","#E9639E","E系列",1],["E5","#F1559F","E系列",1],["E6","#EC4072","E系列",1],["E7","#C63674","E系列",1],["E8","#FDDBE9","E系列",1],["E9","#E575C7","E系列",1],["E10","#D33997","E系列",1],["E11","#F7DAD4","E系列",1],["E12","#F893BF","E系列",1],["E13","#B5026A","E系列",1],["E14","#FAD4BF","E系列",1],["E15","#F5C9CA","E系列",1],["E16","#FBF4EC","E系列",1],["E17","#F7E3EC","E系列",1],["E18","#FBCBDB","E系列",1],["E19","#F6BBD1","E系列",1],["E20","#D7C6CE","E系列",1],["E21","#C09DA4","E系列",1],["E22","#B58B9F","E系列",1],["E23","#937D8A","E系列",1],["E24","#DEBEE5","E系列",1],["F1","#FF9280","F系列",1],["F2","#F73D48","F系列",1],["F3","#EF4D3E","F系列",1],["F4","#F92B40","F系列",1],["F5","#E30328","F系列",1],["F6","#913635","F系列",1],["F7","#911932","F系列",1],["F8","#BB0126","F系列",1],["F9","#E0677A","F系列",1],["F10","#874628","F系列",1],["F11","#6F321D","F系列",1],["F12","#F8516D","F系列",1],["F13","#F45C45","F系列",1],["F14","#FCADB2","F系列",1],["F15","#D50527","F系列",1],["F16","#F8C0A9","F系列",1],["F17","#E89B7D","F系列",1],["F18","#D07E4A","F系列",1],["F19","#BE454A","F系列",1],["F20","#C69495","F系列",1],["F21","#F2BBC6","F系列",1],["F22","#F7C3D0","F系列",1],["F23","#EC806D","F系列",1],["F24","#E09DAF","F系列",1],["F25","#E84854","F系列",1],["G1","#FFE4D3","G系列",1],["G2","#FCC6AC","G系列",1],["G3","#F1C4A5","G系列",1],["G4","#DCB387","G系列",1],["G5","#E7B34E","G系列",1],["G6","#F3A014","G系列",1],["G7","#98503A","G系列",1],["G8","#4B2B1C","G系列",1],["G9","#E4B685","G系列",1],["G10","#DA8C42","G系列",1],["G11","#DAC898","G系列",1],["G12","#FEC993","G系列",1],["G13","#B2714B","G系列",1],["G14","#8B684C","G系列",1],["G15","#F6F8E3","G系列",1],["G16","#F2D8C1","G系列",1],["G17","#79544E","G系列",1],["G18","#FFE4D6","G系列",1],["G19","#DD7D41","G系列",1],["G20","#A5452F","G系列",1],["G21","#B38561","G系列",1],["H1","#FBFBFB","H系列",1],["H2","#FFFFFF","H系列",1],["H3","#B4B4B4","H系列",1],["H4","#878787","H系列",1],["H5","#464648","H系列",1],["H6","#2C2C2C","H系列",1],["H7","#010101","H系列",1],["H8","#E7D6DC","H系列",1],["H9","#EFEDEE","H系列",1],["H10","#ECEAEB","H系列",1],["H11","#CDCDCD","H系列",1],["H12","#FDF6EE","H系列",1],["H13","#F4EFD1","H系列",1],["H14","#CED7D4","H系列",1],["H15","#98A6A6","H系列",1],["H16","#1B1213","H系列",1],["H17","#F0EEEF","H系列",1],["H18","#FCFFF8","H系列",1],["H19","#F2EEE5","H系列",1],["H20","#96A09F","H系列",1],["H21","#F8FBE6","H系列",1],["H22","#CACADA","H系列",1],["H23","#9B9C94","H系列",1],["M1","#BBC6B6","M系列",1],["M2","#909994","M系列",1],["M3","#697E80","M系列",1],["M4","#E0D4BC","M系列",1],["M5","#D0CBAE","M系列",1],["M6","#B0AA86","M系列",1],["M7","#B0A796","M系列",1],["M8","#AE8082","M系列",1],["M9","#A88764","M系列",1],["M10","#C6B2BB","M系列",1],["M11","#9D7693","M系列",1],["M12","#644B51","M系列",1],["M13","#C79266","M系列",1],["M14","#C37463","M系列",1],["M15","#747D7A","M系列",1],["P1","#F9F9F9","P系列（珠光）",0],["P2","#ABABAB","P系列（珠光）",0],["P3","#B6DBAF","P系列（珠光）",0],["P4","#FEA2A3","P系列（珠光）",0],["P5","#EB903F","P系列（珠光）",0],["P6","#63CEA2","P系列（珠光）",0],["P7","#E79273","P系列（珠光）",0],["P8","#ECDB59","P系列（珠光）",0],["P9","#DBD9DA","P系列（珠光）",0],["P10","#DBC7EA","P系列（珠光）",0],["P11","#F1E9D4","P系列（珠光）",0],["P12","#E9EDEE","P系列（珠光）",0],["P13","#ADCBF1","P系列（珠光）",0],["P14","#337BAD","P系列（珠光）",0],["P15","#668575","P系列（珠光）",0],["P16","#FDC24E","P系列（珠光）",0],["P17","#FDA42E","P系列（珠光）",0],["P18","#FEBDA7","P系列（珠光）",0],["P19","#FFDEE9","P系列（珠光）",0],["P20","#FCBFD1","P系列（珠光）",0],["P21","#E8BEC2","P系列（珠光）",0],["P22","#DFAAA4","P系列（珠光）",0],["P23","#A3656A","P系列（珠光）",0],["Q1","#F2A5E8","Q系列（温变）",0],["Q2","#E9EC91","Q系列（温变）",0],["Q3","#FFFF00","Q系列（温变）",0],["Q4","#FFEBFA","Q系列（温变）",0],["Q5","#76CEDE","Q系列（温变）",0],["R1","#D40E1F","R系列（果冻）",0],["R2","#F13484","R系列（果冻）",0],["R3","#FB852B","R系列（果冻）",0],["R4","#F8ED33","R系列（果冻）",0],["R5","#32C958","R系列（果冻）",0],["R6","#1EBA93","R系列（果冻）",0],["R7","#1D779C","R系列（果冻）",0],["R8","#1960C8","R系列（果冻）",0],["R9","#945AB1","R系列（果冻）",0],["R10","#F8DA54","R系列（果冻）",0],["R11","#FCECF7","R系列（果冻）",0],["R12","#D8D4D3","R系列（果冻）",0],["R13","#56534E","R系列（果冻）",0],["R14","#A3E7DC","R系列（果冻）",0],["R15","#78CEE7","R系列（果冻）",0],["R16","#3FCDCE","R系列（果冻）",0],["R17","#4E8379","R系列（果冻）",0],["R18","#7DCA9C","R系列（果冻）",0],["R19","#C8E664","R系列（果冻）",0],["R20","#E3CCBA","R系列（果冻）",0],["R21","#A17140","R系列（果冻）",0],["R22","#6B372C","R系列（果冻）",0],["R23","#F6BB6F","R系列（果冻）",0],["R24","#F3C6C0","R系列（果冻）",0],["R25","#C76A62","R系列（果冻）",0],["R26","#D093BC","R系列（果冻）",0],["R27","#E58EAE","R系列（果冻）",0],["R28","#9F85CF","R系列（果冻）",0],["T1","#FCFDFF","T系列（透明）",0],["Y1","#FF6FB7","Y系列（夜光）",0],["Y2","#FDB583","Y系列（夜光）",0],["Y3","#D8FCA4","Y系列（夜光）",0],["Y4","#91DAFB","Y系列（夜光）",0],["Y5","#E987EA","Y系列（夜光）",0],["Y6","#F7D4B8","Y系列（夜光）",0],["Y7","#F1FA7D","Y系列（夜光）",0],["Y8","#5EE88C","Y系列（夜光）",0],["Y9","#F8F5FE","Y系列（夜光）",0],["Z1","#DAABB3","Z系列（光变）",0],["Z2","#D6AA87","Z系列（光变）",0],["Z3","#C1BD8D","Z系列（光变）",0],["Z4","#96B69F","Z系列（光变）",0],["Z5","#849DC6","Z系列（光变）",0],["Z6","#94BFE2","Z系列（光变）",0],["Z7","#E2A9D2","Z系列（光变）",0],["Z8","#AB91C0","Z系列（光变）",0]];
    const seriesSet = new Set();
    P.forEach(([code, hex, series, isDef]) => {
      S.MASTER_CODES.push(code);
      S.MASTER_HEX[code] = hex;
      S.MASTER_SERIES[code] = series;
      S.MASTER_IS_DEFAULT[code] = !!isDef;
      if (isDef) S.DEFAULT_CODES.push(code);
      if (!seriesSet.has(series)) { seriesSet.add(series); S.SERIES_ORDER.push(series); }
    });
  })();
  const _VALID_CODE_SET = new Set(S.MASTER_CODES.map((c) => String(c).toUpperCase()));

    // ====== 补豆商城 ======

    // 猫咪家色号 ↔ MARD色号 映射
    const MARD_TO_CATSHOP = {"H2":"1","A2":"2","A4":"3","A7":"4","F5":"5","E4":"6","D7":"7","D3":"8","C7":"9","B8":"10","B6":"11","G8":"12","H3":"13","H7":"14","H1":"15","F6":"16","G7":"17","E1":"18","G4":"19","E6":"20","R4":"21","R3":"22","R5":"23","R2":"24","C6":"25","B3":"26","D6":"27","A3":"28","A6":"29","C2":"30","F2":"31","D5":"32","B2":"33","C5":"34","F1":"35","D2":"36","R7":"37","E2":"38","B5":"39","E5":"40","E7":"41","C9":"42","G5":"43","B7":"44","H5":"45","D1":"46","F7":"47","B1":"48","G2":"49","G6":"50","T1":"51","R1":"52","R10":"53","R8":"54","R6":"55","R9":"56","Y3":"57","Y4":"58","Y1":"59","Y2":"60","Y5":"61","P1":"62","P5":"63","P4":"64","P6":"65","P3":"66","P8":"67","P7":"68","P2":"69","H6":"70","C8":"71","F3":"72","F4":"73","E3":"74","C3":"75","C1":"76","A1":"77","B4":"78","A5":"79","D4":"80","G1":"81","C4":"82","H4":"83","B9":"84","G3":"85","H8":"86","H9":"87","H10":"88","D8":"89","D9":"90","D10":"91","F8":"92","F9":"93","E10":"94","E9":"95","A10":"96","A9":"97","A8":"98","B11":"99","B10":"100","G10":"101","G9":"102","E8":"103","D11":"104","D12":"105","D13":"106","D14":"107","D15":"108","A11":"109","A12":"110","B12":"111","E12":"112","C11":"113","G13":"114","F10":"115","A13":"116","B14":"117","G11":"118","B13":"119","C12":"120","H11":"121","B15":"122","G14":"123","E13":"124","D18":"125","D16":"126","G12":"127","D17":"128","F11":"129","C10":"130","E11":"131","C15":"132","B16":"133","F12":"134","A14":"135","C14":"136","G17":"137","G16":"138","E15":"139","E14":"140","B17":"141","C13":"142","G15":"143","H12":"144","H14":"145","H13":"146","B18":"147","F13":"148","C16":"149","A15":"150","R11":"151","R13":"152","D19":"153","F14":"154","D20":"155","C17":"156","R12":"157","D21":"158","M5":"159","M13":"160","M11":"161","M8":"162","M15":"163","M10":"164","M14":"165","M3":"166","M4":"167","M1":"168","M6":"169","M9":"170","M7":"171","M2":"172","M12":"173","B19":"174","B20":"175","P13":"176","P18":"177","P9":"178","P17":"179","P20":"180","P23":"181","P16":"182","P14":"183","P15":"184","P11":"185","P19":"186","P10":"187","P21":"188","P22":"189","P12":"190","F15":"191","B23":"192","B22":"193","B21":"194","G19":"195","C18":"196","C20":"197","D22":"198","G20":"199","H16":"200","H15":"201","C19":"202","G18":"203","H18":"204","E17":"205","E16":"206","B24":"207","A18":"208","H19":"209","E18":"210","F16":"211","C21":"212","A17":"213","H17":"214","E19":"215","A16":"216","D23":"217","A19":"218","R23":"219","R25":"220","R21":"221","R18":"222","R28":"223","R15":"224","R16":"225","R22":"226","R19":"227","R24":"228","R26":"229","R20":"230","R14":"231","R27":"232","R17":"233","D25":"234","E23":"235","H20":"236","E22":"237","E21":"238","C22":"239","B25":"240","E20":"241","A20":"242","F19":"243","D24":"244","F17":"245","F18":"246","G21":"247","B26":"248","F23":"249","C26":"250","F21":"251","C24":"252","B29":"253","B28":"254","A22":"255","C25":"256","F22":"257","D26":"258","A23":"259","F20":"260","A21":"261","B27":"262","C23":"263","C27":"264","C28":"265","C29":"266","E24":"267","F24":"268","F25":"269","B30":"270","B31":"271","B32":"272","A24":"273","A25":"274","A26":"275","H21":"276","H22":"277","H23":"278","Y6":"279","Y7":"280","Y8":"281","Y9":"282","Q3":"W1","Q4":"W2","Q1":"W3","Q2":"W4","Q5":"W5","Z1":"ZG1","Z2":"ZG2","Z3":"ZG3","Z4":"ZG4","Z5":"ZG5","Z6":"ZG6","Z7":"ZG7","Z8":"ZG8"};
    const CATSHOP_TO_MARD = {};
    for(const [m, c] of Object.entries(MARD_TO_CATSHOP)) CATSHOP_TO_MARD[c] = m;

    // 品牌模式
    let _shopBrandType = "mard"; // "mard" | "catshop"
    try{ _shopBrandType = localStorage.getItem("shopBrandType") || "mard"; }catch{}

    /** 根据当前品牌模式返回展示用色号 */
    function _displayCode(mardCode){
      return _shopBrandType === "catshop" && MARD_TO_CATSHOP[mardCode] ? MARD_TO_CATSHOP[mardCode] : mardCode;
    }

    /** 猫咪家色号排序（纯数字优先，然后字母+数字） */
    function _sortCatshopCodes(a, b){
      const ca = MARD_TO_CATSHOP[a] || a;
      const cb = MARD_TO_CATSHOP[b] || b;
      const na = parseInt(ca, 10);
      const nb = parseInt(cb, 10);
      const aIsNum = !isNaN(na) && String(na) === ca;
      const bIsNum = !isNaN(nb) && String(nb) === cb;
      if(aIsNum && bIsNum) return na - nb;
      if(aIsNum) return -1;
      if(bIsNum) return 1;
      return sortCodes(ca, cb);
    }

    const _SHOP_QTY_KEY = "beadShopQty";
    function _loadShopQty(){
      try{
        const d = JSON.parse(localStorage.getItem(_SHOP_QTY_KEY));
        if(!d || typeof d !== "object" || Array.isArray(d)) return {};
        const out = {};
        for(const [rawCode, rawQty] of Object.entries(d)){
          const code = String(rawCode || "").trim().toUpperCase();
          const qty = Number(rawQty);
          if(!_VALID_CODE_SET.has(code)) continue;
          if(!Number.isInteger(qty)) continue;
          if(qty <= 0 || qty > 5000) continue;
          out[code] = qty;
        }
        return out;
      } catch{
        return {};
      }
    }
    function _saveShopQty(){ try{ localStorage.setItem(_SHOP_QTY_KEY, JSON.stringify(_beadShopQty)); }catch{} }

    const BEAD_SHOP_STEP = 10;       // 每次加减 10g
    const BEAD_SHOP_MIN = 0;         // 最小 0g
    const BEAD_SHOP_MAX = 5000;      // 最大 5000g
    const SHOP_SPEC_OPTIONS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    let _beadShopQty = _loadShopQty(); // { code: qty } 已选克数
    let _beadShopInited = false;     // 是否已初始化（含列表渲染）
    let _beadShopEventsInited = false; // 事件是否已绑定（只绑一次）
    let _beadShopActiveSeries = "all"; // 当前选中色系
    let _shopSpecTarget = null;      // 当前规格弹窗对应的 { code, row }
    let _availableSpecs = {20: true, 50: true, 100: true}; // 可用规格配置（默认全开）
    let _disabledCodesSet = new Set(); // 下架色号集合（默认全部上架）

    /** 从服务端加载可用规格配置 */
    async function _loadSpecConfig(){
      try{
        const res = await apiGet("/api/shop/spec-config");
        if(res.ok && res.data) _availableSpecs = res.data;
      }catch{}
    }

    /** 从服务端加载下架色号列表 */
    async function _loadDisabledCodes(){
      try{
        const res = await apiGet("/api/shop/disabled-codes");
        if(res.ok && Array.isArray(res.data)){
          _disabledCodesSet = new Set(res.data);
          // 配置加载后重新渲染当前列表以更新禁用状态
          if(_beadShopInited) _renderShopList(_beadShopActiveSeries);
        }
      }catch{}
    }

    /** 判断色号是否已下架 */
    function _isCodeDisabled(code){
      return _disabledCodesSet.has(String(code).toUpperCase());
    }

    /* ---- 品牌选择页 ---- */
    let _brandInited = false;
    function initBrandPage(){
      if(_brandInited) return;
      _brandInited = true;

      // 返回按钮
      document.getElementById("brandBack")?.addEventListener("click", ()=>{
        showPage("stats", {scrollTop:false});
      });

      // MARD 品牌卡片
      document.getElementById("brandMard")?.addEventListener("click", ()=>{
        _shopBrandType = "mard";
        try{ localStorage.setItem("shopBrandType", "mard"); }catch{}
        _beadShopInited = false; // 切换品牌需重新渲染
        showPage("bead-shop", {scrollTop:true});
        initBeadShop();
      });

      // 猫咪家品牌卡片
      document.getElementById("brandCatshop")?.addEventListener("click", ()=>{
        _shopBrandType = "catshop";
        try{ localStorage.setItem("shopBrandType", "catshop"); }catch{}
        _beadShopInited = false; // 切换品牌需重新渲染
        showPage("bead-shop", {scrollTop:true});
        initBeadShop();
      });

      // 查询历史按钮 & 半弹层
      const querySheet = document.getElementById("queryOrderSheet");
      const queryOverlay = document.getElementById("queryOrderSheetOverlay");
      const queryInput = document.getElementById("queryOrderInput");
      const querySubmit = document.getElementById("queryOrderSubmit");

      function openQuerySheet(){
        if(querySheet) querySheet.classList.add("active");
        if(queryInput){ queryInput.value = ""; queryInput.focus(); }
      }
      function closeQuerySheet(){
        if(querySheet) querySheet.classList.remove("active");
      }

      document.getElementById("brandQueryHistoryBtn")?.addEventListener("click", openQuerySheet);
      queryOverlay?.addEventListener("click", closeQuerySheet);

      querySubmit?.addEventListener("click", async ()=>{
        const code = (queryInput?.value || "").trim();
        if(!code){
          toast("请输入补豆口令或淘宝订单号","info");
          return;
        }
        try{
          const res = await apiGet("/api/shop/order/" + encodeURIComponent(code));
          if(res.multiple && res.list){
            closeQuerySheet();
            _showMultipleOrdersSheet(res.list);
            return;
          }
          if(!res.ok || !res.data){
            toast(res.message || "未找到对应的补豆清单","error");
            return;
          }
          closeQuerySheet();
          _renderCheckoutFromQuery(res.data);
        } catch(e){
          toast(e.message || "查询失败","error");
        }
      });
    }

    /** 多结果选择弹窗：淘宝订单号匹配到多条口令时展示 */
    function _showMultipleOrdersSheet(list){
      const existing = document.getElementById("multipleOrdersSheet");
      if(existing) existing.remove();

      const sheet = document.createElement("div");
      sheet.id = "multipleOrdersSheet";
      sheet.className = "bottom-sheet active";
      sheet.innerHTML = `
        <div class="bottom-sheet-overlay" id="multipleOrdersSheetOverlay"></div>
        <div class="bottom-sheet-content" style="max-height:80vh;overflow-y:auto">
          <div class="bottom-sheet-header" style="justify-content:center">
            <h3>找到多个关联口令</h3>
          </div>
          <div class="bottom-sheet-body" style="padding:0 0 12px">
            <p style="margin:12px 0 12px;font-size:13px;color:#999;padding:0 16px">该淘宝订单号对应多个补豆口令，请选择要查看的口令：</p>
            <div id="multipleOrdersList"></div>
          </div>
        </div>`;
      document.body.appendChild(sheet);

      const listEl = sheet.querySelector("#multipleOrdersList");
      list.forEach(item => {
        const isPending = (item.status || "pending") === "pending";
        const statusText = isPending ? "待确认" : "已确认";
        const statusColor = isPending ? "#f59e0b" : "#10b981";
        const timeStr = _formatSubmitTime(item.createdAt);
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f5f5f5;cursor:pointer;transition:background .15s";
        const safeCode = escapeHtml(String(item.code || ""));
        const safeMeta = escapeHtml(`${timeStr} · ${item.totalQty}g · ${item.colorCount}色`);
        row.innerHTML = `
          <div style="min-width:0;flex:1">
            <div style="font-size:14px;font-weight:600;color:#333;font-family:monospace;letter-spacing:.5px">${safeCode}</div>
            <div style="font-size:12px;color:#999;margin-top:3px">${safeMeta}</div>
          </div>
          <div style="flex-shrink:0;margin-left:12px;display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;font-weight:500;color:${statusColor}">${statusText}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>`;
        row.addEventListener("mouseenter", ()=>{ row.style.background = "#f9f9f9"; });
        row.addEventListener("mouseleave", ()=>{ row.style.background = ""; });
        row.addEventListener("click", async ()=>{
          try{
            const res = await apiGet("/api/shop/order/" + encodeURIComponent(item.code));
            if(!res.ok || !res.data){
              toast(res.message || "查询失败","error");
              return;
            }
            sheet.remove();
            _renderCheckoutFromQuery(res.data);
          } catch(e){
            toast(e.message || "查询失败","error");
          }
        });
        listEl.appendChild(row);
      });

      sheet.querySelector("#multipleOrdersSheetOverlay").addEventListener("click", ()=> sheet.remove());
    }

    /** 根据查询到的订单数据渲染结算页 */
    function _renderCheckoutFromQuery(data){
      _initCheckoutPage();

      // 恢复品牌类型
      if(data.brandType){
        _shopBrandType = data.brandType;
        try{ localStorage.setItem("shopBrandType", data.brandType); }catch{}
      }

      const pageEl = document.getElementById("pageBeadCheckout");
      if(pageEl) pageEl.dataset.backTo = "bead-brand";

      showPage("bead-checkout", {scrollTop:true});

      const orderCode = data.code || "----";
      const items = Array.isArray(data.items) ? data.items : [];
      const status = data.status || "pending";
      _renderCheckoutUI(orderCode, items, status, data.updatedAt || data.createdAt, data.plan || null);

      // 保存口令供刷新恢复
      try{ localStorage.setItem(CHECKOUT_CODE_KEY, orderCode); }catch{}
    }

    function initBeadShop(){
      if(_beadShopInited) return;
      _beadShopInited = true;

      // 加载可用规格配置和功能色系配置
      _loadSpecConfig();
      _loadDisabledCodes();

      // 事件只绑定一次（切换品牌时 _beadShopInited 会重置，但事件不需要重复绑定）
      if(!_beadShopEventsInited){
        _beadShopEventsInited = true;

        // 返回按钮
        const backBtn = document.getElementById("beadShopBack");
        if(backBtn){
          backBtn.addEventListener("click", ()=>{
            showPage("bead-brand", {scrollTop:false});
          });
        }

        // 下一步按钮 - 打开确认弹窗（结算前自动清理下架色号）
        const nextBtn = document.getElementById("beadShopNext");
        if(nextBtn){
          nextBtn.addEventListener("click", ()=>{
            // 检查并移除下架色号
            const disabledInCart = Object.keys(_beadShopQty).filter(c => _beadShopQty[c] > 0 && _isCodeDisabled(c));
            if(disabledInCart.length > 0){
              disabledInCart.forEach(c => { delete _beadShopQty[c]; _syncMainListRow(c); });
              _saveShopQty();
              _updateShopFooter();
              if(document.getElementById("shopCartOverlay")?.classList.contains("open")) _renderCartSheet();
              toast("以下色号已下架，已从购物车移除：" + disabledInCart.join("、"), "warn");
              // 移除后如果购物车空了，不继续结算
              const remaining = Object.entries(_beadShopQty).filter(([,q]) => q > 0);
              if(remaining.length === 0) return;
            }
            const entries = Object.entries(_beadShopQty).filter(([,q]) => q > 0);
            if(entries.length === 0){
              toast("请先选择需要补豆的色号");
              return;
            }
            const sheet = document.getElementById("checkoutConfirmSheet");
            if(sheet) sheet.classList.add("active");
          });
        }
        // 确认弹窗 - 取消
        document.getElementById("checkoutConfirmCancel")?.addEventListener("click", ()=>{
          document.getElementById("checkoutConfirmSheet")?.classList.remove("active");
        });
        document.getElementById("checkoutConfirmSheetOverlay")?.addEventListener("click", ()=>{
          document.getElementById("checkoutConfirmSheet")?.classList.remove("active");
        });
        // 确认弹窗 - 生成口令
        document.getElementById("checkoutConfirmSubmit")?.addEventListener("click", ()=>{
          document.getElementById("checkoutConfirmSheet")?.classList.remove("active");
          _goCheckout();
        });

        // AI智能补豆按钮
        document.getElementById("aiSmartBeadBtn")?.addEventListener("click", ()=>{
          _openAiSmartSheet();
        });

        // 初始化AI智能补豆弹层
        _initAiSmartSheet();

        // 绑定规格弹窗事件
        _bindShopSpecEvents();

        // 绑定一键加购弹窗事件
        _bindBulkAddSpecEvents();

        // 绑定购物车半弹层事件
        _bindCartSheetEvents();

        // 初始化结算页
        _initCheckoutPage();
      }

      // 构建左侧色系 Tab（切换品牌时需要重新渲染）
      _buildShopSidebar();

      // 渲染色号列表
      _renderShopList("all");

      // 恢复本地已保存的购物车合计
      _updateShopFooter();
    }

    function _buildShopSidebar(){
      const sidebar = document.getElementById("beadShopSidebar");
      if(!sidebar) return;

      // 默认色系
      const defaultSeriesList = S.SERIES_ORDER.filter(s => {
        const code = S.MASTER_CODES.find(c => S.MASTER_SERIES[c] === s);
        return code && S.MASTER_IS_DEFAULT[code];
      });
      // 非默认色系
      const nonDefaultSeriesList = S.SERIES_ORDER.filter(s => {
        const code = S.MASTER_CODES.find(c => S.MASTER_SERIES[c] === s);
        return code && !S.MASTER_IS_DEFAULT[code];
      });

      // 清空后重建
      sidebar.innerHTML = '';

      // "全部" Tab
      const allBtn = document.createElement("button");
      allBtn.className = "bead-shop-tab active";
      allBtn.type = "button";
      allBtn.dataset.series = "all";
      allBtn.textContent = "全部";
      sidebar.appendChild(allBtn);

      // "常用色" Tab
      const hotBtn = document.createElement("button");
      hotBtn.className = "bead-shop-tab";
      hotBtn.type = "button";
      hotBtn.dataset.series = "_hot";
      hotBtn.textContent = "常用色";
      sidebar.appendChild(hotBtn);

      // 默认色系 Tab
      defaultSeriesList.forEach(series => {
        const btn = document.createElement("button");
        btn.className = "bead-shop-tab";
        btn.type = "button";
        btn.dataset.series = series;
        const letter = series.replace(/系列.*$/, "");
        btn.textContent = letter + "色系";
        sidebar.appendChild(btn);
      });

      // 非默认色系 Tab（带括号描述）
      if(nonDefaultSeriesList.length > 0){
        // 分割线
        const divider = document.createElement("div");
        divider.className = "bead-shop-tab-divider";
        sidebar.appendChild(divider);

        nonDefaultSeriesList.forEach(series => {
          const btn = document.createElement("button");
          btn.className = "bead-shop-tab";
          btn.type = "button";
          btn.dataset.series = series;
          // "P系列（珠光）" → "P色系" + 换行 + "珠光"
          const letter = series.replace(/系列.*$/, "");
          const aliasMatch = series.match(/[（(](.+?)[）)]/);
          if(aliasMatch){
            const nameSpan = document.createElement("span");
            nameSpan.textContent = letter + "色系";
            const aliasSpan = document.createElement("span");
            aliasSpan.className = "bead-shop-tab-alias";
            aliasSpan.textContent = aliasMatch[1];
            btn.appendChild(nameSpan);
            btn.appendChild(aliasSpan);
          } else {
            btn.textContent = letter + "色系";
          }
          sidebar.appendChild(btn);
        });
      }

      // Tab 点击事件（覆盖旧处理器，避免切换品牌后重复绑定）
      sidebar.onclick = (e) => {
        const tab = e.target.closest(".bead-shop-tab");
        if(!tab) return;
        const series = tab.dataset.series;
        if(series === _beadShopActiveSeries) return;

        // 切换选中态
        sidebar.querySelectorAll(".bead-shop-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        _beadShopActiveSeries = series;
        _renderShopList(series);
      };
    }

    const SHOP_HOT_CODES = ["H1","H2","H7","E11","E16"];
    const SHOP_CODE_NOTES = {"H1":"透明","H2":"纯白","H7":"纯黑","E11":"肤色","E16":"肤色","T1":"亮片透"};
    const SHOP_EXCLUDE_CODES = new Set(["Y6","Y7","Y8","Y9"]); // 商城中不展示的色号

    function _getShopCodes(series){
      // 获取需要展示的色号列表
      const sorter = _shopBrandType === "catshop" ? _sortCatshopCodes : sortCodes;
      if(series === "_hot"){
        return SHOP_HOT_CODES.filter(c => S.MASTER_CODES.includes(c) && !SHOP_EXCLUDE_CODES.has(c)).sort(sorter);
      }
      if(series === "all"){
        return S.MASTER_CODES.filter(c => !SHOP_EXCLUDE_CODES.has(c)).sort(sorter);
      }
      const list = S.MASTER_CODES.filter(c => S.MASTER_SERIES[c] === series && !SHOP_EXCLUDE_CODES.has(c));
      return list.sort(sorter);
    }

    function _renderShopList(series){
      const container = document.getElementById("beadShopList");
      if(!container) return;

      const codes = _getShopCodes(series);
      if(codes.length === 0){
        container.innerHTML = '<div class="bead-shop-empty">暂无色号</div>';
        return;
      }

      const fragment = document.createDocumentFragment();

      // ---- 固定标题行：icon + 品牌 + 一键加购 ----
      const stickyBar = document.createElement("div");
      stickyBar.className = "bead-shop-sticky-bar";
      // 色号icon（和swatch同宽，确保对齐）
      const stickyIcon = document.createElement("span");
      stickyIcon.className = "bead-shop-sticky-icon";
      stickyIcon.innerHTML = '<svg viewBox="0 0 1024 1024" width="20" height="20"><defs><linearGradient id="palGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="50%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#f472b6"/></linearGradient></defs><path d="M512 0a512 512 0 0 0 0 1024c180.224 0-110.592-204.8 204.8-204.8a302.08 302.08 0 0 0 307.2-307.2A512 512 0 0 0 512 0zM179.2 486.4A76.8 76.8 0 1 1 256 409.6a76.8 76.8 0 0 1-76.8 76.8zM358.4 307.2a76.8 76.8 0 1 1 76.8-76.8A76.8 76.8 0 0 1 358.4 307.2z m307.2 0a76.8 76.8 0 1 1 76.8-76.8A76.8 76.8 0 0 1 665.6 307.2z m179.2 179.2A76.8 76.8 0 1 1 921.6 409.6a76.8 76.8 0 0 1-76.8 76.8z" fill="url(#palGrad)"/></svg>';
      stickyBar.appendChild(stickyIcon);
      const brandLabel1 = document.createElement("span");
      brandLabel1.className = "bead-shop-sticky-brand";
      const brandLabel2 = document.createElement("span");
      brandLabel2.className = "bead-shop-sticky-brand";
      if(_shopBrandType === "catshop"){
        brandLabel1.textContent = "猫咪家";
        brandLabel2.textContent = "MARD";
      } else {
        brandLabel1.textContent = "MARD";
        brandLabel2.textContent = "猫咪家";
      }
      const brandWrap = document.createElement("span");
      brandWrap.className = "bead-shop-sticky-brands";
      brandWrap.appendChild(brandLabel1);
      brandWrap.appendChild(brandLabel2);
      const bulkBtn = document.createElement("button");
      bulkBtn.type = "button";
      bulkBtn.className = "bead-shop-bulk-add-btn";
      bulkBtn.textContent = "一键加购";
      bulkBtn.addEventListener("click", () => _openBulkAddSpec(series));
      stickyBar.appendChild(brandWrap);
      stickyBar.appendChild(bulkBtn);
      fragment.appendChild(stickyBar);

      codes.forEach(code => {
        const qty = _beadShopQty[code] || 0;
        const hex = S.MASTER_HEX[code] || "#777";
        const isSeriesDisabled = _isCodeDisabled(code);

        const row = document.createElement("div");
        row.className = "bead-shop-row" + (isSeriesDisabled ? " series-disabled" : "");
        row.dataset.code = code;

        // 色块
        const swatch = document.createElement("span");
        swatch.className = "bead-shop-swatch";
        swatch.style.backgroundColor = hex;
        if(isSeriesDisabled) swatch.style.opacity = "0.45";

        // 色号（两列：主色号 + 另一品牌色号）
        const codeEl = document.createElement("span");
        codeEl.className = "bead-shop-code";
        const displayName = _displayCode(code);
        const note = SHOP_CODE_NOTES[code];
        const codeText = document.createElement("span");
        codeText.textContent = displayName;
        if(note){
          const noteEl = document.createElement("span");
          noteEl.className = "bead-shop-code-note";
          noteEl.textContent = note;
          codeText.appendChild(noteEl);
        }
        codeEl.appendChild(codeText);

        // 另一品牌色号
        const catshopCode = MARD_TO_CATSHOP[code] || "";
        const altDisplay = _shopBrandType === "catshop" ? code : catshopCode;
        const altEl = document.createElement("span");
        altEl.className = "bead-shop-code-alt";
        altEl.textContent = altDisplay || "-";
        codeEl.appendChild(altEl);

        // 控制区
        const controls = document.createElement("div");
        controls.className = "bead-shop-controls";

        // 减号
        const minusBtn = document.createElement("button");
        minusBtn.className = "bead-shop-btn minus";
        minusBtn.type = "button";
        if(isSeriesDisabled || qty <= BEAD_SHOP_MIN) minusBtn.disabled = true;

        // 克数
        const qtyEl = document.createElement("span");
        qtyEl.className = "bead-shop-qty" + (qty > 0 ? " has-value" : "");
        qtyEl.textContent = qty + "g";

        // 加号
        const plusBtn = document.createElement("button");
        plusBtn.className = "bead-shop-btn plus";
        plusBtn.type = "button";
        if(isSeriesDisabled || qty >= BEAD_SHOP_MAX) plusBtn.disabled = true;

        // 点击克数区域打开规格弹窗
        qtyEl.style.cursor = isSeriesDisabled ? "default" : "pointer";
        qtyEl.addEventListener("click", () => {
          if(_isCodeDisabled(code)){
            toast("抓紧补货中...", "warn");
            return;
          }
          _openShopSpec(code, row);
        });

        // 事件
        minusBtn.addEventListener("click", () => _shopAdjust(code, -BEAD_SHOP_STEP, row));
        plusBtn.addEventListener("click", () => _shopAdjust(code, BEAD_SHOP_STEP, row));

        controls.appendChild(minusBtn);
        controls.appendChild(qtyEl);
        controls.appendChild(plusBtn);

        row.appendChild(swatch);
        row.appendChild(codeEl);
        row.appendChild(controls);
        fragment.appendChild(row);
      });

      container.innerHTML = "";
      container.appendChild(fragment);
      container.scrollTop = 0;
    }

    function _shopAdjust(code, delta, row){
      if(_isCodeDisabled(code)){
        toast("抓紧补货中...", "warn");
        return;
      }
      let qty = (_beadShopQty[code] || 0) + delta;
      if(qty < BEAD_SHOP_MIN) qty = BEAD_SHOP_MIN;
      if(qty > BEAD_SHOP_MAX) qty = BEAD_SHOP_MAX;

      if(qty === 0){
        delete _beadShopQty[code];
      } else {
        _beadShopQty[code] = qty;
      }
      _saveShopQty();

      // 更新行内 UI（避免重渲染整个列表）
      if(row){
        const qtyEl = row.querySelector(".bead-shop-qty");
        const minusBtn = row.querySelector(".bead-shop-btn.minus");
        const plusBtn = row.querySelector(".bead-shop-btn.plus");
        if(qtyEl){
          qtyEl.textContent = qty + "g";
          qtyEl.classList.toggle("has-value", qty > 0);
        }
        if(minusBtn) minusBtn.disabled = qty <= BEAD_SHOP_MIN;
        if(plusBtn) plusBtn.disabled = qty >= BEAD_SHOP_MAX;
      }

      _updateShopFooter();
    }

    function _updateShopFooter(){
      const entries = Object.entries(_beadShopQty);
      const totalQty = entries.reduce((sum, [, q]) => sum + q, 0);
      const totalCount = entries.length;

      const totalEl = document.getElementById("beadShopTotalWeight");
      if(totalEl) totalEl.textContent = totalQty + "g";

      // badge
      const badge = document.getElementById("beadShopBadge");
      if(badge){
        if(totalCount > 0){
          badge.style.display = "";
          badge.textContent = totalCount;
        } else {
          badge.style.display = "none";
        }
      }

      // 去结算按钮启用/禁用
      const nextBtn = document.getElementById("beadShopNext");
      if(nextBtn) nextBtn.disabled = totalCount === 0;
    }

    /* ---- 购物车半弹层 ---- */
    function _toggleCartSheet(){
      const overlay = document.getElementById("shopCartOverlay");
      if(!overlay) return;
      const isOpen = overlay.classList.contains("open");
      if(isOpen){
        _closeCartSheet();
      } else {
        _openCartSheet();
      }
    }

    function _openCartSheet(){
      const overlay = document.getElementById("shopCartOverlay");
      if(!overlay) return;
      _renderCartSheet();
      overlay.classList.add("open");
      const link = document.getElementById("beadShopDetailBtn");
      if(link) link.textContent = "收起明细";
    }

    function _closeCartSheet(){
      const overlay = document.getElementById("shopCartOverlay");
      if(overlay) overlay.classList.remove("open");
      const link = document.getElementById("beadShopDetailBtn");
      if(link) link.textContent = "查看明细";
    }

    function _renderCartSheet(){
      const container = document.getElementById("shopCartSheetList");
      if(!container) return;

      const entries = Object.entries(_beadShopQty).filter(([,q]) => q > 0);
      if(entries.length === 0){
        container.innerHTML = '<div class="bead-shop-empty">还没有加购商品</div>';
        return;
      }

      // 按色号自然排序（猫咪家模式用猫咪家色号排序）
      const _cartSorter = _shopBrandType === "catshop" ? _sortCatshopCodes : sortCodes;
      entries.sort((a, b) => _cartSorter(a[0], b[0]));

      const fragment = document.createDocumentFragment();
      entries.forEach(([code, qty]) => {
        const hex = S.MASTER_HEX[code] || "#777";
        const row = document.createElement("div");
        row.className = "bead-shop-row";
        row.dataset.code = code;

        const swatch = document.createElement("span");
        swatch.className = "bead-shop-swatch";
        swatch.style.backgroundColor = hex;

        const codeEl = document.createElement("span");
        codeEl.className = "bead-shop-code";
        const _cartDisplayName = _displayCode(code);
        const note = SHOP_CODE_NOTES[code];
        codeEl.textContent = note ? _cartDisplayName + "\uff08" + note + "\uff09" : _cartDisplayName;

        const controls = document.createElement("div");
        controls.className = "bead-shop-controls";

        const minusBtn = document.createElement("button");
        minusBtn.className = "bead-shop-btn minus";
        minusBtn.type = "button";
        if(qty <= BEAD_SHOP_MIN) minusBtn.disabled = true;

        const qtyEl = document.createElement("span");
        qtyEl.className = "bead-shop-qty has-value";
        qtyEl.textContent = qty + "g";
        qtyEl.style.cursor = "pointer";
        qtyEl.addEventListener("click", () => _openShopSpec(code, row));

        const plusBtn = document.createElement("button");
        plusBtn.className = "bead-shop-btn plus";
        plusBtn.type = "button";
        if(qty >= BEAD_SHOP_MAX) plusBtn.disabled = true;

        minusBtn.addEventListener("click", () => {
          _shopAdjust(code, -BEAD_SHOP_STEP, row);
          _syncMainListRow(code);
          // 如果减到0，延迟刷新弹层
          if(!_beadShopQty[code]) setTimeout(() => _renderCartSheet(), 200);
        });
        plusBtn.addEventListener("click", () => {
          _shopAdjust(code, BEAD_SHOP_STEP, row);
          _syncMainListRow(code);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "bead-shop-delete-btn";
        deleteBtn.type = "button";
        deleteBtn.title = "删除";
        deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        deleteBtn.addEventListener("click", () => {
          delete _beadShopQty[code];
          _saveShopQty();
          _syncMainListRow(code);
          _updateShopFooter();
          setTimeout(() => _renderCartSheet(), 200);
        });

        controls.appendChild(minusBtn);
        controls.appendChild(qtyEl);
        controls.appendChild(plusBtn);
        controls.appendChild(deleteBtn);

        row.appendChild(swatch);
        row.appendChild(codeEl);
        row.appendChild(controls);
        fragment.appendChild(row);
      });

      container.innerHTML = "";
      container.appendChild(fragment);
    }

    function _syncMainListRow(code){
      // 同步主列表中对应行的 UI
      const mainContainer = document.getElementById("beadShopList");
      if(!mainContainer) return;
      const mainRow = mainContainer.querySelector(`.bead-shop-row[data-code="${code}"]`);
      if(!mainRow) return;
      const qty = _beadShopQty[code] || 0;
      const isSeriesDisabled = _isCodeDisabled(code);
      const qtyEl = mainRow.querySelector(".bead-shop-qty");
      const minusBtn = mainRow.querySelector(".bead-shop-btn.minus");
      const plusBtn = mainRow.querySelector(".bead-shop-btn.plus");
      if(qtyEl){
        qtyEl.textContent = qty + "g";
        qtyEl.classList.toggle("has-value", qty > 0);
      }
      if(minusBtn) minusBtn.disabled = isSeriesDisabled || qty <= BEAD_SHOP_MIN;
      if(plusBtn) plusBtn.disabled = isSeriesDisabled || qty >= BEAD_SHOP_MAX;
    }

    /* ---- AI智能补豆弹层 ---- */
    function _openAiSmartSheet(){
      const overlay = document.getElementById("aiSmartOverlay");
      if(overlay) overlay.classList.add("open");
    }
    function _closeAiSmartSheet(){
      const overlay = document.getElementById("aiSmartOverlay");
      if(overlay) overlay.classList.remove("open");
    }
    function _initAiSmartSheet(){
      const overlay = document.getElementById("aiSmartOverlay");
      if(!overlay) return;

      // 关闭按钮
      document.getElementById("aiSmartClose")?.addEventListener("click", _closeAiSmartSheet);

      // 点击遮罩关闭
      overlay.addEventListener("click", (e)=>{
        if(e.target === overlay) _closeAiSmartSheet();
      });

      // Tab 切换
      const tabBtns = overlay.querySelectorAll(".tab-nav .tab-btn");
      const panels = {
        "ai-text": document.getElementById("aiTextPanel"),
        "ai-image": document.getElementById("aiImagePanel"),
        "ai-csv": document.getElementById("aiCsvPanel"),
      };
      const submitBtn = document.getElementById("aiSmartSubmit");
      const submitText = document.getElementById("aiSmartSubmitText");
      let _aiActiveTab = "ai-text";
      function _updateAiSubmitBtn(tab){
        _aiActiveTab = tab;
        if(tab === "ai-csv"){
          if(submitText) submitText.textContent = "立即上传";
          if(submitBtn) submitBtn.classList.add("no-icon");
        } else {
          if(submitText) submitText.textContent = "立即AI识别";
          if(submitBtn) submitBtn.classList.remove("no-icon");
        }
      }
      tabBtns.forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const tab = btn.dataset.tab;
          tabBtns.forEach(b=> b.classList.toggle("active", b === btn));
          Object.keys(panels).forEach(k=>{
            if(panels[k]) panels[k].classList.toggle("active", k === tab);
          });
          _updateAiSubmitBtn(tab);
        });
      });

      // 图片上传
      const aiImageFile = document.getElementById("aiImageFile");
      const aiImageName = document.getElementById("aiImageName");
      aiImageFile?.addEventListener("change", ()=>{
        updateImageInputLabel(aiImageFile, aiImageName);
      });

      // CSV上传
      const aiCsvFile = document.getElementById("aiCsvFile");
      const aiCsvName = document.getElementById("aiCsvName");
      aiCsvFile?.addEventListener("change", ()=>{
        const f = aiCsvFile.files?.[0];
        if(f && !/\.(csv|txt)$/i.test(f.name)){
          toast("请选择 CSV 或 TXT 格式的文件","error");
          aiCsvFile.value = "";
          if(aiCsvName) aiCsvName.textContent = "未选择文件";
          return;
        }
        if(aiCsvName) aiCsvName.textContent = f?.name || "未选择文件";
      });

      // 下载补豆商城专用模板（第二列为克数）
      document.getElementById("aiDownloadTemplate")?.addEventListener("click", ()=>{
        _downloadShopCsvTemplate();
      });

      // 提交按钮 — 先检查购物车是否有数据
      let _pendingMergeMode = "append"; // "append" 或 "overwrite"
      document.getElementById("aiSmartSubmit")?.addEventListener("click", ()=>{
        // 先做基本校验（避免空内容时弹合并弹窗）
        if(_aiActiveTab === "ai-text"){
          const t = (document.getElementById("aiTextInput")?.value || "").trim();
          if(!t){ toast("请输入补豆需求文本","info"); return; }
        } else if(_aiActiveTab === "ai-image"){
          const f = document.getElementById("aiImageFile");
          if(!f || !f.files || !f.files[0]){ toast("请选择图片","info"); return; }
        } else if(_aiActiveTab === "ai-csv"){
          const f = document.getElementById("aiCsvFile");
          if(!f || !f.files || !f.files[0]){ toast("请选择CSV文件","info"); return; }
        }

        // 判断购物车是否为空
        const hasCart = Object.values(_beadShopQty).some(q => q > 0);
        if(!hasCart){
          _pendingMergeMode = "append";
          _executeAiSubmit();
        } else {
          // 弹出合并模式确认
          const sheet = document.getElementById("cartMergeModeSheet");
          if(sheet) sheet.classList.add("active");
        }
      });

      // 合并模式弹窗事件
      document.getElementById("cartMergeModeCancel")?.addEventListener("click", ()=>{
        document.getElementById("cartMergeModeSheet")?.classList.remove("active");
      });
      document.getElementById("cartMergeModeSheetOverlay")?.addEventListener("click", ()=>{
        document.getElementById("cartMergeModeSheet")?.classList.remove("active");
      });
      document.getElementById("cartMergeModeAppend")?.addEventListener("click", ()=>{
        document.getElementById("cartMergeModeSheet")?.classList.remove("active");
        _pendingMergeMode = "append";
        _executeAiSubmit();
      });
      document.getElementById("cartMergeModeOverwrite")?.addEventListener("click", ()=>{
        document.getElementById("cartMergeModeSheet")?.classList.remove("active");
        _pendingMergeMode = "overwrite";
        _executeAiSubmit();
      });

      async function _executeAiSubmit(){
        if(_aiActiveTab === "ai-text"){
          await _handleAiTextSubmit();
        } else if(_aiActiveTab === "ai-image"){
          await _handleAiImageSubmit();
        } else if(_aiActiveTab === "ai-csv"){
          _handleAiCsvSubmit();
        }
      }

      // AI warning 弹窗
      const warnSheet = document.getElementById("aiWarningSheet");
      const warnOverlay = document.getElementById("aiWarningSheetOverlay");
      const warnClose = document.getElementById("aiWarningClose");
      warnOverlay?.addEventListener("click", ()=>{ if(warnSheet) warnSheet.classList.remove("active"); });
      warnClose?.addEventListener("click", ()=>{ if(warnSheet) warnSheet.classList.remove("active"); });

      /** 将识别/解析后的 items 应用到购物车，根据 _pendingMergeMode 决定累加或覆盖 */
      /** 返回 { changedCodes: string[], skippedCodes: string[] } */
      function _applyItemsToCart(items){
        // 覆盖模式：先清空购物车
        if(_pendingMergeMode === "overwrite"){
          const oldCodes = Object.keys(_beadShopQty);
          for(const k of Object.keys(_beadShopQty)) delete _beadShopQty[k];
          oldCodes.forEach(code => _syncMainListRow(code));
        }

        const changedCodes = [];
        const skippedCodes = [];
        items.forEach(item => {
          const code = String(item.code || "").toUpperCase();
          const qty = parseInt(item.qty, 10) || 0;
          if(!code || qty <= 0) return;
          if(_isCodeDisabled(code)){ skippedCodes.push(code); return; }
          const prev = _beadShopQty[code] || 0;
          const sum = prev + qty;
          const clampedQty = Math.min(Math.max(sum, 10), BEAD_SHOP_MAX);
          _beadShopQty[code] = clampedQty;
          changedCodes.push(code);
        });
        if(skippedCodes.length > 0) toast("部分色号已下架，已自动跳过", "warn");
        _saveShopQty();
        return { changedCodes, skippedCodes };
      }

      /** AI识文字提交 */
      async function _handleAiTextSubmit(){
        const textInput = document.getElementById("aiTextInput");
        const text = (textInput?.value || "").trim();
        if(!text){
          toast("请输入补豆需求文本","info");
          return;
        }

        // 禁用按钮 + 加载弹窗
        if(submitBtn) submitBtn.disabled = true;
        showGlobalLoading("AI识别中，请稍候…");

        try{
          const res = await apiPost("/api/shop/ai-text", { text });
          if(!res.ok){
            toast(res.message || "识别失败","error");
            return;
          }

          const items = Array.isArray(res.items) ? res.items : [];
          if(items.length === 0 && !res.warning){
            toast("未识别到有效色号","info");
            return;
          }

          // 将结果应用到购物车
          const { changedCodes } = _applyItemsToCart(items);

          // 清空输入框
          if(textInput) textInput.value = "";

          // 关闭AI弹层
          _closeAiSmartSheet();

          // 同步列表UI
          changedCodes.forEach(code => _syncMainListRow(code));
          _updateShopFooter();

          // 展开购物车
          if(changedCodes.length > 0){
            _openCartSheet();
            toast("已识别 " + changedCodes.length + " 个色号","success");
          }

          // 如果有 warning，延迟弹出提示
          if(res.warning){
            setTimeout(()=>{
              const warnText = document.getElementById("aiWarningText");
              if(warnText) warnText.textContent = res.warning;
              if(warnSheet) warnSheet.classList.add("active");
            }, 400);
          }
        } catch(e){
          toast(typeof formatUploadError === "function" ? formatUploadError(e, "AI识别失败，请重试") : (e?.message || "AI识别失败，请重试"), "error");
        } finally {
          if(submitBtn) submitBtn.disabled = false;
          hideGlobalLoading();
        }
      }

      /** AI识图提交 */
      async function _handleAiImageSubmit(){
        const fileInput = document.getElementById("aiImageFile");
        if(!fileInput || !fileInput.files || !fileInput.files[0]){
          toast("请选择图片","info");
          return;
        }

        const file = fileInput.files[0];

        // 前端校验文件大小（与后端 multer 限制一致：5MB）
        const MAX_AI_IMAGE_SIZE = 5 * 1024 * 1024;
        if(file.size > MAX_AI_IMAGE_SIZE){
          const sizeMB = (file.size / 1024 / 1024).toFixed(1);
          toast(`图片太大（${sizeMB}MB），最大支持 5MB，请压缩后重试`, "error");
          return;
        }

        const formData = new FormData();
        formData.append("image", file);

        // 禁用按钮 + 加载弹窗
        if(submitBtn) submitBtn.disabled = true;
        showGlobalLoading("AI识别中，请稍候…");

        try{
          const res = await apiPostForm("/api/shop/ai-image", formData);
          if(!res.ok){
            toast(typeof formatUploadError === "function" ? formatUploadError({ message: res.message, errorCode: res.errorCode, traceId: res.traceId }, "识别失败") : (res.message || "识别失败"), "error");
            return;
          }

          const items = Array.isArray(res.items) ? res.items : [];
          if(items.length === 0 && !res.warning){
            toast("未识别到有效色号","info");
            return;
          }

          // 将结果应用到购物车
          const { changedCodes } = _applyItemsToCart(items);

          // 清空文件选择
          fileInput.value = "";
          const aiImageName = document.getElementById("aiImageName");
          if(aiImageName) aiImageName.textContent = "未选择截图";

          // 关闭AI弹层
          _closeAiSmartSheet();

          // 同步列表UI
          changedCodes.forEach(code => _syncMainListRow(code));
          _updateShopFooter();

          // 展开购物车
          if(changedCodes.length > 0){
            _openCartSheet();
            toast("已识别 " + changedCodes.length + " 个色号","success");
          }

          // 如果有 warning，延迟弹出提示
          if(res.warning){
            setTimeout(()=>{
              const warnText = document.getElementById("aiWarningText");
              if(warnText) warnText.textContent = res.warning;
              if(warnSheet) warnSheet.classList.add("active");
            }, 400);
          }
        } catch(e){
          toast(typeof formatUploadError === "function" ? formatUploadError(e, "AI识别失败，请重试") : (e?.message || "AI识别失败，请重试"), "error");
        } finally {
          if(submitBtn) submitBtn.disabled = false;
          hideGlobalLoading();
        }
      }

      /** 模板上传（CSV）提交 — 纯前端解析 */
      function _handleAiCsvSubmit(){
        const fileInput = document.getElementById("aiCsvFile");
        if(!fileInput || !fileInput.files || !fileInput.files[0]){
          toast("请选择CSV文件","info");
          return;
        }
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function(e){
          const text = e.target.result || "";
          _parseCsvAndFillCart(text);
          // 清空文件选择
          fileInput.value = "";
          const aiCsvName = document.getElementById("aiCsvName");
          if(aiCsvName) aiCsvName.textContent = "未选择文件";
        };
        reader.onerror = function(){
          toast("文件读取失败","error");
        };
        reader.readAsText(file);
      }

      /** 下载补豆商城专用 CSV 模板（第二列为克数） */
      function _downloadShopCsvTemplate(){
        if(S.DEFAULT_CODES.length === 0){
          toast("色号列表未加载，请稍后再试","error");
          return;
        }
        const rows = ["MARD色号,重量克数(g)"].concat(S.DEFAULT_CODES.slice().sort(sortCodes).map(code => `${code},0`));
        const csvContent = rows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "补豆克数上传模板.csv";
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast("模板已下载","success");
      }

      /** 解析 CSV 文本，校验并填入购物车（第二列按克数解析） */
      function _parseCsvAndFillCart(text){
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if(lines.length === 0){
          toast("CSV文件为空","info");
          return;
        }

        const validCodes = new Set(S.DEFAULT_CODES.map(c => c.toUpperCase()));
        const warnings = [];
        const deletedUnsupported = [];
        const deletedQtyIssue = [];
        const adjustedRound = [];
        const adjustedCap = [];

        // 合并同色号
        const merged = {};
        for(const line of lines){
          // 跳过表头
          if(/^(色号|MARD|code)/i.test(line)) continue;

          const parts = line.split(/[,，\t]+/);
          const rawCode = (parts[0] || "").trim().toUpperCase();
          // 第二列为克数，兼容用户输入 "10g" / "10G" / "10 g"
          const rawQty = (parts[1] || "").trim().replace(/\s*[gG克]\s*$/, "");

          if(!rawCode) continue;

          // 色号校验
          if(!validCodes.has(rawCode)){
            deletedUnsupported.push(rawCode);
            continue;
          }

          // 克数解析（第二列直接按克数计）
          const grams = parseFloat(rawQty);
          if(!rawQty || isNaN(grams)){
            deletedQtyIssue.push("【" + rawCode + ":无法解析】");
            continue;
          }
          if(grams <= 0){
            deletedQtyIssue.push("【" + rawCode + ":克数为0】");
            continue;
          }

          merged[rawCode] = (merged[rawCode] || 0) + grams;
        }

        // 取整 & 截断
        const items = [];
        const codes = Object.keys(merged).sort();
        for(const code of codes){
          let g = merged[code];
          // 截断上限
          if(g > BEAD_SHOP_MAX){
            g = BEAD_SHOP_MAX;
            adjustedCap.push("【" + code + ":" + BEAD_SHOP_MAX + "g】");
          }
          // 近1法取整到10的倍数
          const rounded = Math.ceil(g / BEAD_SHOP_STEP) * BEAD_SHOP_STEP;
          if(rounded !== g){
            adjustedRound.push("【" + code + ":" + rounded + "g】");
          }
          // 再次截断（取整后可能超上限）
          const final = Math.min(rounded, BEAD_SHOP_MAX);
          if(final <= 0) continue;
          items.push({ code, qty: final });
        }

        if(items.length === 0 && deletedUnsupported.length === 0 && deletedQtyIssue.length === 0){
          toast("CSV中未找到有效色号数据","info");
          return;
        }

        // 填入购物车
        const { changedCodes, skippedCodes } = _applyItemsToCart(items);

        // 关闭弹层
        _closeAiSmartSheet();

        // 同步UI
        changedCodes.forEach(code => _syncMainListRow(code));
        _updateShopFooter();

        if(changedCodes.length > 0){
          _openCartSheet();
          toast("已导入 " + changedCodes.length + " 个色号","success");
        }

        // 生成 warning
        const warnParts = [];
        if(skippedCodes.length > 0){
          warnParts.push("以下色号已下架，已自动跳过：" + skippedCodes.join("、"));
        }
        if(deletedUnsupported.length > 0 || deletedQtyIssue.length > 0){
          const all = [];
          deletedUnsupported.forEach(c => all.push(c));
          deletedQtyIssue.forEach(c => all.push(c));
          warnParts.push("以下色号已自动删除：" + all.join("、"));
        }
        if(adjustedRound.length > 0){
          warnParts.push("以下色号数量不是10的倍数已自动调整：" + adjustedRound.join("、"));
        }
        if(adjustedCap.length > 0){
          warnParts.push("以下色号超出最大规格已自动修改数量：" + adjustedCap.join("、"));
        }

        if(warnParts.length > 0){
          setTimeout(()=>{
            const warnText = document.getElementById("aiWarningText");
            if(warnText) warnText.textContent = warnParts.join("；");
            if(warnSheet) warnSheet.classList.add("active");
          }, 400);
        }
      }
    }

    function _bindCartSheetEvents(){
      const overlay = document.getElementById("shopCartOverlay");
      if(!overlay) return;

      // 购物车图标点击（toggle）
      document.getElementById("beadShopCartBtn")?.addEventListener("click", _toggleCartSheet);
      // 查看明细/收起明细按钮点击（toggle）
      document.getElementById("beadShopDetailBtn")?.addEventListener("click", _toggleCartSheet);

      // 关闭按钮
      document.getElementById("shopCartSheetClose")?.addEventListener("click", _closeCartSheet);

      // 清空购物车
      document.getElementById("shopCartSheetClear")?.addEventListener("click", ()=>{
        if(Object.keys(_beadShopQty).length === 0) return;
        // 清空数据
        const codes = Object.keys(_beadShopQty);
        _beadShopQty = {};
        _saveShopQty();
        // 同步主列表所有行
        codes.forEach(code => _syncMainListRow(code));
        // 更新 footer 和弹层
        _updateShopFooter();
        _renderCartSheet();
        toast("已清空购物车","success");
      });

      // 点击蒙层关闭
      overlay.addEventListener("click", e => {
        if(e.target === overlay) _closeCartSheet();
      });
    }

    /* ---- 规格选择弹窗 ---- */
    function _openShopSpec(code, row){
      _shopSpecTarget = { code, row };
      const overlay = document.getElementById("shopSpecOverlay");
      if(!overlay) return;

      // 高亮当前已选克数
      const currentQty = _beadShopQty[code] || 0;
      overlay.querySelectorAll(".shop-spec-opt").forEach(btn => {
        btn.classList.toggle("selected", Number(btn.dataset.g) === currentQty);
      });

      overlay.classList.add("open");
    }

    function _closeShopSpec(){
      const overlay = document.getElementById("shopSpecOverlay");
      if(overlay) overlay.classList.remove("open");
      _shopSpecTarget = null;
    }

    function _onShopSpecPick(grams){
      if(!_shopSpecTarget) return;
      const { code, row } = _shopSpecTarget;

      if(_isCodeDisabled(code)){
        toast("抓紧补货中...", "warn");
        _closeShopSpec();
        return;
      }

      // 直接设置克数（覆盖）
      if(grams === 0){
        delete _beadShopQty[code];
      } else {
        _beadShopQty[code] = grams;
      }
      _saveShopQty();

      // 更新行内 UI
      if(row){
        const qtyEl = row.querySelector(".bead-shop-qty");
        const minusBtn = row.querySelector(".bead-shop-btn.minus");
        const plusBtn = row.querySelector(".bead-shop-btn.plus");
        if(qtyEl){
          qtyEl.textContent = grams + "g";
          qtyEl.classList.toggle("has-value", grams > 0);
        }
        if(minusBtn) minusBtn.disabled = grams <= BEAD_SHOP_MIN;
        if(plusBtn) plusBtn.disabled = grams >= BEAD_SHOP_MAX;
      }

      // 同步主列表和购物车弹层
      _syncMainListRow(code);
      if(document.getElementById("shopCartOverlay")?.classList.contains("open")){
        _renderCartSheet();
      }

      _updateShopFooter();
      _closeShopSpec();
    }

    // 绑定弹窗事件（页面加载后调用一次）
    function _bindShopSpecEvents(){
      const overlay = document.getElementById("shopSpecOverlay");
      if(!overlay) return;

      // 关闭按钮
      document.getElementById("shopSpecClose")?.addEventListener("click", _closeShopSpec);

      // 点击蒙层关闭
      overlay.addEventListener("click", e => {
        if(e.target === overlay) _closeShopSpec();
      });

      // 选项按钮
      overlay.querySelectorAll(".shop-spec-opt").forEach(btn => {
        btn.addEventListener("click", () => {
          _onShopSpecPick(Number(btn.dataset.g));
        });
      });
    }

    /* ---- 一键加购弹窗 ---- */
    let _bulkAddSeries = null; // 当前一键加购对应的色系

    function _openBulkAddSpec(series){
      _bulkAddSeries = series;
      const overlay = document.getElementById("bulkAddSpecOverlay");
      if(!overlay) return;
      // 清除之前的选中状态
      overlay.querySelectorAll(".shop-spec-opt").forEach(btn => btn.classList.remove("selected"));
      overlay.classList.add("open");
    }

    function _closeBulkAddSpec(){
      const overlay = document.getElementById("bulkAddSpecOverlay");
      if(overlay) overlay.classList.remove("open");
      _bulkAddSeries = null;
    }

    function _onBulkAddSpecPick(grams){
      if(!_bulkAddSeries) return;
      const codes = _getShopCodes(_bulkAddSeries);
      // 检查是否所有色号都被下架
      const enabledCodes = codes.filter(c => !_isCodeDisabled(c));
      if(enabledCodes.length === 0 && codes.length > 0){
        toast("抓紧补货中...", "warn");
        _closeBulkAddSpec();
        return;
      }
      const hasDisabled = enabledCodes.length < codes.length;
      // 将当前分类下可用的色号设置为所选规格（跳过已下架色系）
      enabledCodes.forEach(code => {
        if(grams === 0){
          delete _beadShopQty[code];
        } else {
          _beadShopQty[code] = grams;
        }
      });
      _saveShopQty();

      // 同步列表中每行的 UI
      const mainContainer = document.getElementById("beadShopList");
      if(mainContainer){
        enabledCodes.forEach(code => {
          const row = mainContainer.querySelector(`.bead-shop-row[data-code="${code}"]`);
          if(!row) return;
          const qty = _beadShopQty[code] || 0;
          const qtyEl = row.querySelector(".bead-shop-qty");
          const minusBtn = row.querySelector(".bead-shop-btn.minus");
          const plusBtn = row.querySelector(".bead-shop-btn.plus");
          if(qtyEl){
            qtyEl.textContent = qty + "g";
            qtyEl.classList.toggle("has-value", qty > 0);
          }
          if(minusBtn) minusBtn.disabled = qty <= BEAD_SHOP_MIN;
          if(plusBtn) plusBtn.disabled = qty >= BEAD_SHOP_MAX;
        });
      }

      // 同步购物车弹层（如果打开了）
      if(document.getElementById("shopCartOverlay")?.classList.contains("open")){
        _renderCartSheet();
      }

      _updateShopFooter();
      _closeBulkAddSpec();
    }

    function _bindBulkAddSpecEvents(){
      const overlay = document.getElementById("bulkAddSpecOverlay");
      if(!overlay) return;
      document.getElementById("bulkAddSpecClose")?.addEventListener("click", _closeBulkAddSpec);
      overlay.addEventListener("click", e => {
        if(e.target === overlay) _closeBulkAddSpec();
      });
      overlay.querySelectorAll(".shop-spec-opt").forEach(btn => {
        btn.addEventListener("click", () => {
          _onBulkAddSpecPick(Number(btn.dataset.g));
        });
      });
    }

    /* ---- 结算页 ---- */
    const ORDER_SPECS = [100, 50, 20, 10]; // 常规规格从大到小
    const SPECIAL_SERIES_PREFIXES = ["Q", "Y", "Z"]; // 特殊系列（功能色）：只有10g规格，价格不同
    const SPEC_SPECIAL_KEY = "10s"; // 特殊10g的键名

    /** 判断色号是否属于特殊系列 */
    function _isSpecialCode(code){
      const upper = String(code).toUpperCase();
      return SPECIAL_SERIES_PREFIXES.some(p => upper.startsWith(p) && /\d/.test(upper.charAt(p.length)));
    }

    let _modifyingOrderCode = null; // 修改模式下记住的口令

    /** 根据是否处于修改模式，同步底部结算按钮和确认弹窗的文案 */
    function _syncShopModifyUI(){
      const isModify = !!_modifyingOrderCode;
      const nextBtn = document.getElementById("beadShopNext");
      if(nextBtn) nextBtn.textContent = isModify ? "更新清单" : "去结算";
      const sheetTitle = document.querySelector("#checkoutConfirmSheet .bottom-sheet-header h3");
      if(sheetTitle) sheetTitle.textContent = isModify ? "确认更新" : "确认结算";
      const sheetText = document.querySelector("#checkoutConfirmSheet .sheet-confirm-text");
      if(sheetText) sheetText.textContent = isModify ? "是否确认更新补豆清单？" : "是否确认补豆清单并生成补豆口令？";
      const cancelBtn = document.getElementById("checkoutConfirmCancel");
      if(cancelBtn) cancelBtn.textContent = "继续选购";
      const submitBtn = document.getElementById("checkoutConfirmSubmit");
      if(submitBtn) submitBtn.textContent = isModify ? "确认更新" : "生成口令";
    }

    function _generateOrderCode(){
      const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
      const seg = () => Array.from({length:4}, ()=> chars[Math.floor(Math.random()*chars.length)]).join("");
      return seg() + "-" + seg() + "-" + seg() + "-" + seg();
    }

    /** 获取当前可用的常规规格列表（从大到小），10g始终可用 */
    function _getAvailableOrderSpecs(){
      return ORDER_SPECS.filter(sp => sp === 10 || _availableSpecs[sp]);
    }

    /** 拆分单个色号的克数为最优规格组合（贪心：优先大规格） */
    function _splitWeight(grams, isSpecial){
      const result = {};
      if(isSpecial){
        // 特殊系列只有10g规格，用 "10s" 键区分
        const count = Math.floor(grams / 10);
        if(count > 0) result[SPEC_SPECIAL_KEY] = count;
        return result;
      }
      const specs = _getAvailableOrderSpecs();
      let remaining = grams;
      for(const spec of specs){
        const count = Math.floor(remaining / spec);
        if(count > 0) result[spec] = count;
        remaining = remaining % spec;
      }
      return result;
    }

    /** 所有规格键（含特殊），用于遍历 */
    const ALL_SPEC_KEYS = [100, 50, 20, 10, SPEC_SPECIAL_KEY];

    /** 对所有色号拆分并汇总 */
    function _buildOrderPlan(entries){
      const perItem = []; // [{code, qty, split: {100:n, 50:n, "10s":n, ...}}]
      const specTotals = {100:0, 50:0, 20:0, 10:0, [SPEC_SPECIAL_KEY]:0};
      entries.forEach(([code, qty]) => {
        const isSpecial = _isSpecialCode(code);
        const split = _splitWeight(qty, isSpecial);
        perItem.push({code, qty, split});
        for(const spec of ALL_SPEC_KEYS){
          specTotals[spec] += (split[spec] || 0);
        }
      });
      return {perItem, specTotals};
    }

    /** 格式化时间为 YYYY-MM-DD HH:mm:ss */
    function _formatSubmitTime(val){
      if(!val) return "----";
      const d = val instanceof Date ? val : new Date(val);
      if(isNaN(d.getTime())) return "----";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const h = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      const s = String(d.getSeconds()).padStart(2, "0");
      return `${y}-${m}-${day} ${h}:${min}:${s}`;
    }

    /** 渲染结算页的所有动态内容
     * @param {string} code - 口令
     * @param {Array} entries - [[code,qty]] 或 [{code,qty}]
     * @param {string} status - "pending" | "confirmed"
     * @param {*} submitTime - 提交时间
     * @param {Object} [savedPlan] - 从服务端获取的已保存方案，有则直接使用
     */
    let _lastCheckoutEntries = []; // 缓存结算页的商品列表，供"修改清单"回填购物车

    function _renderCheckoutUI(code, entries, status, submitTime, savedPlan){
      // 缓存当前订单的商品
      _lastCheckoutEntries = (entries || []).map(e => Array.isArray(e) ? { code: e[0], qty: e[1] } : e);
      const st = status || "pending"; // "pending" | "confirmed"

      // 口令
      const codeEl = document.getElementById("checkoutCode");
      if(codeEl) codeEl.textContent = code;

      // 最后提交时间
      const submitTimeEl = document.getElementById("checkoutSubmitTime");
      if(submitTimeEl) submitTimeEl.textContent = "最后提交时间：" + _formatSubmitTime(submitTime);

      // 状态区
      const statusCard = document.getElementById("checkoutStatusCard");
      const statusTitle = document.getElementById("checkoutStatusTitle");
      const statusSub = document.getElementById("checkoutStatusSub");
      const statusIcon = statusCard?.querySelector(".checkout-status-icon");
      if(statusCard) statusCard.dataset.status = st === "confirmed" ? "confirmed" : "pending";
      if(statusTitle) statusTitle.textContent = st === "confirmed" ? "当前状态：客服已确认" : "当前状态：待客服确认";
      if(statusSub) statusSub.textContent = st === "confirmed" ? "客服已确认，无法修改补豆清单" : "客服确认前可随时修改补豆清单";
      if(statusIcon){
        statusIcon.innerHTML = st === "confirmed"
          ? '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 10"/></svg>'
          : '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      }

      // 提示文案：根据状态显示不同文案
      const tipBox = document.getElementById("checkoutTipText");
      if(tipBox){
        const tipSpan = tipBox.querySelector(".checkout-alert-text");
        if(tipSpan) tipSpan.innerHTML = st === "confirmed" ? "补豆清单已审核，商品会尽快发出，请耐心等待~" : "请保存补豆口令并仔细确认色号与份数，核对无误后发送口令给店铺客服，快速提交补豆清单；如需修改请点击右上角【修改清单】，<strong>返回上一页会清空购物车。</strong>";
      }

      // 修改按钮：confirmed 时置灰但不隐藏
      const modifyBtn = document.getElementById("checkoutModifyBtn");
      if(modifyBtn){
        modifyBtn.disabled = st === "confirmed";
        modifyBtn.style.opacity = st === "confirmed" ? "0.4" : "";
        modifyBtn.style.cursor = st === "confirmed" ? "not-allowed" : "";
      }

      // 统计
      const _ckSorter = _shopBrandType === "catshop" ? _sortCatshopCodes : sortCodes;
      entries.sort((a,b) => _ckSorter(a[0] || a.code, b[0] || b.code));
      // entries 可能是 [[code,qty]] 也可能是 [{code,qty}]
      const normalized = entries.map(e => Array.isArray(e) ? [e[0], e[1]] : [e.code, e.qty]);
      const totalQty = normalized.reduce((s,[,q]) => s + q, 0);
      const colorCount = normalized.length;

      // 拆分方案：优先使用已保存的方案，兜底实时计算（兼容旧数据）
      const plan = savedPlan || _buildOrderPlan(normalized);

      // 总份数 = 各规格份数之和（含特殊10g）
      const totalParts = ALL_SPEC_KEYS.reduce((s, spec) => s + (plan.specTotals[spec] || 0), 0);

      const countEl = document.getElementById("checkoutColorCount");
      const weightEl = document.getElementById("checkoutTotalWeight");
      if(countEl) countEl.textContent = colorCount;
      if(weightEl) weightEl.textContent = totalQty.toLocaleString() + "g";

      // 下单方案：商品卡片
      const SPEC_PRODUCT_INFO = {
        10:  { name: "补充装10g左右*1份/约1000粒", price: 1.5, img: "img/shop-10g.webp" },
        20:  { name: "补充装20g左右*1份/约2000粒", price: 2.8, img: "img/shop-20g.webp" },
        50:  { name: "补充装50g左右*1份/约5000粒", price: 6.9, img: "img/shop-50g.webp" },
        100: { name: "补充装100g左右*1份/约10000粒", price: 13.8, img: "img/shop-100g.webp" },
        [SPEC_SPECIAL_KEY]: { name: "功能色补充装*1份/10g左右约1000粒", price: 3.4, img: "img/shop-10g-special.webp" },
      };
      const specDisplayOrder = [10, 20, 50, 100, SPEC_SPECIAL_KEY];
      const specsContainer = document.getElementById("checkoutPlanSpecs");
      let totalPrice = 0;
      if(specsContainer){
        specsContainer.innerHTML = "";
        specDisplayOrder.forEach(spec => {
          const count = plan.specTotals[spec] || 0;
          if(count === 0) return;
          const info = SPEC_PRODUCT_INFO[spec];
          if(!info) return;
          const subtotal = +(info.price * count).toFixed(1);
          totalPrice += subtotal;

          const card = document.createElement("div");
          card.className = "checkout-product-card";
          const dataSpec = spec === SPEC_SPECIAL_KEY ? "10s" : String(spec);
          card.dataset.spec = dataSpec;

          card.innerHTML = `
            <img class="checkout-product-img" src="${escapeHtml(info.img)}" alt="${escapeHtml(info.name)}">
            <div class="checkout-product-info">
              <div class="checkout-product-name">${escapeHtml(info.name)}</div>
              <div class="checkout-product-meta">
                <span class="checkout-product-price">单价：¥${escapeHtml(info.price)}　总价：¥${escapeHtml(subtotal)}</span>
                <span class="checkout-product-total">份数：<em>${escapeHtml(count)}</em></span>
              </div>
            </div>`;
          specsContainer.appendChild(card);
        });
      }
      // 方案汇总 — 复用 checkout-stat-pill 样式
      const summaryEl = document.getElementById("checkoutPlanSummary");
      if(summaryEl){
        summaryEl.innerHTML = `
          <span class="checkout-stat-pill">总重量<strong>${totalQty}g</strong></span>
          <span class="checkout-stat-pill">总价格<strong>¥${totalPrice.toFixed(1)}</strong><div class="checkout-plan-shipping-tip">非偏远地区满60元包邮</div></span>`;
      }

      // 渲染矩阵表格
      const matrixEl = document.getElementById("checkoutMatrix");
      if(matrixEl){
        const table = document.createElement("table");
        // 表头：色号与色块列左对齐，合并前两列
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        const thColor = document.createElement("th");
        thColor.setAttribute("colspan", "2");
        thColor.textContent = _shopBrandType === "catshop" ? "色号（猫咪家）" : "色号（MARD）";
        headerRow.appendChild(thColor);
        // 矩阵列：根据可用规格动态生成（10g始终显示）
        const matrixSpecs = _getAvailableOrderSpecs().slice().sort((a,b) => a - b);
        matrixSpecs.forEach(spec => {
          const th = document.createElement("th");
          th.textContent = spec + "g";
          headerRow.appendChild(th);
        });
        const thTotal = document.createElement("th");
        thTotal.textContent = "总重量";
        headerRow.appendChild(thTotal);
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // 表体
        const tbody = document.createElement("tbody");
        plan.perItem.forEach(({code, qty, split}) => {
          const tr = document.createElement("tr");
          // 色块
          const tdSwatch = document.createElement("td");
          const swatch = document.createElement("span");
          swatch.className = "matrix-swatch";
          swatch.style.backgroundColor = S.MASTER_HEX[code] || "#777";
          tdSwatch.appendChild(swatch);
          tr.appendChild(tdSwatch);
          // 色号
          const tdCode = document.createElement("td");
          tdCode.textContent = _displayCode(code);
          tr.appendChild(tdCode);
          // 各规格数量（10g列合并普通+特殊）
          matrixSpecs.forEach(spec => {
            const td = document.createElement("td");
            let count = split[spec] || 0;
            // 10g 列合并特殊系列的10g
            if(spec === 10) count += (split[SPEC_SPECIAL_KEY] || 0);
            if(count > 0){
              const badge = document.createElement("span");
              badge.className = "matrix-qty";
              // 特殊系列10g用特殊颜色
              const isSpecialOnly = spec === 10 && (split[10] || 0) === 0 && (split[SPEC_SPECIAL_KEY] || 0) > 0;
              badge.dataset.spec = isSpecialOnly ? "10s" : spec;
              badge.textContent = count;
              td.appendChild(badge);
            }
            tr.appendChild(td);
          });
          // 总重量
          const tdTotal = document.createElement("td");
          tdTotal.textContent = qty + "g";
          tr.appendChild(tdTotal);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        matrixEl.innerHTML = "";
        matrixEl.appendChild(table);
      }

      // 生成二维码
      _generateCheckoutQR(code);
    }

    async function _generateCheckoutQR(code){
      const container = document.getElementById("checkoutQR");
      if(!container) return;
      container.innerHTML = "";
      try{
        await loadQRCodeLibrary();
        new QRCode(container, {
          text: code,
          width: 100,
          height: 100,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      }catch(e){
        container.textContent = "二维码生成失败";
      }
    }

    let _checkoutSubmitting = false; // 防止重复提交
    async function _goCheckout(){
      if(_checkoutSubmitting) return;
      _checkoutSubmitting = true;
      try{
        await _doCheckout();
      }finally{
        _checkoutSubmitting = false;
      }
    }
    async function _doCheckout(){
      const entries = Object.entries(_beadShopQty).filter(([,q]) => q > 0);
      if(entries.length === 0){
        toast("请先选择商品","info");
        return;
      }

      // 修改模式：提交前先检查订单是否已被客服确认
      let code;
      const isModifyFlow = !!_modifyingOrderCode;
      if(isModifyFlow){
        code = _modifyingOrderCode;
        try{
          const chk = await apiGet("/api/shop/order/" + encodeURIComponent(code));
          if(chk.ok && chk.data && chk.data.status === "confirmed"){
            toast("客服已确认该订单，无法修改","error");
            _modifyingOrderCode = null;
            _syncShopModifyUI();
            _initCheckoutPage();
            const pageEl = document.getElementById("pageBeadCheckout");
            if(pageEl) pageEl.dataset.backTo = "bead-shop";
            showPage("bead-checkout", {scrollTop:true});
            _renderCheckoutUI(chk.data.code, chk.data.items || [], "confirmed", chk.data.updatedAt || chk.data.createdAt, chk.data.plan || null);
            try{ localStorage.setItem(CHECKOUT_CODE_KEY, code); }catch{}
            return;
          }
        }catch{
          // 网络异常不阻断，后端会在保存时二次校验
        }
      } else {
        code = _generateOrderCode();
      }

      const _submitSorter = _shopBrandType === "catshop" ? _sortCatshopCodes : sortCodes;
      entries.sort((a,b) => _submitSorter(a[0], b[0]));
      const totalQty = entries.reduce((sum,[,q]) => sum+q, 0);
      const colorCount = entries.length;
      const plan = _buildOrderPlan(entries);

      const items = entries.map(e => Array.isArray(e) ? { code: e[0], qty: e[1] } : e);
      const planData = plan ? {
        specTotals: plan.specTotals,
        perItem: plan.perItem.map(p => ({ code: p.code, qty: p.qty, split: p.split })),
      } : null;

      // 先保存到服务端，成功后再展示口令
      showGlobalLoading("正在生成补豆口令…");
      const MAX_RETRY = 2;
      let savedCode = null;
      for(let i = 0; i <= MAX_RETRY; i++){
        try{
          const saveRes = await apiPost("/api/shop/order", {
            code,
            items,
            totalQty,
            colorCount,
            plan: planData,
            brandType: _shopBrandType,
          });
          if (!saveRes || saveRes.ok !== true || !saveRes.id) {
            throw new Error("订单保存未确认");
          }
          savedCode = code;
          break;
        } catch(e){
          if(e.httpStatus === 403){
            hideGlobalLoading();
            toast("客服已确认，无法修改","error");
            _initCheckoutPage();
            const pageEl = document.getElementById("pageBeadCheckout");
            if(pageEl) pageEl.dataset.backTo = "bead-shop";
            showPage("bead-checkout", {scrollTop:true});
            _renderCheckoutUI(code, entries, "confirmed", new Date());
            return;
          }
          if(e.httpStatus === 409 && i < MAX_RETRY && !isModifyFlow){
            code = _generateOrderCode();
          } else {
            hideGlobalLoading();
            toast("补豆口令生成失败，请检查网络后重试","error");
            return;
          }
        }
      }
      hideGlobalLoading();
      if(isModifyFlow){
        _modifyingOrderCode = null;
        _syncShopModifyUI();
      }

      // 服务端保存成功，清空购物车
      const clearedCodes = Object.keys(_beadShopQty);
      _beadShopQty = {};
      _saveShopQty();
      clearedCodes.forEach(c => _syncMainListRow(c));
      _updateShopFooter();

      // 渲染结算页展示口令
      _initCheckoutPage();
      const pageEl = document.getElementById("pageBeadCheckout");
      if(pageEl) pageEl.dataset.backTo = "bead-shop";
      showPage("bead-checkout", {scrollTop:true});
      _renderCheckoutUI(savedCode, entries, "pending", new Date(), plan);
      try{ localStorage.setItem(CHECKOUT_CODE_KEY, savedCode); }catch{}
    }

    /* ---- html2canvas 懒加载 ---- */
    let _h2cLoaded = false, _h2cLoadPromise = null;
    function _loadHtml2Canvas(){
      if(_h2cLoaded) return Promise.resolve();
      if(_h2cLoadPromise) return _h2cLoadPromise;
      _h2cLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/vendor/html2canvas/html2canvas.min.js";
        s.onload = ()=>{ _h2cLoaded = true; resolve(); };
        s.onerror = ()=>{ _h2cLoadPromise = null; reject(new Error("html2canvas 加载失败")); };
        document.head.appendChild(s);
      });
      return _h2cLoadPromise;
    }

    async function _downloadCheckoutImage(){
      const page = document.getElementById("pageBeadCheckout");
      const body = document.querySelector(".checkout-body");
      if(!body || !page) return;

      toast("正在生成图片…","info");
      let saves = null;
      try{
        await _loadHtml2Canvas();

        // 临时展开整个页面和滚动区域以完整截图
        saves = [
          [page, "height", page.style.height],
          [page, "overflow", page.style.overflow],
          [body, "overflow", body.style.overflow],
          [body, "height", body.style.height],
          [body, "flex", body.style.flex],
        ];
        page.style.height = "auto";
        page.style.overflow = "visible";
        body.style.overflow = "visible";
        body.style.height = "auto";
        body.style.flex = "none";

        // 等待重排
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const isDark = document.body.classList.contains("theme-dark");
        const canvas = await html2canvas(body, {
          backgroundColor: isDark ? "#0f1319" : "#f5f5f5",
          scale: 2,
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          height: body.scrollHeight,
          windowHeight: body.scrollHeight
        });

        const dataUrl = canvas.toDataURL("image/png");

        // 尝试直接下载（桌面端）
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if(!isIOS){
          const link = document.createElement("a");
          link.download = "补豆清单.png";
          link.href = dataUrl;
          link.click();
          toast("图片已保存","success");
          return;
        }

        // iOS / 移动端：弹出图片让用户长按保存
        _showSaveImageDialog(dataUrl);
      }catch(e){
        console.error(e);
        toast("图片生成失败，请截图保存","error");
      } finally {
        if (saves) {
          saves.forEach(([el, prop, val]) => { el.style[prop] = val; });
        }
      }
    }

    function _showSaveImageDialog(dataUrl){
      // 创建全屏蒙层 + 图片
      let overlay = document.getElementById("checkoutImgOverlay");
      if(!overlay){
        overlay = document.createElement("div");
        overlay.id = "checkoutImgOverlay";
        overlay.className = "checkout-img-overlay";
        overlay.innerHTML = '<div class="checkout-img-dialog"><p class="checkout-img-tip">长按图片保存到相册</p><img class="checkout-img-preview" /><button type="button" class="checkout-img-close">关闭</button></div>';
        document.body.appendChild(overlay);
        overlay.querySelector(".checkout-img-close").addEventListener("click", ()=>{
          overlay.classList.remove("open");
        });
        overlay.addEventListener("click", e=>{
          if(e.target === overlay) overlay.classList.remove("open");
        });
      }
      overlay.querySelector(".checkout-img-preview").src = dataUrl;
      overlay.classList.add("open");
    }

    let _checkoutPageInited = false;
    function _initCheckoutPage(){
      if(_checkoutPageInited) return;
      _checkoutPageInited = true;
      // 返回按钮
      document.getElementById("checkoutBack")?.addEventListener("click", ()=>{
        const backTarget = document.getElementById("pageBeadCheckout")?.dataset.backTo || "bead-shop";
        try{ localStorage.removeItem(CHECKOUT_CODE_KEY); }catch{}
        showPage(backTarget, {scrollTop:false});
      });

      // 修改清单按钮
      document.getElementById("checkoutModifyBtn")?.addEventListener("click", ()=>{
        // 已确认状态不允许修改
        const statusCard = document.getElementById("checkoutStatusCard");
        if(statusCard && statusCard.dataset.status === "confirmed"){
          toast("客服已确认，无法修改","error");
          return;
        }
        const code = document.getElementById("checkoutCode")?.textContent;
        if(code && code !== "----"){
          _modifyingOrderCode = code; // 记住口令，下次结算时复用
        }
        // 将订单商品回填到购物车
        if(_lastCheckoutEntries.length > 0){
          const oldCodes = Object.keys(_beadShopQty);
          _beadShopQty = {};
          _lastCheckoutEntries.forEach(e => {
            if(e.code && e.qty > 0) _beadShopQty[e.code] = e.qty;
          });
          _saveShopQty();
          // 若商城列表未初始化（如从查询历史直接进入结算页），先初始化再同步
          if(!_beadShopInited){
            initBeadShop();
          } else {
            // 同步商城列表每一行的 UI
            const allCodes = new Set([...oldCodes, ...Object.keys(_beadShopQty)]);
            allCodes.forEach(code => _syncMainListRow(code));
            _updateShopFooter();
          }
        }
        _syncShopModifyUI();
        showPage("bead-shop", {scrollTop:false});
        toast("修改完成后请重新提交","info");
      });

      // 复制口令
      document.getElementById("checkoutCopyCode")?.addEventListener("click", ()=>{
        const code = document.getElementById("checkoutCode")?.textContent;
        if(!code || code === "----") return;
        navigator.clipboard.writeText(code).then(()=>{
          toast("口令已复制","success");
        }).catch(()=>{
          toast("复制失败，请手动复制","error");
        });
      });

      // 下载补豆清单
      document.getElementById("checkoutDownload")?.addEventListener("click", ()=>{
        _downloadCheckoutImage();
      });

      // 前往店铺
      document.getElementById("checkoutGoShop")?.addEventListener("click", ()=>{
        const webUrl = "https://item.taobao.com/item.htm?id=958198082262";
        const schemeUrl = "taobao://item.taobao.com/item.htm?id=958198082262";
        let hidden = false;
        const onBlur = () => { hidden = true; };
        const onVisibilityChange = () => {
          if(document.hidden) hidden = true;
        };
        window.addEventListener("pagehide", onBlur);
        window.addEventListener("blur", onBlur);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.location.href = schemeUrl;
        setTimeout(()=>{
          window.removeEventListener("pagehide", onBlur);
          window.removeEventListener("blur", onBlur);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          if(!hidden){
            window.location.href = webUrl;
          }
        }, 800);
      });
    }

    /** 刷新后恢复 checkout 页：从 API 拉取订单数据 */
    async function _restoreCheckoutPage(code){
      initBrandPage();
      showPage("bead-brand", {scrollTop:false});
      try{
        const res = await apiGet("/api/shop/order/" + encodeURIComponent(code));
        if(res.ok && res.data){
          _renderCheckoutFromQuery(res.data);
        } else {
          try{ localStorage.removeItem(CHECKOUT_CODE_KEY); }catch{}
          initBeadShop();
          showPage("bead-shop", {scrollTop:false});
        }
      }catch{
        initBeadShop();
        showPage("bead-shop", {scrollTop:false});
      }
    }

    /** 商城子域名模式初始化（从 bootstrap IS_SHOP_MODE 块迁移） */
    function initShopMode(){
      document.documentElement.classList.remove("theme-dark");
      document.documentElement.classList.add("theme-light");
      document.body.classList.remove("theme-dark");
      document.body.classList.add("theme-light");

      const tabbar = document.getElementById("appTabbar");
      if(tabbar) tabbar.style.display = "none";

      const brandBackBtn = document.getElementById("brandBack");
      if(brandBackBtn) brandBackBtn.style.display = "none";

      const shopBanner = document.getElementById("shopBanner");
      if(shopBanner) {
        shopBanner.style.display = "block";
        shopBanner.addEventListener("click", () => {
          trackEvent("click", "shop_banner", { target: "aidoucang.cn" });
        }, { once: false });
      }

      document.title = "猫咪家拼豆商城";
      document.querySelectorAll(".brand-title, .bead-shop-title").forEach(el => {
        el.textContent = "猫咪家拼豆商城";
      });

      const shopSaved = (()=>{ try{ return localStorage.getItem(APP_PAGE_KEY); }catch{ return null; }})();

      if(shopSaved === "bead-checkout"){
        const checkoutCode = (()=>{ try{ return localStorage.getItem(CHECKOUT_CODE_KEY); }catch{ return null; }})();
        if(checkoutCode){
          initBrandPage();
          showPage("bead-brand", {scrollTop:false});
          _restoreCheckoutPage(checkoutCode);
          return;
        }
      }

      const shopRestorable = new Set(["bead-brand", "bead-shop"]);
      const shopTarget = shopRestorable.has(shopSaved) ? shopSaved : "bead-brand";

      initBrandPage();
      if(shopTarget === "bead-shop"){
        initBeadShop();
      }
      showPage(shopTarget, {scrollTop: shopTarget === "bead-brand"});
    }

    // 暴露商城函数供外部调用
    window.BeadsShop = {
      initBrandPage,
      initBeadShop,
      renderCheckoutFromQuery: _renderCheckoutFromQuery,
      restoreCheckoutPage: _restoreCheckoutPage,
      initShopMode,
    };

    // 独立部署：自动初始化
    document.addEventListener("DOMContentLoaded", () => initShopMode());
})();
