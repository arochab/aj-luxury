const sharp=require('sharp');
(async()=>{
 for(const f of process.argv.slice(2)){
  const {data,info}=await sharp(f).raw().toBuffer({resolveWithObject:true});
  const W=info.width-15;
  const lin=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
  const v=[];
  for(let y=27;y<=48;y++) for(let x=0;x<W;x++){const o=(y*info.width+x)*info.channels;
    v.push(0.2126*lin(data[o])+0.7152*lin(data[o+1])+0.0722*lin(data[o+2]));}
  v.sort((a,b)=>a-b);
  const p=(q)=>v[Math.min(v.length-1,Math.floor(q*v.length))];
  const cr=(Y)=>((1.05)/(Y+0.05));
  console.log(f.split(/[\/]/).pop().padEnd(34),
   `Ymax=${v[v.length-1].toFixed(4)} -> ${cr(v[v.length-1]).toFixed(2)}:1 |`,
   `Yp99.9=${p(0.999).toFixed(4)} -> ${cr(p(0.999)).toFixed(2)}:1 |`,
   `Yp99=${p(0.99).toFixed(4)} -> ${cr(p(0.99)).toFixed(2)}:1 |`,
   `Ymed=${p(0.5).toFixed(4)} -> ${cr(p(0.5)).toFixed(2)}:1`);
 }
})();
