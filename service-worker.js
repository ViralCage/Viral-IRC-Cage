/* Viral Cage Play offline app shell. Multiplayer still requires an internet connection. */
'use strict';
const CACHE_VERSION='vc-play-shell-v1';
const APP_SHELL=['/','/index.html','/manifest.webmanifest','/offline-icon.svg'];
const FIREBASE_SDK=[
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    for(const url of FIREBASE_SDK){
      try{
        const response=await fetch(url,{mode:'no-cors',cache:'reload'});
        if(response && (response.ok || response.type==='opaque')) await cache.put(url,response);
      }catch(error){console.warn('Could not pre-cache optional Firebase SDK:',url,error);}
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('vc-play-')&&key!==CACHE_VERSION).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const isFirebaseSdk=url.hostname==='www.gstatic.com' && url.pathname.startsWith('/firebasejs/10.12.2/');
  if(isFirebaseSdk){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_VERSION);
      const cached=await cache.match(request);
      if(cached)return cached;
      try{
        const response=await fetch(request);
        if(response.ok || response.type==='opaque')await cache.put(request,response.clone());
        return response;
      }catch(error){return Response.error();}
    })());
    return;
  }
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response && response.ok){
          const cache=await caches.open(CACHE_VERSION);
          cache.put('/index.html',response.clone()).catch(()=>{});
        }
        return response;
      }catch(error){
        const cache=await caches.open(CACHE_VERSION);
        return await cache.match('/index.html') || await cache.match('/');
      }
    })());
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_VERSION);
      const cached=await cache.match(request);
      if(cached)return cached;
      try{
        const response=await fetch(request);
        if(response.ok && (url.pathname.startsWith('/assets/') || /\.(?:css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname)))cache.put(request,response.clone()).catch(()=>{});
        return response;
      }catch(error){return cached || Response.error();}
    })());
  }
});
