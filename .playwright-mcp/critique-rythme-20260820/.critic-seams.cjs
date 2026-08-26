const sharp=require('sharp');
(async()=>{
 for(const f of process.argv.slice(2)){
  const {data,info}=await sharp(f).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width-15,H=info.height;
  const cols=[];
  for(let x=1;x<W;x++){
    let n=0;
    for(let y=0;y<H;y++){ if(Math.abs(data[y*info.width+x]-data[y*info.width+x-1])>8) n++; }
    cols.push({x, frac:n/H});
  }
  const coutures=cols.filter(c=>c.frac>0.80);
  // regroupe les colonnes adjacentes
  const grp=[]; let last=-9;
  coutures.forEach(c=>{ if(c.x-last>4) grp.push([]); grp[grp.length-1].push(c.x); last=c.x; });
  console.log(f.split(/[\/]/).pop().padEnd(24),
    'COUTURES VERTICALES pleine hauteur (>80% des rangees):', grp.length,
    grp.length? '-> x = '+grp.map(g=>g[0]).join(', '):'');
 }
})();
