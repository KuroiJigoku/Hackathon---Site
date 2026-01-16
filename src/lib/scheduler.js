// Background scheduler for importing remote attendance JSON into SQLite
import { doRemoteImport } from '../pages/api/import_remote.json.js';

let timer = null;
let running = false;

// Default interval: 20s (20000ms) unless IMPORT_INTERVAL_MS is set
const DEFAULT_MS = Number(process.env.IMPORT_INTERVAL_MS || 20000);

export function startScheduler(intervalMs = DEFAULT_MS, runImmediately = true){
  if(timer) return { started: false, reason: 'already running' };
  const ms = Number(intervalMs) || DEFAULT_MS;
  // run immediately once if requested
  if(runImmediately){
    (async ()=>{
      try{ running = true; await doRemoteImport(); } catch(e){ console.warn('scheduler initial import failed', e); } finally{ running = false; }
    })();
  }
  timer = setInterval(async ()=>{
    if(running) return; // skip overlapping runs
    running = true;
    try{
      await doRemoteImport();
    } catch(e){ console.warn('scheduler import failed', e); }
    finally{ running = false; }
  }, ms);
  return { started: true, intervalMs: ms };
}

export function stopScheduler(){
  if(timer){ clearInterval(timer); timer = null; running = false; return { stopped: true }; }
  return { stopped: false, reason: 'not running' };
}
