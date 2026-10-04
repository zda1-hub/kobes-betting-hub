#!/usr/bin/env python3
"""Local-only site preview with read-only access to the public pick feeds."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import subprocess
import os
os.chdir(Path(__file__).resolve().parent.parent)
class Preview(SimpleHTTPRequestHandler):
    def do_GET(self):
        path=urlsplit(self.path).path
        feeds={'/preview-api/free-pick/current':'/api/free-pick/current','/preview-api/results':'/api/results'}
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
    def do_POST(self): self.send_error(405,'This preview does not accept submissions')
print('Local preview: http://127.0.0.1:4173',flush=True)
ThreadingHTTPServer(('127.0.0.1',4173),Preview).serve_forever()
