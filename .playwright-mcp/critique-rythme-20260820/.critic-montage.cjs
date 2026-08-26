const sharp=require('sharp');
const out=process.argv[2], files=process.argv.slice(3);
(async()=>{
  const W=620,H=349;
  const bufs=[];
  for(const f of files) bufs.push(await sharp(f).resize(W,H,{fit:'fill'}).toBuffer());
  const img=sharp({create:{width:W*bufs.length+8*(bufs.length-1),height:H,channels:3,background:'#000'}});
  await img.composite(bufs.map((b,i)=>({input:b,left:i*(W+8),top:0}))).png().toFile(out);
  console.log('ok',out);
})();
