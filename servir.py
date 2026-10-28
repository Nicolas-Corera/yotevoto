"""Servidor local sin caché: python servir.py  (puerto 8123, o PORT=...). Cortalo con Ctrl+C.
Manda las mismas cabeceras de seguridad que _headers (menos HSTS, que no aplica a HTTP local),
así la CSP se prueba en local antes de publicar. Lee la CSP de _headers y le suma el stack local."""
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

LOCAL = "http://127.0.0.1:55321 ws://127.0.0.1:55321"


def leer_cabeceras():
    cab = {}
    for linea in open("_headers", encoding="utf-8"):
        m = re.match(r"\s+([\w-]+):\s*(.+)", linea)
        if m and m.group(1).lower() != "strict-transport-security":
            cab[m.group(1)] = m.group(2).strip()
    csp = cab["Content-Security-Policy"].replace("; upgrade-insecure-requests", "")
    cab["Content-Security-Policy"] = csp.replace("connect-src 'self'", f"connect-src 'self' {LOCAL}")
    return cab


CABECERAS = leer_cabeceras()


class SinCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        for k, v in CABECERAS.items():
            self.send_header(k, v)
        super().end_headers()


ThreadingHTTPServer(("", int(os.environ.get("PORT", "8123"))), SinCache).serve_forever()
