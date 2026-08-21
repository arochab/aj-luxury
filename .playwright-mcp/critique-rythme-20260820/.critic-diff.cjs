const sharp = require('sharp');
const dir = process.argv[2];
const files = process.argv.slice(3);
(async () => {
  const bufs = [];
  for (const f of files) {
    const {data, info} = await sharp(dir+'/'+f).raw().toBuffer({resolveWithObject:true});
    bufs.push({f, data, info});
  }
  for (let i=1;i<bufs.length;i++){
    const a=bufs[i-1], b=bufs[i];
    if (a.info.width!==b.info.width||a.info.height!==b.info.height){console.log('size mismatch');continue;}
    const ch=a.info.channels; const n=a.info.width*a.info.height;
    let sum=0, changed=0, big=0;
    for(let p=0;p<n;p++){
      const o=p*ch;
      const d=(Math.abs(a.data[o]-b.data[o])+Math.abs(a.data[o+1]-b.data[o+1])+Math.abs(a.data[o+2]-b.data[o+2]))/3;
      sum+=d; if(d>3) changed++; if(d>16) big++;
    }
    console.log(`${a.f} -> ${b.f}  MAD=${(sum/n).toFixed(2)}/255  change>3: ${(100*changed/n).toFixed(1)}%  >16: ${(100*big/n).toFixed(1)}%  SIMILARITE=${(100-100*changed/n).toFixed(1)}%`);
  }
})();
