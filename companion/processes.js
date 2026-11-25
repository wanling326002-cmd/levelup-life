// Reads the list of running programs on Windows, with the least access Windows offers.
//  - CreateToolhelp32Snapshot lists process ids and executable names (no access to the processes needed).
//  - For the full path, each process is opened with PROCESS_QUERY_LIMITED_INFORMATION only: it can't read memory,
//    write, inject, or control the process. Games protected by anti-cheat may refuse even that; then only the name is used.
// The list stays inside the app: only programs matched to a tracked game ever leave this computer.
'use strict';
const {execFile} = require('child_process');

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000, TH32CS_SNAPPROCESS = 0x2;

function createWin32Source() {
  const koffi = require('koffi');
  const k32 = koffi.load('kernel32.dll');
  koffi.pointer('HANDLE', koffi.opaque()); // registers the HANDLE type used in the signatures below
  const ENTRY = koffi.struct('LEVELUP_PROCESSENTRY32W', {
    dwSize: 'uint32_t', cntUsage: 'uint32_t', th32ProcessID: 'uint32_t', th32DefaultHeapID: 'uintptr_t', th32ModuleID: 'uint32_t',
    cntThreads: 'uint32_t', th32ParentProcessID: 'uint32_t', pcPriClassBase: 'int32_t', dwFlags: 'uint32_t', szExeFile: koffi.array('char16_t', 260, 'String'),
  });
  const CreateToolhelp32Snapshot = k32.func('HANDLE __stdcall CreateToolhelp32Snapshot(uint32_t dwFlags, uint32_t th32ProcessID)');
  const Process32FirstW = k32.func('bool __stdcall Process32FirstW(HANDLE hSnapshot, _Inout_ LEVELUP_PROCESSENTRY32W *lppe)');
  const Process32NextW = k32.func('bool __stdcall Process32NextW(HANDLE hSnapshot, _Inout_ LEVELUP_PROCESSENTRY32W *lppe)');
  const OpenProcess = k32.func('HANDLE __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)');
  const QueryFullProcessImageNameW = k32.func('bool __stdcall QueryFullProcessImageNameW(HANDLE hProcess, uint32_t dwFlags, _Out_ uint8_t *lpExeName, _Inout_ uint32_t *lpdwSize)');
  const CloseHandle = k32.func('bool __stdcall CloseHandle(HANDLE hObject)');
  const size = koffi.sizeof(ENTRY);
  const addr = h => (h === null || h === undefined ? 0n : BigInt(typeof h === 'bigint' ? h : koffi.address(h)));
  const INVALID = (1n << 64n) - 1n;
  const pathCache = new Map(); // "pid|name" -> path ('' when Windows wouldn't tell us)

  function fullPath(pid) {
    const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (!addr(h)) return '';
    try {
      const buf = Buffer.alloc(32768 * 2), len = [32768];
      if (!QueryFullProcessImageNameW(h, 0, buf, len)) return '';
      return buf.toString('utf16le', 0, len[0] * 2);
    } finally { CloseHandle(h); }
  }

  return {
    kind: 'win32',
    async list() {
      const snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
      const a = addr(snap);
      if (!a || a === INVALID || a === -1n) throw new Error('process snapshot failed');
      const out = [], seen = new Set();
      try {
        const e = {dwSize: size};
        for (let ok = Process32FirstW(snap, e); ok; ok = Process32NextW(snap, e)) {
          const pid = e.th32ProcessID, name = e.szExeFile;
          if (pid === 0 || pid === 4) { e.dwSize = size; continue; } // System Idle Process and System
          const key = pid + '|' + name; seen.add(key);
          if (!pathCache.has(key)) pathCache.set(key, fullPath(pid));
          out.push({pid, name, path: pathCache.get(key)});
          e.dwSize = size;
        }
      } finally { CloseHandle(snap); }
      for (const k of pathCache.keys()) if (!seen.has(k)) pathCache.delete(k);
      return out;
    },
  };
}

// Backup when the native helper can't load: names only, from the built-in tasklist command.
function createTasklistSource() {
  return {
    kind: 'tasklist',
    list: () => new Promise((resolve, reject) => {
      execFile('tasklist', ['/fo', 'csv', '/nh'], {windowsHide: true, maxBuffer: 8 * 1024 * 1024}, (err, out) => {
        if (err) return reject(err);
        resolve(out.split(/\r?\n/).filter(Boolean).map(l => { const c = l.match(/"([^"]*)"/g) || []; return {name: (c[0] || '').replace(/"/g, ''), pid: Number((c[1] || '').replace(/"/g, '')) || 0, path: ''}; }).filter(p => p.name));
      });
    }),
  };
}

function createProcessSource() {
  if (process.platform !== 'win32') return {kind: 'none', list: async () => []};
  try { return createWin32Source(); } catch { return createTasklistSource(); }
}

// `reg query KEY /s` for the scanners (read-only).
function readReg(key) {
  return new Promise((resolve, reject) => execFile('reg', ['query', key, '/s'], {windowsHide: true, maxBuffer: 32 * 1024 * 1024}, (err, out) => err ? reject(err) : resolve(out)));
}

module.exports = {createProcessSource, createWin32Source, createTasklistSource, readReg};
