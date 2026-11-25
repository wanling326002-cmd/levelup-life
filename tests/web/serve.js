// Tiny static server for testing offline/install (serves a copy of the site folder, with ETags like the live host).
const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const ROOT=process.argv[2], PORT=+process.argv[3]||8765;
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.woff2':'font/woff2','.txt':'text/plain'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p.endsWith('/')) p+='index.html';
  const f=path.join(ROOT,path.normalize(p).replace(/^(\.\.[\/\\])+/,''));
  fs.readFile(f,(err,data)=>{ if(err){ res.writeHead(404,{'Content-Type':'text/html'}); return res.end('<h1>404</h1>'); }
    const etag='"'+crypto.createHash('md5').update(data).digest('hex')+'"';
    if(req.headers['if-none-match']===etag){ res.writeHead(304,{ETag:etag}); return res.end(); }
    res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream','Cache-Control':'public,max-age=0,must-revalidate',ETag:etag}); res.end(data); });
}).listen(PORT,()=>console.log('serving',ROOT,'on',PORT));
