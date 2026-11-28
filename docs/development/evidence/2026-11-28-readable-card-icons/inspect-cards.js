(() => {
 const lum = css => {const [r,g,b]=css.match(/[0-9.]+/g).map(Number).map(v=>{let x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
 const contrast=(a,b)=>{const values=[lum(a),lum(b)].sort((l,r)=>r-l);return Number(((values[0]+.05)/(values[1]+.05)).toFixed(2))};
 const cards=['1','2','3','4'].map(id=>{
  const card=document.querySelector(`.ticket-card[data-ticket-id="${id}"]`);
  const name=card.querySelector('.ticket-link'); const idText=card.querySelector('.ticket-id');
  const idStyle=getComputedStyle(idText), bg=getComputedStyle(card).backgroundColor;
  return {id, resolved:card.classList.contains('resolved'), titleStart:Math.round(name.getBoundingClientRect().left-card.getBoundingClientRect().left), fg:idStyle.color,bg,fontSize:idStyle.fontSize, contrast:contrast(idStyle.color,bg),
      icons:[...card.querySelectorAll('.ticket-card-meta-icons > span')].map(el=>({className:el.className,label:el.getAttribute('aria-label'),title:el.title, svgSize:el.querySelector('svg')?.getBoundingClientRect().width}))};
 });
 return {dark:matchMedia('(prefers-color-scheme:dark)').matches,cards};
})()
