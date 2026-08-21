const sharp=require('sharp');
(async()=>{
 for(const f of process.argv.slice(2)){
  const {data,info}=await sharp(f).resize(480,270,{fit:'fill'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height;
  let flat=0,tot=0;
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
    let s=0,s2=0,n=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const v=data[(y+dy)*W+(x+dx)];s+=v;s2+=v*v;n++;}
    const sd=Math.sqrt(Math.max(0,s2/n-(s/n)**2));
    tot++; if(sd<2.0) flat++;
  }
  console.log(f.split(/[\/]/).pop().padEnd(24), 'surface PLATE (aplat, sans detail) =', (100*flat/tot).toFixed(1)+'%');
 }
})();
