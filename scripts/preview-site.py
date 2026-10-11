#!/usr/bin/env python3
"""Local-only site preview with read-only access to the public pick feeds."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import json
import subprocess
import os
os.chdir(Path(__file__).resolve().parent.parent)
class Preview(SimpleHTTPRequestHandler):
    def do_GET(self):
        path=urlsplit(self.path).path
        feeds={'/preview-api/free-pick/gate':'/api/free-pick/gate','/preview-api/free-pick/current':'/api/free-pick/current','/preview-api/results':'/api/results'}
        if path in feeds:
            try:
                result=subprocess.run(['curl','-sS','--max-time','15','-w','\n%{http_code}','https://bettinghub-publisher.kobedirwin.workers.dev'+feeds[path]],capture_output=True,check=True)
                payload,status=result.stdout.rsplit(b'\n',1)
                self.send_response(int(status));self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(payload)
            except Exception:
                self.send_error(502,'Public feed unavailable')
            return
        if any(part.startswith('.') for part in Path(path).parts) or path.endswith(('.toml','.gs','.py','.md','.csv')):
            self.send_error(404);return
        # Match production's extensionless public routes during local review.
        if not Path(path.lstrip('/')).suffix and path!='/' and Path(path.lstrip('/')+'.html').is_file():
            self.path=path+'.html'
        return super().do_GET()
    def do_POST(self):
        # Opt-in local fixture only: never forwards a POST or sends email.
        if os.environ.get('KBH_PREVIEW_FREE_PICK_FIXTURE') != '1' or urlsplit(self.path).path != '/preview-api/free-pick/unlock':
            self.send_error(405,'This preview does not accept submissions'); return
        size=int(self.headers.get('Content-Length','0'))
        if size>4096: self.send_error(413); return
        try:
            fields=json.loads(self.rfile.read(size))
            if '@' not in str(fields.get('email','')) or fields.get('legalAge') is not True or fields.get('consent') is not True:
                self.send_error(400,'Invalid preview form'); return
            result=subprocess.run(['curl','-sS','--max-time','15','https://bettinghub-publisher.kobedirwin.workers.dev/api/free-pick/current'],capture_output=True,check=True)
            pick=json.loads(result.stdout)
            payload=json.dumps({'ok':True,'hasPick':True,'pick':pick,'preview':True}).encode()
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(payload)
        except Exception: self.send_error(502,'Preview fixture unavailable')
port=int(os.environ.get('KBH_PREVIEW_PORT','4173'))
print(f'Local preview: http://127.0.0.1:{port}',flush=True)
ThreadingHTTPServer(('127.0.0.1',port),Preview).serve_forever()
