const sharp=require('sharp');
const f=process.argv[2];
(async()=>{
  const {data,info}=await sharp(f).raw().toBuffer({resolveWithObject:true});
  const W=info.width-15; // exclude scrollbar
  const lin=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
  const med=[];
  for(let y=0;y<110;y++){
    const v=[];
    for(let x=0;x<W;x+=3){const o=(y*info.width+x)*info.channels;
      v.push(0.2126*lin(data[o])+0.7152*lin(data[o+1])+0.0722*lin(data[o+2]));}
    v.sort((a,b)=>a-b); med.push(+v[Math.floor(v.length/2)].toFixed(4));
  }
  console.log('mediane par rangee, y=60..95:');
  console.log(med.slice(60,96).map((Y,i)=>`${60+i}:${Y}`).join(' '));
  let maxStep=0,at=0;
  for(let y=1;y<110;y++){const d=Math.abs(med[y]-med[y-1]); if(d>maxStep){maxStep=d;at=y;}}
  console.log('MARCHE MAX (mediane, y=0..109) =', maxStep.toFixed(4),'a y =',at);
  console.log('marche a la couture y74->76 =', Math.abs(med[76]-med[74]).toFixed(4));
})();
