import{c as o}from"./index-B15Jacgc.js";const d=o("Printer",[["polyline",{points:"6 9 6 2 18 2 18 9",key:"1306q4"}],["path",{d:"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",key:"143wyd"}],["rect",{width:"12",height:"8",x:"6",y:"14",key:"5ipwut"}]]),y=o("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]),h=a=>String(a??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),m=({title:a="Print",bodyHtml:c="",cssText:l="",width:p=980,height:r=760,onError:t=null,autoClose:s=!1}={})=>{const e=window.open("about:blank","_blank",`width=${p},height=${r}`);if(!e)return typeof t=="function"&&t("Popup blocked. Please allow popups to print."),!1;const f=`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${h(a)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
          ${l||""}
        </style>
      </head>
      <body>${c||""}</body>
    </html>
  `;try{e.document.open(),e.document.write(f),e.document.close()}catch{return typeof t=="function"&&t("Failed to prepare print window. Please try again."),!1}const i=()=>{try{e.focus(),e.print(),s&&(e.onafterprint=()=>{try{e.close()}catch{}})}catch{typeof t=="function"&&t("Print failed. Please use browser print from the opened page.")}};return e.document.readyState==="complete"?(setTimeout(i,250),!0):(e.onload=()=>setTimeout(i,250),!0)};export{d as P,y as R,h as e,m as p};
