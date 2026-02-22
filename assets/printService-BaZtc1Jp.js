import{c as u}from"./index-DzGHLpa5.js";const m=u("Printer",[["polyline",{points:"6 9 6 2 18 2 18 9",key:"1306q4"}],["path",{d:"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",key:"143wyd"}],["rect",{width:"12",height:"8",x:"6",y:"14",key:"5ipwut"}]]),f=a=>String(a??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),y=({title:a="Print",bodyHtml:o="",cssText:l="",width:c=980,height:r=760,onError:e=null,autoClose:p=!1}={})=>{const t=window.open("about:blank","_blank",`width=${c},height=${r}`);if(!t)return typeof e=="function"&&e("Popup blocked. Please allow popups to print."),!1;const s=`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${f(a)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
          ${l||""}
        </style>
      </head>
      <body>${o||""}</body>
    </html>
  `;try{t.document.open(),t.document.write(s),t.document.close()}catch{return typeof e=="function"&&e("Failed to prepare print window. Please try again."),!1}const i=()=>{try{t.focus(),t.print(),p&&(t.onafterprint=()=>{try{t.close()}catch{}})}catch{typeof e=="function"&&e("Print failed. Please use browser print from the opened page.")}};return t.document.readyState==="complete"?(setTimeout(i,250),!0):(t.onload=()=>setTimeout(i,250),!0)};export{m as P,f as e,y as p};
