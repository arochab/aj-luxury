const sharp=require('sharp');
const f=process.argv[2];
const x0=parseInt(process.argv[3]||'1500'), x1=parseInt(process.argv[4]||'1880');
(async()=>{
  const {data,info}=await sharp(f).raw().toBuffer({resolveWithObject:true});
  const lin=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
  const rows=[];
  for(let y=0;y<100;y++){
    let s=0,n=0;
    for(let x=x0;x<x1;x++){const o=(y*info.width+x)*info.channels;
      s+=0.2126*lin(data[o])+0.7152*lin(data[o+1])+0.0722*lin(data[o+2]);n++;}
    rows.push({y,Y:+(s/n).toFixed(4)});
  }
  let maxStep=0,at=0;
  for(let i=1;i<rows.length;i++){const d=Math.abs(rows[i].Y-rows[i-1].Y); if(d>maxStep){maxStep=d;at=rows[i].y;}}
  console.log('rows 66..86:', rows.slice(66,87).map(r=>`${r.y}:${r.Y}`).join(' '));
  console.log('MARCHE MAX sur 0..99 =', maxStep.toFixed(4), 'a y =', at);
  // monotone check across 60..90
  let mono=true; for(let i=61;i<=90;i++){ if(rows[i].Y < rows[i-1].Y - 0.004){mono=false;} }
  console.log('rampe monotone croissante 60->90 :', mono);
})();
