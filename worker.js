const RELEASE_FALLBACK = 'diagnostics-20261010-1';
const APP_PATHS = new Set(["/", "/index.html", "/app-v12", "/app-v12.html"]);

const STYLE_TAGS = [
  ["/lastset-theme.css","0138"],
  ["/lastset-premium.css","0138"],
  ["/lastset-images.css","0132"],
  ["/lastset-hotfix.css","0132"],
  ["/lastset-calendar.css","0132"],
  ["/lastset-brand.css","0139"],
  ["/lastset-identity.css","01310"],
  ["/lastset-v0140.css","01403"],
  ["/lastset-onboarding.css","0140"],
  ["/lastset-offline.css","0141"],
  ["/lastset-explore.css","0290"],
  ["/lastset-diagnostics.css","0300"],
  ["/lastset-mobility.css","0300"],
  ["/lastset-anatomy.css","0280"],
  ["/lastset-smartlog-mobile.css","0165"],
  ["/lastset-p2.css","0200"],
  ["/lastset-monitoring.css","stage2"]
];

const SCRIPT_TAGS = [
  ["/lastset-enhancements.js","0132"],
  ["/lastset-premium.js","0132"],
  ["/lastset-hotfix.js","0132"],
  ["/lastset-smartlog-shorthand.js","01402"],
  ["/lastset-core-reliability.js","0133"],
  ["/lastset-memory.js","0134"],
  ["/lastset-intelligence.js","0137"],
  ["/lastset-calendar.js","0132"],
  ["/lastset-workouts.js","0132"],
  ["/lastset-integrity.js","0132"],
  ["/lastset-profile-equipment.js","0135"],
  ["/lastset-muscle-library.js","0290"],
  ["/lastset-navigation.js","0141"],
  ["/lastset-beta.js","1beta1"],
  ["/lastset-brand.js","0139"],
  ["/lastset-identity.js","01401"],
  ["/lastset-v0140.js","01403"],
  ["/lastset-onboarding.js","0140"],
  ["/lastset-offline.js","0141"],
  ["/lastset-atlas-regions.js","0282"],
  ["/lastset-anatomy.js","0282"],
  ["/lastset-explore.js","0290"],
  ["/lastset-mobility.js","0300"],
  ["/lastset-smartlog-p1.js","0165"],
  ["/lastset-smartlog-mobile.js","0167"],
  ["/lastset-p2.js","0200"],
  ["/lastset-monitoring.js","stage2"]
];

async function getReleaseId(env){
  try{
    const response=await env.ASSETS.fetch('https://lastset.local/lastset-build.json');
    if(response.ok){
      const meta=await response.json();
      if(/^[A-Za-z0-9_-]{5,32}$/.test(meta.id))return meta.id;
    }
  }catch(_){}
  return RELEASE_FALLBACK;
}

// Replace ALL local JS/CSS versions after optional feature layers have been injected.
// Query parameters change only between builds, not with every page refresh.
function stampExternalAssets(html,version){
  return html.replace(/<(script|link)\b[^>]*>/gi,tag=>
    tag.replace(/\b(src|href)=(["'])([^"']+)\2/gi,(match,key,quote,raw)=>{
      if(/^(https?:)?\/\//i.test(raw)||raw.startsWith('data:'))return match;
      const found=raw.match(/^([^?#]+\.(?:js|css))(\?[^#]*)?(#.*)?$/i);
      if(!found)return match;
      const params=new URLSearchParams((found[2]||'').slice(1));
      params.delete('v');params.set('v',version);
      return key+'='+quote+found[1]+'?'+params.toString()+(found[3]||'')+quote;
    })
  );
}

function injectPremiumLayer(html,version) {
  let output = html;
  if(!output.includes('lastset-diagnostics.js')){
    output=output.replace('</head>','<link rel="stylesheet" href="/lastset-diagnostics.css?v='+version+'">\n<script src="/lastset-diagnostics.js?v='+version+'"></script>\n</head>');
  }

  for (const [path, version] of STYLE_TAGS) {
    const name = path.split("/").pop();
    if (!output.includes(name)) {
      output = output.replace("</head>", `<link rel="stylesheet" href="${path}?v=${version}">\n</head>`);
    }
  }

  for (const [path, version] of SCRIPT_TAGS) {
    const name = path.split("/").pop();
    if (!output.includes(name)) {
      output = output.replace("</body>", `<script src="${path}?v=${version}"></script>\n</body>`);
    }
  }

  output = output.replace(
    '<meta name="theme-color" content="#0b1220" />',
    '<meta name="theme-color" content="#090713" />'
  );

  const releaseTag='<meta name="lastset-release" content="'+version+'">';
  if(!output.includes('name="lastset-release"'))output=output.replace('</head>',releaseTag+'\n</head>');
  return stampExternalAssets(output,version);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if(request.method==='GET'&&url.pathname==='/lastset-build.json'){
      const release=await getReleaseId(env);
      return new Response(JSON.stringify({id:release,schema:1}),{headers:{'content-type':'application/json','cache-control':'no-store, max-age=0'}});
    }

    if (request.method === "GET" && APP_PATHS.has(url.pathname)) {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/index.html";
      assetUrl.search = "";

      const assetResponse = await env.ASSETS.fetch(
        new Request(assetUrl.toString(), {
          method: "GET",
          headers: request.headers
        })
      );

      if (!assetResponse.ok) return assetResponse;

      const html = injectPremiumLayer(await assetResponse.text(),await getReleaseId(env));
      const headers = new Headers(assetResponse.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-store, max-age=0");

      return new Response(html, { status: 200, headers });
    }

    const response=await env.ASSETS.fetch(request);
    if(request.method==='GET'&&/\.(?:js|css)$/i.test(url.pathname)&&response.ok){
      const headers=new Headers(response.headers);
      headers.set('cache-control','no-store, max-age=0');
      if(url.pathname==='/service-worker.js')headers.set('service-worker-allowed','/');
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }
    return response;
  }
};
